'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildHandPath, HAND_LEAD } from '@/lib/midi/hands/hand-path';
import { NoteIndex, type KeyboardLayout } from '@/lib/midi/keyboard-layout';
import type { PlayerNote } from '@/lib/midi/note-json';
import { HandMetrics, handsDebugEnabled } from '@/lib/midi/scene3d/hand-metrics';
import { DEFAULT_VIEW_SETTINGS, type ViewSettings } from '@/lib/midi/scene3d/view-settings';
import type { PianoScene } from './piano-scene';

/** Model bàn tay (MIT, xem `public/models/LICENSE-hand.md`). */
export const HAND_MODEL_URL = '/models/hand-right.glb';
/** Tỉ lệ khung hình rộng : cao của cảnh 3D (giữ trùng `VIEW_ASPECT` trong `piano-scene.ts`, không import để khỏi kéo `three`). */
const VIEW_ASPECT = 2;

/**
 * Phím đàn 3D góc nghiêng kèm bàn tay. `three`, loader và model chỉ được nạp (import động) khi component này dựng, tức
 * sau khi người dùng bấm Play. Khi đang phát tự vẽ mỗi khung hình theo `getTime()`; khi dừng, vẽ lại theo `position`.
 * Lỗi (WebGL, model) không ném ra ngoài mà báo qua `onUnavailable` để người gọi quay về phím SVG.
 */
export default function PianoView({
  notes,
  layout,
  playing,
  position,
  getTime,
  showHands,
  label,
  onUnavailable,
  view = DEFAULT_VIEW_SETTINGS,
}: {
  notes: readonly PlayerNote[];
  layout: KeyboardLayout;
  playing: boolean;
  /** Vị trí phát (giây) khi không phát. */
  position: number;
  /** Vị trí phát hiện tại (giây), gọi mỗi khung hình khi đang phát. */
  getTime: () => number;
  showHands: boolean;
  label: string;
  onUnavailable: () => void;
  /** Góc nhìn và màu của cảnh; đổi thì áp ngay (không dựng lại cảnh). */
  view?: ViewSettings;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PianoScene | null>(null);
  const [ready, setReady] = useState(false);
  const [debugText, setDebugText] = useState<string | null>(null);
  const index = useMemo(() => new NoteIndex(notes), [notes]);
  const path = useMemo(() => buildHandPath(notes, layout), [notes, layout]);
  const latest = useRef({ index, path, showHands, playing, view, time: position, onUnavailable });

  useEffect(() => {
    latest.current.index = index;
    latest.current.path = path;
    latest.current.showHands = showHands;
    latest.current.playing = playing;
    latest.current.view = view;
    latest.current.onUnavailable = onUnavailable;
  });

  const draw = useRef((t: number) => {
    const { index: idx, path: p, showHands: hands } = latest.current;
    latest.current.time = t;
    const view = idx.window(t);
    sceneRef.current?.render({
      active: new Set(view.active.map((n) => n.midi)),
      falling: view.falling,
      pose: p.poseAt(t + HAND_LEAD),
      time: t,
      still: !latest.current.playing,
      showHands: hands,
    });
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let scene: PianoScene | undefined;
    const fit = () => {
      scene?.resize(canvas.clientWidth, canvas.clientHeight);
      draw.current(latest.current.time);
    };
    (async () => {
      try {
        const { createPianoScene } = await import('./piano-scene');
        const debug = handsDebugEnabled(window.location.search);
        const created = await createPianoScene(canvas, layout, HAND_MODEL_URL, { debug, view: latest.current.view });
        if (cancelled) {
          created.dispose();
          return;
        }
        scene = created;
        sceneRef.current = created;
        fit();
        if (typeof ResizeObserver !== 'undefined') {
          observer = new ResizeObserver(fit);
          observer.observe(canvas);
        }
        setReady(true);
      } catch {
        if (!cancelled) latest.current.onUnavailable();
      }
    })();
    return () => {
      cancelled = true;
      observer?.disconnect();
      sceneRef.current = null;
      scene?.dispose();
    };
  }, [layout]);

  // Lớp phủ số liệu chuyển động của tay: chỉ khi URL có `?handsDebug=1`; mặc định không thu và không hiện gì.
  useEffect(() => {
    if (!ready || !handsDebugEnabled(window.location.search)) return;
    const id = setInterval(() => setDebugText(HandMetrics.format(sceneRef.current?.stats() ?? null)), 500);
    return () => {
      clearInterval(id);
      setDebugText(null);
    };
  }, [ready]);

  // Đổi góc nhìn/màu: áp tại chỗ rồi vẽ lại một khung (khi đang phát, vòng vẽ tự lấy khung kế).
  useEffect(() => {
    if (!ready) return;
    sceneRef.current?.setView(view);
    if (!latest.current.playing) draw.current(latest.current.time);
  }, [ready, view]);

  // Khi dừng/tua/đổi bài/bật tắt tay: vẽ lại đúng vị trí.
  useEffect(() => {
    if (ready && !playing) draw.current(position);
  }, [ready, playing, position, index, path, showHands]);

  // Khi đang phát: vẽ mượt theo đồng hồ của lõi phát.
  useEffect(() => {
    if (!ready || !playing) return;
    let raf = 0;
    const loop = () => {
      draw.current(getTime());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, playing, getTime]);

  return (
    <div className="relative w-full overflow-hidden rounded-md border border-outline-variant bg-surface-container-low" style={{ aspectRatio: VIEW_ASPECT }}>
      <canvas ref={canvasRef} role="img" aria-label={label} data-testid="piano-canvas" className="absolute inset-0 h-full w-full" />
      {debugText && (
        <div data-testid="hands-debug" aria-hidden="true" className="absolute left-1 top-1 rounded-sm bg-black/60 px-2 py-0.5 text-caption text-white">
          {debugText}
        </div>
      )}
    </div>
  );
}
