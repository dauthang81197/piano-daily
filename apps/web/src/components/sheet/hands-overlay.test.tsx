import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { layoutKeyboard } from '@/lib/midi/keyboard-layout';
import type { PlayerNote } from '@/lib/midi/note-json';

const scene = { render: vi.fn(), resize: vi.fn(), dispose: vi.fn() };
const createHandsScene = vi.fn();
vi.mock('./hands-scene', () => ({ createHandsScene: (...args: unknown[]) => createHandsScene(...args) }));

import HandsOverlay from './hands-overlay';

const notes: PlayerNote[] = [
  { midi: 60, name: 'C4', time: 0, duration: 1, velocity: 0.8 },
  { midi: 40, name: 'E2', time: 1, duration: 1, velocity: 0.8 },
];
const layout = layoutKeyboard(notes);

function setup(props: Partial<Parameters<typeof HandsOverlay>[0]> = {}) {
  const onUnavailable = vi.fn();
  const utils = render(
    <HandsOverlay notes={notes} layout={layout} playing={false} position={0} getTime={() => 0.5} onUnavailable={onUnavailable} {...props} />,
  );
  return { onUnavailable, ...utils };
}

describe('HandsOverlay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createHandsScene.mockReturnValue(scene);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('tạo cảnh theo số phím trắng, vẽ tư thế tại vị trí hiện tại và đặt canvas không bắt chuột', async () => {
    const { getByTestId } = setup({ position: 0.5 });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    expect(createHandsScene).toHaveBeenCalledWith(getByTestId('hands-canvas'), layout.whiteKeys);
    const pose = scene.render.mock.calls.at(-1)![0];
    expect(pose.right).not.toBeNull();
    expect(getByTestId('hands-canvas')).toHaveAttribute('aria-hidden', 'true');
    expect(getByTestId('hands-canvas').className).toContain('pointer-events-none');
  });

  it('vẽ lại khi tua lúc dừng', async () => {
    const { rerender, onUnavailable } = setup({ position: 0 });
    await waitFor(() => expect(scene.render).toHaveBeenCalled());
    const before = scene.render.mock.calls.length;
    rerender(
      <HandsOverlay notes={notes} layout={layout} playing={false} position={1.5} getTime={() => 0} onUnavailable={onUnavailable} />,
    );
    await waitFor(() => expect(scene.render.mock.calls.length).toBeGreaterThan(before));
  });

  it('đang phát: vẽ mỗi khung hình theo getTime, ngừng vẽ khi dừng', async () => {
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
    await waitFor(() => expect(createHandsScene).toHaveBeenCalled());
    unmount();
    expect(scene.dispose).toHaveBeenCalledTimes(1);
  });

  it('không tạo được WebGL thì báo onUnavailable thay vì ném lỗi', async () => {
    createHandsScene.mockImplementation(() => {
      throw new Error('no webgl');
    });
    const { onUnavailable } = setup();
    await waitFor(() => expect(onUnavailable).toHaveBeenCalledTimes(1));
  });
});
