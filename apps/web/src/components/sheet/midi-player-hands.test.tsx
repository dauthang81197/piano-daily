import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { resetAudioClaims } from '@/lib/midi/audio-exclusive';
import type { AudioPort } from '@/lib/midi/player-core';
import { MidiPlayer, type MidiPlayerDeps } from './midi-player';

const canShowHands = vi.fn();
vi.mock('@/lib/midi/hands/capabilities', () => ({ canShowHands: () => canShowHands() }));

const overlayProps = vi.fn();
vi.mock('./hands-overlay', () => ({
  default: (props: { onUnavailable: () => void }) => {
    overlayProps(props);
    return (
      <button type="button" data-testid="fake-overlay" onClick={props.onUnavailable}>
        overlay
      </button>
    );
  },
}));

const note = (midi: number, time: number, duration = 1) => ({ midi, time, duration, velocity: 0.8, name: 'x' });
const json = { tracks: [{ instrument: {}, notes: [note(60, 0, 2), note(64, 0, 2)] }] };

function setup() {
  const audio: AudioPort = {
    now: () => 10,
    triggerAttackRelease: vi.fn(),
    releaseAll: vi.fn(),
    dispose: vi.fn(),
  };
  const deps: MidiPlayerDeps = { loadAudio: vi.fn().mockResolvedValue(audio), fetchJson: vi.fn().mockResolvedValue(json) };
  return render(withIntl(<MidiPlayer noteJsonUrl="http://cdn/notes.json" title="Für Elise" deps={deps} />));
}

const FIRST = 'Play & Practice this piece';

describe('MidiPlayer - bàn tay 3D', () => {
  beforeEach(() => {
    resetAudioClaims();
    canShowHands.mockReset().mockReturnValue(true);
    localStorage.clear();
    overlayProps.mockClear();
    vi.stubGlobal('AudioContext', class {});
  });

  it('chưa bấm phát: chưa có công tắc và không có lớp phủ (chưa có nốt, chưa nạp three)', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Show hands' })).toBeNull();
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
  });

  it('mặc định tự bật bàn tay ngay khi player sẵn sàng: nạp lớp phủ với nốt và có ghi chú mô phỏng', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(await screen.findByTestId('fake-overlay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show hands' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/simulated suggestion/)).toBeInTheDocument();
    expect(overlayProps.mock.calls.at(-1)![0].notes).toHaveLength(2);
  });

  it('tắt công tắc thì gỡ lớp phủ và được nhớ cho lần sau; bật lại thì hiện lại', async () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const toggle = screen.getByRole('button', { name: 'Show hands' });
    fireEvent.click(toggle);
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(localStorage.getItem('piano-daily:show-hands')).toBe('off');
    unmount();

    // Lần sau mở trang: vẫn tắt.
    resetAudioClaims();
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.getByRole('button', { name: 'Show hands' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show hands' }));
    expect(await screen.findByTestId('fake-overlay')).toBeInTheDocument();
    expect(localStorage.getItem('piano-daily:show-hands')).toBe('on');
  });

  it('không có WebGL hoặc giảm chuyển động: không hiện công tắc, player vẫn dùng được', async () => {
    canShowHands.mockReturnValue(false);
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByRole('button', { name: 'Show hands' })).toBeNull();
  });

  it('lớp phủ báo không dùng được: tắt bàn tay và ẩn công tắc', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    fireEvent.click(await screen.findByTestId('fake-overlay'));
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Show hands' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});
