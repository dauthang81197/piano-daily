'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardLayout } from '@/lib/midi/keyboard-layout';
import type { PlayerNote } from '@/lib/midi/note-json';
import { buildHandPath } from '@/lib/midi/hands/hand-path';
import type { HandsScene } from './hands-scene';

/**
 * Lớp phủ bàn tay 3D lên phím đàn. `three` chỉ được nạp (import động) khi lớp phủ này được dựng, tức khi người dùng
 * bật công tắc. Khi đang phát, tự vẽ theo `getTime()` mỗi khung hình; khi dừng, vẽ lại theo `position`. Lỗi tạo WebGL
 * không ném ra ngoài mà báo qua `onUnavailable`.
 */
export default function HandsOverlay({
  notes,
  layout,
  playing,
  position,
  getTime,
  onUnavailable,
}: {
  notes: readonly PlayerNote[];
  layout: KeyboardLayout;
  playing: boolean;
  /** Vị trí phát (giây) khi không phát. */
  position: number;
  /** Vị trí phát hiện tại (giây), gọi mỗi khung hình khi đang phát. */
  getTime: () => number;
  onUnavailable: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<HandsScene | null>(null);
  const [ready, setReady] = useState(false);
  const path = useMemo(() => buildHandPath(notes, layout), [notes, layout]);
  const latest = useRef({ path, time: position, onUnavailable });

  useEffect(() => {
    latest.current.path = path;
    latest.current.onUnavailable = onUnavailable;
  });

  const draw = useCallback((t: number) => {
    latest.current.time = t;
    sceneRef.current?.render(latest.current.path.poseAt(t));
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let observer: ResizeObserver | undefined;
    let scene: HandsScene | undefined;
    const fit = () => {
      scene?.resize(canvas.clientWidth, canvas.clientHeight);
      draw(latest.current.time);
    };
    (async () => {
      try {
        const { createHandsScene } = await import('./hands-scene');
        if (cancelled) return;
        scene = createHandsScene(canvas, layout.whiteKeys);
        sceneRef.current = scene;
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
  }, [layout.whiteKeys, draw]);

  // Khi dừng/tua: vẽ lại đúng vị trí. Khi đổi bài (path mới) cũng vẽ lại.
  useEffect(() => {
    if (ready && !playing) draw(position);
  }, [ready, playing, position, path, draw]);

  // Khi đang phát: vẽ mượt theo đồng hồ của lõi phát.
  useEffect(() => {
    if (!ready || !playing) return;
    let raf = 0;
    const loop = () => {
      draw(getTime());
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, playing, getTime, draw]);

  return <canvas ref={canvasRef} aria-hidden="true" data-testid="hands-canvas" className="pointer-events-none absolute inset-0 h-full w-full" />;
}
