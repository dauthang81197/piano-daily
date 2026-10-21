'use client';

import { useTranslations } from 'next-intl';
import { lazy, Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { layoutKeyboard, NoteIndex } from '@/lib/midi/keyboard-layout';
import type { ParsedNotes } from '@/lib/midi/note-json';
import { baseBpm, DEFAULT_BPM, rateForBpm, START_BPM, stepBpm } from '@/lib/midi/bpm';
import { clampTranspose, shiftNotes } from '@/lib/midi/transpose';
import { PlayerCore, type AudioPort } from '@/lib/midi/player-core';
import { fetchNoteJson } from '@/lib/midi/fetch-note-json';
import { canShowHands } from '@/lib/midi/hands/capabilities';
import { claimAudio } from '@/lib/midi/audio-exclusive';
import { calloutCardClass } from './download-button-class';
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
import { clearLoop, LOOP_OFF, type LoopState, loopRange, setPointA, setPointB, toggleLoop } from '@/components/player/loop';
import { LoopPanel } from '@/components/player/loop-panel';
import { type MixerGains, MixerPanel } from '@/components/player/mixer-panel';
import { PlayerProgress } from '@/components/player/player-progress';
import { PlayerToolbar } from '@/components/player/player-toolbar';
import {
  clampZoom,
  type PlayerView,
  readDark,
  readView,
  readZoom,
  writeDark,
  writeView,
  writeZoom,
  ZOOM_STEP,
} from '@/components/player/player-prefs';
import { useFullscreen } from '@/components/player/use-fullscreen';
import { cn } from '@/lib/cn';
import { PianoKeyboard } from './piano-keyboard';
import { NotationBoundary } from './notation-boundary';
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

const PLAYER_WIDTH = calloutCardClass;

const HANDS_PREF_KEY = 'piano-daily:show-hands';

/** Bàn tay bật mặc định; chỉ khi người dùng từng tắt thì mới tắt. Bộ nhớ trình duyệt có thể bị chặn nên bọc try/catch. */
function readHandsPref(): boolean {
  try {
    return localStorage.getItem(HANDS_PREF_KEY) !== 'off';
  } catch {
    return true;
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
  'min-h-11 rounded-md border border-outline-variant bg-surface-bright px-3 py-1 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

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
  const [rate, setRate] = useState(() => rateForBpm(DEFAULT_BPM, START_BPM));
  /** Môi trường dùng được cảnh 3D (WebGL, không giảm chuyển động) và cảnh chưa báo lỗi. */
  const [view3dAvailable, setView3dAvailable] = useState(false);
  /** Lựa chọn của người dùng: mặc định bật, nhớ lại lần tắt gần nhất. */
  const [handsPref, setHandsPref] = useState(true);
  /** Góc nhìn và màu của cảnh 3D: mặc định, rồi đọc từ trình duyệt sau khi mount (tránh lệch hydration). */
  const [viewSettings, setViewSettings] = useState<ViewSettings>({ ...DEFAULT_VIEW_SETTINGS });
  const [viewOpen, setViewOpen] = useState(false);
  /** Chế độ xem người dùng chọn lần trước (null = chưa từng chọn: mặc định khuông nhạc nếu có, không thì phím đàn). */
  const [viewPref, setViewPref] = useState<PlayerView | null>(null);
  const [dark, setDark] = useState(false);
  const [zoom, setZoom] = useState(1);
  /** Dịch giọng, lặp và âm lượng từng tay: riêng cho từng bản nhạc, không nhớ giữa các lần mở. */
  const [transpose, setTranspose] = useState(0);
  const [loop, setLoopState] = useState<LoopState>(LOOP_OFF);
  const [gains, setGains] = useState<MixerGains>({ left: 1, right: 1 });
  const [muted, setMuted] = useState({ left: false, right: false });
  const [mixerOpen, setMixerOpen] = useState(false);
  const [loopOpen, setLoopOpen] = useState(false);
  const panelIds = useId();
  /** Giá trị mới nhất cho phần tạo lõi (chạy trong callback bất đồng bộ, tránh đọc state cũ). */
  const latest = useRef({ transpose: 0, loop: LOOP_OFF as LoopState, gains: { left: 1, right: 1 } as MixerGains, muted: { left: false, right: false } });
  useEffect(() => {
    latest.current = { transpose, loop, gains, muted };
  });
  const rootRef = useRef<HTMLElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const fullscreen = useFullscreen(rootRef);
  const wasFullscreen = useRef(false);
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
    setViewPref(readView());
    setDark(readDark());
    setZoom(readZoom());
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

  // Hình (phím, nốt rơi, khuông nhạc, bàn tay) luôn theo nốt đã dịch giọng; lõi âm thanh tự dịch lúc phát.
  const viewNotes = useMemo(() => shiftNotes(parsed?.notes ?? [], transpose), [parsed, transpose]);
  const rawLayout = useMemo(() => layoutKeyboard(viewNotes), [viewNotes]);
  // Cảnh 3D dựng lại mỗi khi `layout` đổi: chỉ đổi khi dải phím thật sự đổi (dịch vài nửa cung thường giữ nguyên dải).
  const rangeKey = `${rawLayout.keys[0]?.midi}-${rawLayout.keys[rawLayout.keys.length - 1]?.midi}`;
  const layout = useMemo(() => rawLayout, [rangeKey]);
  const notationData = useMemo(() => (parsed ? { notes: viewNotes, header: parsed.header } : null), [parsed, viewNotes]);
  const index = useMemo(() => new NoteIndex(viewNotes), [viewNotes]);
  const frame = useMemo(() => index.window(position), [index, position]);
  const activeMidi = useMemo(() => new Set(frame.active.map((n) => n.midi)), [frame]);
  // Chỉ liệt kê nốt có phím trên bàn phím (nốt ngoài dải vẫn phát nhưng không có phím để sáng).
  const activeNames = useMemo(
    () =>
      [...new Map(frame.active.filter((n) => layout.byMidi.has(n.midi)).map((n) => [n.midi, n.name])).entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, name]) => name),
    [frame, layout],
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
      const [{ parseNoteJson }, { assignHands }] = await Promise.all([import('@/lib/midi/note-json'), import('@/lib/midi/hands/hand-split')]);
      const data = parseNoteJson(jsonResult.value);
      let hands: ReturnType<typeof assignHands> | undefined;
      try {
        hands = assignHands(data.notes);
      } catch {
        // Không chia được tay thì mixer không có tác dụng, nhưng bài vẫn phát bình thường.
      }
      if (!mounted.current) {
        audio.dispose();
        return;
      }
      const next = new PlayerCore({
        notes: data.notes,
        duration: data.duration,
        audio,
        hands,
        onEnd: () => {
          releaseClaim.current?.();
          if (!mounted.current) return;
          setPlaying(false);
          setPosition(0);
        },
      });
      // Tempo gốc của bài chỉ biết sau khi tải: đưa tốc độ về đúng BPM khởi đầu (nút −/+ chưa dùng được trước lúc này).
      const startRate = rateForBpm(baseBpm(data.header), START_BPM);
      next.setRate(startRate);
      setRate(startRate);
      const now = latest.current;
      next.setTranspose(now.transpose);
      next.setHandGain('left', now.muted.left ? 0 : now.gains.left);
      next.setHandGain('right', now.muted.right ? 0 : now.gains.right);
      next.setLoop(loopRange(now.loop, data.duration));
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
  }, [claim, deps, noteJsonUrl, phase, playing]);

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
  const onView = (next: PlayerView) => {
    setViewPref(next);
    writeView(next);
  };
  const onToggleDark = () => {
    const next = !dark;
    setDark(next);
    writeDark(next);
  };
  const onZoom = (delta: 1 | -1) => {
    const next = clampZoom(zoom + delta * ZOOM_STEP);
    setZoom(next);
    writeZoom(next);
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
  const base = baseBpm(parsed?.header);
  const onBpmStep = (delta: 1 | -1) => {
    const next = stepBpm(base, rate, delta);
    if (next !== null) onRate(next);
  };
  const onTransposeStep = (delta: 1 | -1) => {
    const next = clampTranspose(transpose + delta);
    setTranspose(next);
    coreRef.current?.setTranspose(next);
  };
  const onGain = (hand: 'left' | 'right', gain: number) => {
    setGains((prev) => ({ ...prev, [hand]: gain }));
    // Kéo thanh âm lượng thì tự bật lại tiếng của tay đó.
    setMuted((prev) => ({ ...prev, [hand]: false }));
    coreRef.current?.setHandGain(hand, gain);
  };
  const onToggleMute = (hand: 'left' | 'right') => {
    const next = !muted[hand];
    setMuted((prev) => ({ ...prev, [hand]: next }));
    coreRef.current?.setHandGain(hand, next ? 0 : gains[hand]);
  };
  const applyLoop = (next: LoopState) => {
    setLoopState(next);
    coreRef.current?.setLoop(loopRange(next, parsed?.duration ?? 0));
  };
  const nowPosition = () => coreRef.current?.position() ?? position;
  const onRestart = () => {
    const c = coreRef.current;
    if (!c) return;
    c.seek(0);
    setPosition(c.position());
    setPlaying(c.state === 'playing');
  };
  // Thoát toàn màn hình (nút, Esc, hay trình duyệt tự thoát): trả focus về nút để người dùng bàn phím không bị lạc.
  useEffect(() => {
    if (wasFullscreen.current && !fullscreen.active) fullscreenButton.current?.focus();
    wasFullscreen.current = fullscreen.active;
  }, [fullscreen.active]);
  // Space bật/tắt phát khi focus nằm trong player nhưng không phải ở một điều khiển có hành vi Space riêng.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== ' ' || event.defaultPrevented) return;
    const target = event.target as HTMLElement;
    if (target.closest('button, input, select, textarea, a, [contenteditable="true"]')) return;
    event.preventDefault();
    void onToggle();
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
  const views: PlayerView[] = notation ? ['notation', 'piano'] : ['piano'];
  const view: PlayerView = notation ? (viewPref ?? 'notation') : 'piano';
  const fill = fullscreen.active;
  const keyboardLabel = t('keyboardLabel', { title });
  const progressClock = `${clock(position)} / ${clock(duration)}`;

  return (
    <section
      ref={rootRef}
      aria-labelledby="sheet-player"
      onKeyDown={onKeyDown}
      className={cn(
        PLAYER_WIDTH,
        'min-w-0',
        dark && 'player-dark text-on-surface',
        fill && 'fixed inset-0 z-50 h-dvh w-full max-w-none gap-2 overflow-y-auto rounded-none border-0 p-3 shadow-none md:p-4',
      )}
    >
      <h2 id="sheet-player" className={cn('font-display text-headline-sm text-on-surface', fill && 'sr-only')}>
        {t('title')}
      </h2>

      <PlayerToolbar
        loading={phase === 'loading'}
        playing={playing}
        idle={phase === 'idle' || phase === 'error'}
        ready={phase === 'ready'}
        clock={progressClock}
        onToggle={() => void onToggle()}
        onRestart={onRestart}
        baseBpm={base}
        rate={rate}
        onBpmStep={onBpmStep}
        transpose={transpose}
        onTransposeStep={onTransposeStep}
        loopOn={loop.on}
        onToggleLoop={() => applyLoop(toggleLoop(loop))}
        loopOptionsOpen={loopOpen}
        loopPanelId={`${panelIds}-loop`}
        onToggleLoopOptions={() => setLoopOpen((open) => !open)}
        mixerOpen={mixerOpen}
        mixerPanelId={`${panelIds}-mixer`}
        onToggleMixer={() => setMixerOpen((open) => !open)}
        dark={dark}
        onToggleDark={onToggleDark}
        views={views}
        view={view}
        onView={onView}
        zoom={zoom}
        onZoom={onZoom}
        fullscreen={fullscreen.active}
        onToggleFullscreen={() => void fullscreen.toggle()}
        fullscreenRef={fullscreenButton}
      />

      <PlayerProgress position={position} duration={duration} disabled={phase !== 'ready'} clock={progressClock} onSeek={onSeek} loop={loopRange(loop, duration)} />

      {loopOpen ? (
        <LoopPanel
          id={`${panelIds}-loop`}
          state={loop}
          position={position}
          duration={duration}
          disabled={phase !== 'ready'}
          onSetA={() => applyLoop(setPointA(loop, nowPosition()))}
          onSetB={() => applyLoop(setPointB(loop, nowPosition()))}
          onClear={() => applyLoop(clearLoop())}
        />
      ) : null}

      {mixerOpen ? <MixerPanel id={`${panelIds}-mixer`} gains={gains} muted={muted} onGain={onGain} onToggleMute={onToggleMute} /> : null}

      {phase === 'error' ? (
        <p role="alert" className="text-body-md text-error">
          {errorKind === 'empty' ? t('errorEmpty') : t('errorLoad')}
        </p>
      ) : null}

      {view === 'piano' && use3d ? (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onToggleHands} aria-pressed={handsOn} className={control}>
            {t('handsToggle')}
          </button>
          <button
            type="button"
            onClick={() => setViewOpen((open) => !open)}
            aria-expanded={viewOpen}
            aria-controls={viewOpen ? 'view-settings-panel' : undefined}
            className={control}
          >
            {t('viewSettingsToggle')}
          </button>
        </div>
      ) : null}

      {view === 'piano' && use3d && viewOpen ? (
        <ViewSettingsPanel id="view-settings-panel" value={viewSettings} onChange={onViewChange} onReset={onViewReset} />
      ) : null}

      <div className={cn('flex min-h-0 flex-col', fill && 'flex-1')}>
        {view === 'notation' ? (
          parsed ? (
            <Suspense fallback={null}>
              <NotationBoundary fallback={<p role="status" className="rounded-md bg-surface-container-low p-3 text-body-md text-on-surface-variant">{t('notationError')}</p>}>
                <NotationView parsed={notationData ?? parsed} position={position} onSeek={onSeek} title={title} zoom={zoom} fill={fill} />
              </NotationBoundary>
            </Suspense>
          ) : (
            <p className="rounded-md bg-surface-container-low p-3 text-body-md text-on-surface-variant">{t('notationHint')}</p>
          )
        ) : use3d && parsed ? (
          <Suspense fallback={null}>
            <PianoView
              notes={viewNotes}
              layout={layout}
              playing={playing}
              position={position}
              getTime={getTime}
              showHands={handsPref}
              label={keyboardLabel}
              onUnavailable={onViewUnavailable}
              view={viewSettings}
              fill={fill}
            />
          </Suspense>
        ) : (
          <PianoKeyboard layout={layout} active={activeMidi} falling={frame.falling} label={keyboardLabel} />
        )}
      </div>

      <p className="text-body-md text-on-surface" aria-live="off">
        <span className="text-on-surface-variant">{t('nowPlaying')}</span>{' '}
        <span data-testid="now-playing">{activeNames.length > 0 ? activeNames.join(' ') : '—'}</span>
      </p>

      <p className="text-caption text-on-surface-variant">{t('simulatedNote')}</p>
      {handsOn && view === 'piano' ? <p className="text-caption text-on-surface-variant">{t('handsNote')}</p> : null}
    </section>
  );
}
