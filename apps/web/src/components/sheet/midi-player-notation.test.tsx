import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { resetAudioClaims } from '@/lib/midi/audio-exclusive';
import type { AudioPort } from '@/lib/midi/player-core';
import { MidiPlayer, type MidiPlayerDeps } from './midi-player';

vi.mock('./notation-view', () => ({
  default: ({ title, position }: { title: string; position: number }) => (
    <div data-testid="notation" data-position={position}>
      {title}
    </div>
  ),
}));

const note = (midi: number, time: number, duration = 1) => ({ midi, time, duration, velocity: 0.8, name: 'x', ticks: time * 960, durationTicks: duration * 960 });
const json = {
  header: { ppq: 480, tempos: [{ ticks: 0, bpm: 120 }], timeSignatures: [{ ticks: 0, timeSignature: [4, 4] }] },
  tracks: [{ instrument: {}, notes: [note(60, 0, 2), note(67, 3, 1)] }],
};

function deps(): MidiPlayerDeps {
  const audio: AudioPort = { now: () => 10, triggerAttackRelease: vi.fn(), releaseAll: vi.fn(), dispose: vi.fn() };
  return { loadAudio: vi.fn().mockResolvedValue(audio), fetchJson: vi.fn().mockResolvedValue(json) };
}

const FIRST = 'Play & Practice this piece';

describe('MidiPlayer với khuông nhạc (C1b)', () => {
  beforeEach(() => {
    resetAudioClaims();
    vi.stubGlobal('AudioContext', class {});
    localStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('không bật `notation`: không nút Staff notation, không khuông (trang sheet không đổi)', async () => {
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" deps={deps()} />));
    expect(screen.queryByRole('button', { name: 'Staff notation' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByTestId('notation')).toBeNull();
  });

  it('bật `notation`: trước khi phát hiện gợi ý; sau Play hiện khuông kèm tên bài', async () => {
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="Gam Đô" notation deps={deps()} />));
    expect(screen.getByText(/appears when you press play/)).toBeInTheDocument();
    expect(screen.queryByTestId('notation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(await screen.findByTestId('notation')).toHaveTextContent('Gam Đô');
    expect(screen.getByRole('button', { name: 'Staff notation' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('tắt khuông: ẩn và nhớ lựa chọn; mở lại player thì vẫn tắt', async () => {
    const first = render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    fireEvent.click(screen.getByRole('button', { name: 'Staff notation' }));
    expect(localStorage.getItem('piano-daily:show-notation')).toBe('off');
    expect(screen.queryByText(/appears when you press play/)).toBeNull();
    first.unmount();
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    expect(await screen.findByRole('button', { name: 'Staff notation' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByTestId('notation')).toBeNull();
  });
});
