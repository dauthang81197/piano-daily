'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { layoutKeyboard, NoteIndex } from '@/lib/midi/keyboard-layout';
import type { ParsedNotes } from '@/lib/midi/note-json';
import { PlayerCore, PLAYBACK_RATES, type AudioPort } from '@/lib/midi/player-core';
import { fetchNoteJson } from '@/lib/midi/fetch-note-json';
import { canShowHands } from '@/lib/midi/hands/capabilities';
import { claimAudio } from '@/lib/midi/audio-exclusive';
import {
  clearViewSettings,
  DEFAULT_VIEW_SETTINGS,
  readViewSettings,
  sanitizeViewSettings,
  type ViewSettings,
  writeViewSettings,
} from '@/lib/midi/scene3d/view-settings';
import { closeAudioContext, createToneAudio, hasWebAudio, unlockAudioContext } from '@/lib/midi/tone-audio';
import { withTimeout, withTimeoutDispose } from '@/lib/midi/with-timeout';
import { PianoKeyboard } from './piano-keyboard';
import { ViewSettingsPanel } from './view-settings-panel';

// Cảnh 3D (kéo theo `three` và model bàn tay) chỉ được nạp khi player đã sẵn sàng sau lần bấm Play đầu tiên.
const PianoView = lazy(() => import('./piano-view'));
// Khuông nhạc (VexFlow) cũng chỉ nạp sau lần bấm Play đầu tiên của player có bật `notation`.
const NotationView = lazy(() => import('./notation-view'));

export interface MidiPlayerDeps {
  /**
   * Tải Tone.js và dùng AudioContext đã được mở khoá đồng bộ trong cử chỉ bấm (chỉ gọi trong handler của lần bấm
   * đầu tiên).
   */
  loadAudio: (unlocked?: AudioContext) => Promise<AudioPort>;
  /** Tải note-JSON công khai. */
  fetchJson: (url: string) => Promise<unknown>;
}

const defaultDeps: MidiPlayerDeps = {
  loadAudio: createToneAudio,
  fetchJson: fetchNoteJson,
};

/** Quá thời gian này mà Tone.js chưa sẵn sàng (mạng treo, context bị chặn) thì báo lỗi để thử lại. */
export const LOAD_TIMEOUT_MS = 15_000;
/** Kéo thanh tua: chỉ áp dụng vị trí mới sau khoảng lặng này, tránh khởi động lại phát ở mỗi bước kéo. */
const SEEK_COMMIT_MS = 150;

/** Cập nhật hình tối đa ~30 khung/giây. */
const FRAME_MS = 33;

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Phase = 'idle' | 'loading' | 'ready' | 'error';

/** Player rộng khoảng 77% chiều ngang cửa sổ (thoát khỏi cột nội dung, căn giữa theo cửa sổ). */
const PLAYER_WIDTH = 'relative left-1/2 flex w-[77vw] -translate-x-1/2 flex-col gap-3';

const HANDS_PREF_KEY = 'piano-daily:show-hands';
const NOTATION_PREF_KEY = 'piano-daily:show-notation';

