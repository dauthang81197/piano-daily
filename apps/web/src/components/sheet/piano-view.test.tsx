import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHandPath, HAND_LEAD } from '@/lib/midi/hands/hand-path';
import { layoutKeyboard } from '@/lib/midi/keyboard-layout';
import type { PlayerNote } from '@/lib/midi/note-json';

const scene = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn(), stats: vi.fn(() => null as unknown) };
const createPianoScene = vi.fn();
vi.mock('./piano-scene', () => ({ createPianoScene: (...args: unknown[]) => createPianoScene(...args) }));

import PianoView, { HAND_MODEL_URL } from './piano-view';

const notes: PlayerNote[] = [
  { midi: 60, name: 'C4', time: 0, duration: 1, velocity: 0.8 },
  { midi: 40, name: 'E2', time: 1, duration: 1, velocity: 0.8 },
];
const layout = layoutKeyboard(notes);

function setup(props: Partial<Parameters<typeof PianoView>[0]> = {}) {
  const onUnavailable = vi.fn();
  const utils = render(
    <PianoView
      notes={notes}
      layout={layout}
      playing={false}
      position={0}
      getTime={() => 0.5}
      showHands
      label="Phím đàn 3D"
      onUnavailable={onUnavailable}
      {...props}
    />,
  );
  return { onUnavailable, ...utils };
}

describe('PianoView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPianoScene.mockResolvedValue(scene);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('nạp cảnh với bố cục và model, canvas có nhãn và là role img', async () => {
    const { getByTestId } = setup({ position: 0.5 });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    expect(createPianoScene).toHaveBeenCalledWith(getByTestId('piano-canvas'), layout, HAND_MODEL_URL, { debug: false });
    expect(HAND_MODEL_URL).toBe('/models/hand-right.glb');
    expect(getByTestId('piano-canvas')).toHaveAttribute('role', 'img');
    expect(getByTestId('piano-canvas')).toHaveAttribute('aria-label', 'Phím đàn 3D');
  });

  it('khung vẽ gồm phím đang bấm, nốt rơi và tư thế hai tay tại vị trí hiện tại', async () => {
    setup({ position: 0.5, showHands: true });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    const frame = scene.render.mock.calls.at(-1)![0];
    expect([...frame.active]).toEqual([60]);
    expect(frame.falling.length).toBeGreaterThan(0);
    expect(frame.pose.right ?? frame.pose.left).not.toBeNull();
    expect(frame.showHands).toBe(true);
  });

  it('tư thế lấy sớm HAND_LEAD so với thời gian phát, và khung mang thời gian phát để biết tua', async () => {
    setup({ position: 0.5, showHands: true });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    const frame = scene.render.mock.calls.at(-1)![0];
    expect(frame.time).toBe(0.5);
    expect(frame.pose).toEqual(buildHandPath(notes, layout).poseAt(0.5 + HAND_LEAD));
  });

  it('khung vẽ báo `still` khi không phát và không `still` khi đang phát', async () => {
    const { rerender, onUnavailable } = setup({ position: 0.5, playing: false });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    expect(scene.render.mock.calls.at(-1)![0].still).toBe(true);
    rerender(
      <PianoView notes={notes} layout={layout} playing position={0.5} getTime={() => 0.7} showHands label="x" onUnavailable={onUnavailable} />,
    );
    await waitFor(() => expect(scene.render.mock.calls.at(-1)![0].time).toBe(0.7));
    expect(scene.render.mock.calls.at(-1)![0].still).toBe(false);
  });

  it('mặc định (và =0, =false) không có lớp phủ debug, không thu số liệu, không tạo bộ đếm giờ 500 ms', async () => {
    const timers = vi.spyOn(globalThis, 'setInterval');
    try {
      for (const search of ['/', '/?handsDebug=0', '/?handsDebug=false']) {
        window.history.pushState({}, '', search);
        createPianoScene.mockClear();
        const view = setup();
        await waitFor(() => expect(createPianoScene).toHaveBeenCalledWith(expect.anything(), layout, HAND_MODEL_URL, { debug: false }));
        view.unmount();
      }
      expect(screen.queryByTestId('hands-debug')).not.toBeInTheDocument();
      expect(scene.stats).not.toHaveBeenCalled();
      expect(timers.mock.calls.filter(([, delay]) => delay === 500)).toHaveLength(0);
    } finally {
      timers.mockRestore();
      window.history.pushState({}, '', '/');
    }
  });

  it('URL có ?handsDebug=1: tạo cảnh ở chế độ debug và hiện số liệu', async () => {
    window.history.pushState({}, '', '/?handsDebug=1');
    scene.stats.mockReturnValue({ frames: 10, fps: 60, renderMs: { p50: 1, p95: 2.5, max: 3 }, jointStep: { p50: 0.01, p95: 0.05, max: 0.1 } });
    try {
      setup();
      await waitFor(() => expect(createPianoScene).toHaveBeenCalledWith(expect.anything(), layout, HAND_MODEL_URL, { debug: true }));
      expect(await screen.findByTestId('hands-debug', undefined, { timeout: 2000 })).toHaveTextContent('60 fps · xử lý p95 2.5 ms · bước khớp max 0.10 rad');
    } finally {
      window.history.pushState({}, '', '/');
    }
  });

  it('tắt bàn tay: vẫn vẽ phím và nốt rơi, chỉ cờ showHands tắt', async () => {
    const { rerender, onUnavailable } = setup({ showHands: true });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    rerender(
      <PianoView notes={notes} layout={layout} playing={false} position={0} getTime={() => 0} showHands={false} label="x" onUnavailable={onUnavailable} />,
    );
    await waitFor(() => expect(scene.render.mock.calls.at(-1)![0].showHands).toBe(false));
  });

  it('vẽ lại khi tua lúc dừng', async () => {
    const { rerender, onUnavailable } = setup({ position: 0 });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    const before = scene.render.mock.calls.length;
    rerender(
      <PianoView notes={notes} layout={layout} playing={false} position={1.5} getTime={() => 0} showHands label="x" onUnavailable={onUnavailable} />,
    );
    await waitFor(() => expect(scene.render.mock.calls.length).toBeGreaterThan(before));
  });

  it('đang phát: vẽ mỗi khung hình theo getTime', async () => {
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    const getTime = vi.fn(() => 0.25);
    setup({ playing: true, getTime });
    await waitFor(() => expect(frames.length).toBeGreaterThan(0));
    act(() => frames.shift()!(0));
    expect(getTime).toHaveBeenCalled();
  });

  it('gỡ component thì dispose cảnh', async () => {
    const { unmount } = setup();
    await waitFor(() => expect(createPianoScene).toHaveBeenCalled());
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it('không tạo được cảnh (WebGL hoặc model lỗi) thì báo onUnavailable, không ném lỗi', async () => {
    createPianoScene.mockRejectedValue(new Error('no webgl'));
    const { onUnavailable } = setup();
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
    expect(scene.render).not.toHaveBeenCalled();
  });

  it('gỡ trước khi cảnh tạo xong thì dispose cảnh đó, không báo lỗi', async () => {
    let resolve!: (s: typeof scene) => void;
    createPianoScene.mockReturnValue(new Promise((r) => (resolve = r)));
    const { unmount, onUnavailable } = setup();
    unmount();
    resolve(scene);
    await waitFor(() => expect(scene.dispose).toHaveBeenCalledTimes(1));
    expect(onUnavailable).not.toHaveBeenCalled();
  });
});
