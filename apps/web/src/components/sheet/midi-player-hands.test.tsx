import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { resetAudioClaims } from '@/lib/midi/audio-exclusive';
import type { AudioPort } from '@/lib/midi/player-core';
import { MidiPlayer, type MidiPlayerDeps } from './midi-player';

const canShowHands = vi.fn();
vi.mock('@/lib/midi/hands/capabilities', () => ({ canShowHands: () => canShowHands() }));

const overlayProps = vi.fn();
vi.mock('./piano-view', () => ({
  default: (props: { onUnavailable: () => void; showHands: boolean }) => {
    overlayProps(props);
    return (
      <button type="button" data-testid="fake-overlay" data-hands={props.showHands} onClick={props.onUnavailable}>
        piano 3d
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

const SVG_LABEL = 'Virtual piano keyboard for Für Elise';

describe('MidiPlayer - phím đàn 3D và bàn tay', () => {
  beforeEach(() => {
    resetAudioClaims();
    canShowHands.mockReset().mockReturnValue(true);
    localStorage.clear();
    overlayProps.mockClear();
    vi.stubGlobal('AudioContext', class {});
  });

  it('chưa bấm phát: chỉ có phím SVG tĩnh, không công tắc, không nạp cảnh 3D', () => {
    setup();
    expect(screen.getByRole('img', { name: SVG_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show hands' })).toBeNull();
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
  });

  it('player sẵn sàng: cảnh 3D thay phím SVG, bàn tay bật mặc định, có ghi chú mô phỏng', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const view = await screen.findByTestId('fake-overlay');
    expect(view).toHaveAttribute('data-hands', 'true');
    expect(screen.queryByRole('img', { name: SVG_LABEL })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show hands' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/simulated suggestion/)).toBeInTheDocument();
    expect(overlayProps.mock.calls.at(-1)![0].notes).toHaveLength(2);
    expect(overlayProps.mock.calls.at(-1)![0].label).toBe(SVG_LABEL);
  });

  it('tắt công tắc chỉ ẩn bàn tay (cảnh vẫn còn) và được nhớ cho lần sau', async () => {
    const { unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const toggle = screen.getByRole('button', { name: 'Show hands' });
    fireEvent.click(toggle);
    expect(screen.getByTestId('fake-overlay')).toHaveAttribute('data-hands', 'false');
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/simulated suggestion/)).toBeNull();
    expect(localStorage.getItem('piano-daily:show-hands')).toBe('off');
    unmount();

    // Lần sau mở trang: vẫn tắt tay.
    resetAudioClaims();
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(await screen.findByTestId('fake-overlay')).toHaveAttribute('data-hands', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Show hands' }));
    expect(screen.getByTestId('fake-overlay')).toHaveAttribute('data-hands', 'true');
    expect(localStorage.getItem('piano-daily:show-hands')).toBe('on');
  });

  it('không có WebGL hoặc giảm chuyển động: giữ phím SVG, không công tắc, player vẫn dùng được', async () => {
    canShowHands.mockReturnValue(false);
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByRole('button', { name: 'Show hands' })).toBeNull();
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
    expect(screen.getByRole('img', { name: SVG_LABEL })).toBeInTheDocument();
  });

  it('cảnh 3D báo không dùng được (lỗi WebGL hoặc model): quay về phím SVG và ẩn công tắc', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    fireEvent.click(await screen.findByTestId('fake-overlay'));
    expect(screen.queryByTestId('fake-overlay')).toBeNull();
    expect(screen.getByRole('img', { name: SVG_LABEL })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Show hands' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });
});