/** Bàn tay bật mặc định; chỉ khi người dùng từng tắt thì mới tắt. Bộ nhớ trình duyệt có thể bị chặn nên bọc try/catch. */
function readHandsPref(): boolean {
  try {
    return localStorage.getItem(HANDS_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

/** Khuông nhạc bật mặc định; chỉ khi người dùng từng tắt thì mới tắt. */
function readNotationPref(): boolean {
  try {
    return localStorage.getItem(NOTATION_PREF_KEY) !== 'off';
  } catch {
    return true;
  }
}

function writeNotationPref(on: boolean) {
  try {
    localStorage.setItem(NOTATION_PREF_KEY, on ? 'on' : 'off');
  } catch {
    // Không lưu được thì thôi: lần sau vẫn bật mặc định.
  }
}

function writeHandsPref(on: boolean) {
  try {
    localStorage.setItem(HANDS_PREF_KEY, on ? 'on' : 'off');
  } catch {
    // Không lưu được thì thôi: lần sau vẫn bật mặc định.
  }
}

const control =
  'rounded-sm border border-outline-variant bg-surface-bright px-2 py-1 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/**
 * MIDI player (Story 2.8): chỉ đọc note-JSON công khai (không bao giờ file `.mid` gốc). Vào trang chỉ hiện khối tĩnh;
 * Tone.js và note-JSON chỉ được tải trong handler của lần bấm đầu tiên (cử chỉ người dùng mở AudioContext), nên
 * không bao giờ tự phát và không chặn SSR.
 */
export function MidiPlayer({
  noteJsonUrl,
  title,
  notation = false,
  deps = defaultDeps,
}: {
  noteJsonUrl: string;
  title: string;
  /** Hiện khuông nhạc bên trái, cảnh bàn tay/phím bên phải (trang bài học). Mặc định tắt: trang sheet không đổi. */
  notation?: boolean;
  deps?: MidiPlayerDeps;
}) {
  const t = useTranslations('Player');
  const [supported, setSupported] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [errorKind, setErrorKind] = useState<'load' | 'empty'>('load');
  const [parsed, setParsed] = useState<ParsedNotes | null>(null);
  const [core, setCore] = useState<PlayerCore | null>(null);
  const [playing, setPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [rate, setRate] = useState(1);
  /** Môi trường dùng được cảnh 3D (WebGL, không giảm chuyển động) và cảnh chưa báo lỗi. */
  const [view3dAvailable, setView3dAvailable] = useState(false);
  /** Lựa chọn của người dùng: mặc định bật, nhớ lại lần tắt gần nhất. */
  const [handsPref, setHandsPref] = useState(true);
  /** Góc nhìn và màu của cảnh 3D: mặc định, rồi đọc từ trình duyệt sau khi mount (tránh lệch hydration). */
  const [viewSettings, setViewSettings] = useState<ViewSettings>({ ...DEFAULT_VIEW_SETTINGS });
  const [viewOpen, setViewOpen] = useState(false);
  const [notationPref, setNotationPref] = useState(true);
  const use3d = view3dAvailable && phase === 'ready' && parsed !== null;
  const handsOn = use3d && handsPref;
  const mounted = useRef(true);
  const coreRef = useRef<PlayerCore | null>(null);
  /** Đang kéo thanh tua: vòng cập nhật hình không ghi đè vị trí người dùng đang chọn. */
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** Quyền phát âm thanh toàn trang (một nguồn tại một thời điểm, xem `audio-exclusive`). */
  const releaseClaim = useRef<(() => void) | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    // Thiếu Web Audio: chỉ biết được ở trình duyệt, nên đổi sau khi mount.
    setSupported(hasWebAudio());
    setView3dAvailable(canShowHands());
    setHandsPref(readHandsPref());
    setNotationPref(readNotationPref());
    setViewSettings(readViewSettings());
    return () => {
      mounted.current = false;
      clearTimeout(scrubTimer.current);
      releaseClaim.current?.();
      coreRef.current?.dispose();
      coreRef.current = null;
    };
  }, []);

  // Vòng cập nhật hình chỉ chạy khi đang phát.
  useEffect(() => {
    if (!playing || !core) return;
    let raf = 0;
    let last = 0;
    const loop = (ts: number) => {
      if (ts - last >= FRAME_MS && scrubTimer.current === undefined) {
        last = ts;
        setPosition(core.position());
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, core]);

  const layout = useMemo(() => layoutKeyboard(parsed?.notes ?? []), [parsed]);
  const index = useMemo(() => new NoteIndex(parsed?.notes ?? []), [parsed]);
  const view = useMemo(() => index.window(position), [index, position]);
  const activeMidi = useMemo(() => new Set(view.active.map((n) => n.midi)), [view]);
  // Chỉ liệt kê nốt có phím trên bàn phím (nốt ngoài dải vẫn phát nhưng không có phím để sáng).
  const activeNames = useMemo(
    () =>
      [...new Map(view.active.filter((n) => layout.byMidi.has(n.midi)).map((n) => [n.midi, n.name])).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, name]) => name),
    [view, layout],
  );

  /** Nguồn khác (nghe thử trên thẻ) bắt đầu phát: tạm dừng player chính, không huỷ trạng thái. */
  const pauseExternally = useCallback(() => {
    const c = coreRef.current;
    if (!c || !mounted.current) return;
    c.pause();
    setPosition(c.position());
    setPlaying(false);
  }, []);

  const claim = useCallback(() => {
    releaseClaim.current?.();
    releaseClaim.current = claimAudio('main-player', pauseExternally);
  }, [pauseExternally]);

  const onToggle = useCallback(async () => {
    if (phase === 'loading') return;
    if (phase === 'ready' && coreRef.current) {
      const c = coreRef.current;
      if (playing) {
        c.pause();
        releaseClaim.current?.();
        setPosition(c.position());
        setPlaying(false);
      } else {
        claim();
        c.play();
        setPlaying(true);
      }
      return;
    }

    setPhase('loading');
    // Bắt đầu nghe ở player chính thì dừng mọi nghe thử trên thẻ ngay từ lúc bấm (kể cả khi còn đang tải).
    claim();
    // Mở khoá AudioContext đồng bộ trong cử chỉ bấm, trước mọi await (Safari/iOS).
    const unlocked = unlockAudioContext();
    const [audioResult, jsonResult] = await Promise.allSettled([
      withTimeoutDispose(deps.loadAudio(unlocked), LOAD_TIMEOUT_MS),
      withTimeout(deps.fetchJson(noteJsonUrl), LOAD_TIMEOUT_MS),
    ]);
    const audio = audioResult.status === 'fulfilled' ? audioResult.value : null;
    try {
      if (!audio || jsonResult.status === 'rejected') throw new Error('load');
      // `note-json` (kéo theo zod) chỉ nạp khi bấm phát, không nằm trong bundle ban đầu của trang.
      const { parseNoteJson } = await import('@/lib/midi/note-json');
      const data = parseNoteJson(jsonResult.value);
      if (!mounted.current) {
        audio.dispose();
        return;
      }
      const next = new PlayerCore({
        notes: data.notes,
        duration: data.duration,
        audio,
        onEnd: () => {
          releaseClaim.current?.();
          if (!mounted.current) return;
          setPlaying(false);
          setPosition(0);
        },
      });
      next.setRate(rate);
      coreRef.current = next;
      setCore(next);
      setParsed(data);
      setPhase('ready');
      next.play();
      setPlaying(true);
    } catch (err) {
      if (audio) audio.dispose();
      else closeAudioContext(unlocked);
      releaseClaim.current?.();
      if (!mounted.current) return;
      setErrorKind((err as { reason?: unknown })?.reason === 'empty' ? 'empty' : 'load');
      setPhase('error');
    }
  }, [claim, deps, noteJsonUrl, phase, playing, rate]);

  // Kéo thanh tua: cập nhật hình ngay, nhưng chỉ áp vào lõi phát khi ngừng kéo (debounce). Sau khi áp, lấy lại vị trí
  // thật từ lõi (tua tới cuối bài thì lõi đã tự dừng và về 0).
  const onSeek = (value: number) => {
    setPosition(value);
    clearTimeout(scrubTimer.current);
    scrubTimer.current = setTimeout(() => {
      scrubTimer.current = undefined;
      const c = coreRef.current;
      if (!c) return;
      c.seek(value);
      setPosition(c.position());
      setPlaying(c.state === 'playing');
    }, SEEK_COMMIT_MS);
  };
  const getTime = useCallback(() => coreRef.current?.position() ?? 0, []);
  const onViewUnavailable = useCallback(() => setView3dAvailable(false), []);
  const onToggleHands = () => {
    const next = !handsPref;
    setHandsPref(next);
    writeHandsPref(next);
  };
  const onToggleNotation = () => {
    const next = !notationPref;
    setNotationPref(next);
    writeNotationPref(next);
  };
  const onViewChange = (next: ViewSettings) => {
    const clean = sanitizeViewSettings(next);
    setViewSettings(clean);
    writeViewSettings(clean);
  };
  const onViewReset = () => {
    setViewSettings({ ...DEFAULT_VIEW_SETTINGS });
    clearViewSettings();
  };
  const onRate = (value: number) => {
    setRate(value);
    coreRef.current?.setRate(value);
  };

  if (!supported) {
    return (
      <section aria-labelledby="sheet-player" className={PLAYER_WIDTH}>
        <h2 id="sheet-player" className="font-display text-headline-sm text-on-surface">
          {t('title')}
        </h2>
        <p role="status" className="text-body-md text-on-surface-variant">
          {t('unsupported')}
        </p>
      </section>
    );
  }

  const duration = parsed?.duration ?? 0;
  const label =
    phase === 'loading' ? t('loading') : phase === 'ready' ? (playing ? t('pause') : t('play')) : t('playPractice');

  return (
    <section aria-labelledby="sheet-player" className={PLAYER_WIDTH}>
      <h2 id="sheet-player" className="font-display text-headline-sm text-on-surface">
        {t('title')}
      </h2>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={onToggle}
          disabled={phase === 'loading'}
          aria-pressed={phase === 'ready' ? playing : undefined}
          aria-busy={phase === 'loading' || undefined}
        >
          {label}
        </Button>

        <label className="flex items-center gap-2 text-caption text-on-surface-variant">
          {t('speedLabel')}
          <select
            value={rate}
            onChange={(e) => onRate(Number(e.target.value))}
            disabled={phase === 'loading'}
            className={control}
          >
            {PLAYBACK_RATES.map((r) => (
              <option key={r} value={r}>
                {t('speedOption', { rate: r })}
              </option>
            ))}
          </select>
        </label>

        {use3d ? (
          <button type="button" onClick={onToggleHands} aria-pressed={handsOn} className={control}>
            {t('handsToggle')}
          </button>
        ) : null}

        {notation ? (
          <button type="button" onClick={onToggleNotation} aria-pressed={notationPref} className={control}>
            {t('notationToggle')}
          </button>
        ) : null}

        {use3d ? (
          <button
            type="button"
            onClick={() => setViewOpen((open) => !open)}
            aria-expanded={viewOpen}
            aria-controls={viewOpen ? 'view-settings-panel' : undefined}
            className={control}
          >
            {t('viewSettingsToggle')}
          </button>
        ) : null}
      </div>

      {use3d && viewOpen ? (
        <ViewSettingsPanel id="view-settings-panel" value={viewSettings} onChange={onViewChange} onReset={onViewReset} />
      ) : null}

      {phase === 'error' ? (
        <p role="alert" className="text-body-md text-error">
          {errorKind === 'empty' ? t('errorEmpty') : t('errorLoad')}
        </p>
      ) : null}

      <div className="flex items-center gap-3">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.1}
          value={Math.min(position, duration || 1)}
          disabled={phase !== 'ready'}
          aria-label={t('seekLabel')}
          aria-valuetext={`${clock(position)} / ${clock(duration)}`}
          onChange={(e) => onSeek(Number(e.target.value))}
          className="h-2 w-full accent-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        />
        <span className="shrink-0 text-caption tabular-nums text-on-surface-variant">
          {clock(position)} / {clock(duration)}
        </span>
      </div>

      <div className={notation && notationPref ? 'grid gap-4 lg:grid-cols-2' : 'contents'}>
        {notation && notationPref ? (
          parsed ? (
            <Suspense fallback={null}>
              <NotationView parsed={parsed} position={position} onSeek={onSeek} title={title} />
            </Suspense>
          ) : (
            <p className="rounded-md bg-surface-container-low p-3 text-body-md text-on-surface-variant">{t('notationHint')}</p>
          )
        ) : null}
        {use3d && parsed ? (
          <Suspense fallback={null}>
            <PianoView
              notes={parsed.notes}
              layout={layout}
              playing={playing}
              position={position}
              getTime={getTime}
              showHands={handsPref}
              label={t('keyboardLabel', { title })}
              onUnavailable={onViewUnavailable}
              view={viewSettings}
            />
          </Suspense>
        ) : (
          <PianoKeyboard layout={layout} active={activeMidi} falling={view.falling} label={t('keyboardLabel', { title })} />
        )}
      </div>

      <p className="text-body-md text-on-surface" aria-live="off">
        <span className="text-on-surface-variant">{t('nowPlaying')}</span>{' '}
        <span data-testid="now-playing">{activeNames.length > 0 ? activeNames.join(' ') : '—'}</span>
      </p>

      <p className="text-caption text-on-surface-variant">{t('simulatedNote')}</p>
      {handsOn ? <p className="text-caption text-on-surface-variant">{t('handsNote')}</p> : null}
    </section>
  );
}
