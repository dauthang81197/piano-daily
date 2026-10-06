import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { layoutKeyboard } from '@/lib/midi/keyboard-layout';
import { noteName, type PlayerNote } from '@/lib/midi/note-json';
import { PianoKeyboard } from './piano-keyboard';

const note = (midi: number, time = 0, duration = 1): PlayerNote => ({ midi, name: noteName(midi), time, duration, velocity: 0.8 });

describe('PianoKeyboard', () => {
  const layout = layoutKeyboard([note(60), note(61), note(64)]);

  it('phím trắng surface-bright, phím đen on-surface, nhãn aria cho SVG', () => {
    const { container, getByRole } = render(<PianoKeyboard layout={layout} active={new Set()} falling={[]} label="Phím đàn" />);
    expect(getByRole('img', { name: 'Phím đàn' })).toBeInTheDocument();
    expect(container.querySelector('rect[data-midi="60"]')!.getAttribute('class')).toContain('fill-surface-bright');
    expect(container.querySelector('rect[data-midi="61"]')!.getAttribute('class')).toContain('fill-on-surface');
    expect(container.querySelectorAll('rect[data-midi]')).toHaveLength(layout.keys.length);
    // nghỉ: không có nhãn tên nốt nào.
    expect(container.querySelector('g[data-part="keys"] text')).toBeNull();
  });

  it('nốt đang phát: brass + tên nốt bằng chữ trên cả phím trắng lẫn phím đen', () => {
    const { container } = render(<PianoKeyboard layout={layout} active={new Set([60, 61])} falling={[]} label="k" />);
    for (const midi of [60, 61]) {
      const rect = container.querySelector(`rect[data-midi="${midi}"]`)!;
      expect(rect).toHaveAttribute('data-active', 'true');
      expect(rect.getAttribute('class')).toContain('fill-secondary');
    }
    const labels = [...container.querySelectorAll('g[data-part="keys"] text')].map((t) => t.textContent);
    expect(labels.sort()).toEqual(['C#4', 'C4']);
  });

  it('nốt rơi: hình chữ nhật brass đúng cột phím, có nhãn khi đủ cao và rộng', () => {
    const falling = [
      { note: note(64), top: 0.1, bottom: 0.9 },
      { note: note(61), top: 0.5, bottom: 0.52 },
    ];
    const { container } = render(<PianoKeyboard layout={layout} active={new Set()} falling={falling} label="k" />);
    const e4 = container.querySelector('[data-falling="E4"]')!;
    expect(e4.querySelector('rect')!.getAttribute('class')).toContain('fill-secondary');
    expect(e4.textContent).toBe('E4');
    const x = Number(e4.querySelector('rect')!.getAttribute('x'));
    const key = layout.byMidi.get(64)!;
    expect(x).toBeGreaterThanOrEqual(key.x);
    expect(x).toBeLessThan(key.x + key.width);
    // nốt quá thấp: không có nhãn.
    expect(container.querySelector('[data-falling="C#4"]')!.textContent).toBe('');
  });

  it('nốt ngoài dải phím bị bỏ qua, không ném', () => {
    const { container } = render(<PianoKeyboard layout={layout} active={new Set()} falling={[{ note: note(2), top: 0, bottom: 1 }]} label="k" />);
    expect(container.querySelector('[data-falling]')).toBeNull();
  });
});
