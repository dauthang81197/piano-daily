import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { resetAudioClaims } from '@/lib/midi/audio-exclusive';
import type { AudioPort } from '@/lib/midi/player-core';
import { MidiPlayer, type MidiPlayerDeps } from './midi-player';

let throwInView = false;
vi.mock('./notation-view', () => ({
  default: ({ title, position }: { title: string; position: number }) => {
    if (throwInView) throw new Error('chunk/draw failed');
    return (
      <div data-testid="notation" data-position={position}>
        {title}
      </div>
    );
  },
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
  afterEach(() => {
    vi.unstubAllGlobals();
    throwInView = false;
  });

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

  it('chuyển sang phím đàn: ẩn khuông, hiện phím, nhớ lựa chọn; mở lại player thì vẫn ở phím đàn; chuyển về khuông được', async () => {
    const first = render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    expect(screen.getByRole('button', { name: 'Keyboard and hands' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard and hands' }));
    expect(localStorage.getItem('piano-daily:player-view')).toBe('piano');
    expect(screen.queryByText(/appears when you press play/)).toBeNull();
    expect(screen.getByRole('img', { name: /Virtual piano keyboard/ })).toBeInTheDocument();
    first.unmount();
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    expect(await screen.findByRole('button', { name: 'Keyboard and hands' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByTestId('notation')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Staff notation' }));
    expect(await screen.findByTestId('notation')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /Virtual piano keyboard/ })).toBeNull();
  });

  it('zoom khuông nhạc: 100% mặc định, bước 10%, giới hạn 70%–200%, nhớ lựa chọn; vô hiệu ở chế độ phím đàn', () => {
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    expect(screen.getByText('100%')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in the staff' }));
    expect(screen.getByText('110%')).toBeInTheDocument();
    expect(localStorage.getItem('piano-daily:player-zoom')).toBe('1.1');
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom in the staff' }));
    expect(screen.getByText('200%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in the staff' })).toBeDisabled();
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Zoom out the staff' }));
    expect(screen.getByText('70%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom out the staff' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Keyboard and hands' }));
    expect(screen.getByRole('button', { name: 'Zoom in the staff' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Zoom out the staff' })).toBeDisabled();
  });

  it('khuông ném lỗi (hoặc chunk lazy không tải được): chỉ hiện thông báo, player và nút vẫn chạy', async () => {
    throwInView = true;
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(await screen.findByText(/Could not build the notation/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('localStorage ném lỗi: mặc định bật khuông, không vỡ', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" notation deps={deps()} />));
    expect(screen.getByRole('button', { name: 'Staff notation' })).toHaveAttribute('aria-pressed', 'true');
    vi.restoreAllMocks();
  });
});
