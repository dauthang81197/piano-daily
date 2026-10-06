'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { layoutKeyboard, NoteIndex } from '@/lib/midi/keyboard-layout';
import type { ParsedNotes } from '@/lib/midi/note-json';
import { PlayerCore, PLAYBACK_RATES, type AudioPort } from '@/lib/midi/player-core';
import { fetchNoteJson } from '@/lib/midi/fetch-note-json';
import { createToneAudio, hasWebAudio, unlockAudioContext } from '@/lib/midi/tone-audio';
import { PianoKeyboard } from './piano-keyboard';

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

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/** Cập nhật hình tối đa ~30 khung/giây. */
const FRAME_MS = 33;

const clock = (seconds: number) => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

type Phase = 'idle' | 'loading' | 'ready' | 'error';

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
  deps = defaultDeps,
}: {
  noteJsonUrl: string;
  title: string;
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
  const mounted = useRef(true);
  const coreRef = useRef<PlayerCore | null>(null);
  /** Đang kéo thanh tua: vòng cập nhật hình không ghi đè vị trí người dùng đang chọn. */
  const scrubTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    mounted.current = true;
    // Thiếu Web Audio: chỉ biết được ở trình duyệt, nên đổi sau khi mount.
    setSupported(hasWebAudio());
    return () => {
      mounted.current = false;
      clearTimeout(scrubTimer.current);
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

  const onToggle = useCallback(async () => {
    if (phase === 'loading') return;
    if (phase === 'ready' && coreRef.current) {
      const c = coreRef.current;
      if (playing) {
        c.pause();
        setPosition(c.position());
        setPlaying(false);
      } else {
        c.play();
        setPlaying(true);
      }
      return;
    }

    setPhase('loading');
    // Mở khoá AudioContext đồng bộ trong cử chỉ bấm, trước mọi await (Safari/iOS).
    const unlocked = unlockAudioContext();
    const [audioResult, jsonResult] = await Promise.allSettled([
      withTimeout(deps.loadAudio(unlocked), LOAD_TIMEOUT_MS),
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
      audio?.dispose();
      if (!mounted.current) return;
      setErrorKind((err as { reason?: unknown })?.reason === 'empty' ? 'empty' : 'load');
      setPhase('error');
    }
  }, [deps, noteJsonUrl, phase, playing, rate]);

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
  const onRate = (value: number) => {
    setRate(value);
    coreRef.current?.setRate(value);
  };

  if (!supported) {
    return (
      <section aria-labelledby="sheet-player" className="flex flex-col gap-3">
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
    <section aria-labelledby="sheet-player" className="flex flex-col gap-3">
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
      </div>

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

      <PianoKeyboard layout={layout} active={activeMidi} falling={view.falling} label={t('keyboardLabel', { title })} />

      <p className="text-body-md text-on-surface" aria-live="off">
        <span className="text-on-surface-variant">{t('nowPlaying')}</span>{' '}
        <span data-testid="now-playing">{activeNames.length > 0 ? activeNames.join(' ') : '—'}</span>
      </p>

      <p className="text-caption text-on-surface-variant">{t('simulatedNote')}</p>
    </section>
  );
}
