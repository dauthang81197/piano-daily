import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import type { ParsedNotes } from '@/lib/midi/note-json';

const loadVexflow = vi.fn();
const renderSystem = vi.fn();
vi.mock('@/lib/midi/notation/render', async () => {
  const actual = await vi.importActual<typeof import('@/lib/midi/notation/render')>('@/lib/midi/notation/render');
  return { ...actual, loadVexflow: (...a: unknown[]) => loadVexflow(...a), renderSystem: (...a: unknown[]) => renderSystem(...a) };
});

import NotationView from './notation-view';

const U = 120;
const note = (midi: number, s: number, d: number, track = 0) => ({
  midi,
  name: 'x',
  time: s * 0.125,
  duration: d * 0.125,
  velocity: 0.8,
  track,
  ticks: s * U,
  durationTicks: d * U,
});
/** Hai ô nhịp 4/4 ở 120 BPM: mỗi ô 2 giây. */
const parsed: ParsedNotes = {
  notes: [note(72, 0, 8), note(74, 8, 8), note(76, 16, 8), note(77, 24, 8)],
  duration: 4,
  header: { ppq: 480, tempos: [{ ticks: 0, bpm: 120 }], timeSignatures: [{ ticks: 0, numerator: 4, denominator: 4 }] },
};

/** Vẽ giả: mỗi hợp âm (không lặng) một <g>, x theo giây; không cần VexFlow thật trong jsdom. */
function fakeRender(_vex: unknown, container: HTMLElement, notation: import('@/lib/midi/notation/quantize').Notation, system: { measures: number[]; widths: number[] }) {
  const elements = new Map<number, SVGElement>();
  const anchors: { sec: number; x: number }[] = [];
  const measures: { index: number; x: number; width: number }[] = [];
  let x = 0;
  system.measures.forEach((index, i) => {
    const m = notation.measures[index]!;
    for (const e of [...m.treble, ...m.bass]) {
      if (e.keys.length === 0) continue;
      const el = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      container.appendChild(el);
      elements.set(e.id, el);
      anchors.push({ sec: e.startSec, x: x + e.start * 5 });
    }
    anchors.push({ sec: m.endSec, x: x + system.widths[i]! });
    measures.push({ index, x, width: system.widths[i]! });
    x += system.widths[i]!;
  });
  return { width: x, height: 190, elements, anchors, measures };
}

describe('NotationView', () => {
  beforeEach(() => {
    loadVexflow.mockReset().mockResolvedValue({});
    renderSystem.mockReset().mockImplementation(fakeRender);
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 900 });
    Element.prototype.scrollTo = vi.fn() as never;
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLElement.prototype, 'clientWidth');
  });

  const view = (position: number, onSeek = vi.fn()) => withIntl(<NotationView parsed={parsed} position={position} onSeek={onSeek} title="Gam Đô" />, 'vi');

  it('dựng khuông sau khi nạp VexFlow, có nhãn truy cập và ghi chú gần đúng', async () => {
    render(view(0));
    await waitFor(() => expect(renderSystem).toHaveBeenCalled());
    expect(screen.getByRole('img', { name: 'Khuông nhạc của Gam Đô' })).toBeInTheDocument();
    expect(screen.getByText(/bản hiển thị gần đúng/)).toBeInTheDocument();
  });

  it('hợp âm đang vang được tô, đổi vị trí thì đổi nốt tô; vạch phát hiện ra', async () => {
    const { rerender, container } = render(view(0.1));
    await waitFor(() => expect(container.querySelectorAll('[data-notation-active="true"]').length).toBeGreaterThan(0));
    const first = container.querySelector('[data-notation-active="true"]');
    rerender(view(1.2));
    await waitFor(() => {
      const active = container.querySelectorAll('[data-notation-active="true"]');
      expect(active).toHaveLength(1);
      expect(active[0]).not.toBe(first);
    });
    expect(screen.getByTestId('notation-playhead')).toBeInTheDocument();
    rerender(view(3.9));
    await waitFor(() => expect(container.querySelectorAll('[data-notation-active="true"]')).toHaveLength(1));
  });

  it('bấm vào một ô nhịp thì tua tới đầu ô đó', async () => {
    const onSeek = vi.fn();
    const { container } = render(view(0, onSeek));
    await waitFor(() => expect(renderSystem).toHaveBeenCalled());
    const wrapper = container.querySelector('.cursor-pointer')!;
    const width = (renderSystem.mock.results[0]!.value as { measures: { width: number }[] }).measures[0]!.width;
    wrapper.getBoundingClientRect = () => ({ left: 0 }) as DOMRect;
    fireEvent.click(wrapper, { clientX: width + 5 });
    expect(onSeek).toHaveBeenCalledWith(2);
    fireEvent.click(wrapper, { clientX: 5 });
    expect(onSeek).toHaveBeenLastCalledWith(0);
  });

  it('VexFlow nạp lỗi: báo ngắn, không ném', async () => {
    loadVexflow.mockRejectedValue(new Error('x'));
    render(view(0));
    expect(await screen.findByRole('status')).toHaveTextContent('Không dựng được khuông nhạc');
  });

  it('dựng SVG ném lỗi: báo ngắn', async () => {
    renderSystem.mockImplementation(() => {
      throw new Error('vf');
    });
    render(view(0));
    expect(await screen.findByRole('status')).toHaveTextContent('Không dựng được khuông nhạc');
  });

  it('note-JSON thiếu tick/header: báo ngắn, không gọi VexFlow vẽ', async () => {
    render(withIntl(<NotationView parsed={{ notes: parsed.notes }} position={0} onSeek={vi.fn()} title="t" />, 'vi'));
    expect(await screen.findByRole('status')).toHaveTextContent('Không dựng được khuông nhạc');
    expect(renderSystem).not.toHaveBeenCalled();
  });

  it('bài dài hơn giới hạn: ghi chú chỉ hiển thị phần đầu', async () => {
    const long: ParsedNotes = { ...parsed, notes: [note(72, 0, 4), note(72, 16 * 130, 4)] };
    render(withIntl(<NotationView parsed={long} position={0} onSeek={vi.fn()} title="t" />, 'vi'));
    expect(await screen.findByText(/chỉ hiển thị 120 ô nhịp đầu/)).toBeInTheDocument();
    await act(async () => undefined);
  });
});
