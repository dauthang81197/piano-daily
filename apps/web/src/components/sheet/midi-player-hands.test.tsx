import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { resetAudioClaims } from '@/lib/midi/audio-exclusive';
import type { AudioPort } from '@/lib/midi/player-core';
import { DEFAULT_VIEW_SETTINGS, VIEW_LIMITS, VIEW_STORAGE_KEY } from '@/lib/midi/scene3d/view-settings';
import { MidiPlayer, type MidiPlayerDeps } from './midi-player';

const canShowHands = vi.fn();
vi.mock('@/lib/midi/hands/capabilities', () => ({ canShowHands: () => canShowHands() }));

const overlayProps = vi.fn();
const lastView = () => overlayProps.mock.calls.at(-1)![0].view;
vi.mock('./piano-view', () => ({
  default: (props: { onUnavailable: () => void; showHands: boolean; view?: unknown }) => {
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

describe('MidiPlayer - tuỳ chỉnh góc nhìn và màu', () => {
  beforeEach(() => {
    resetAudioClaims();
    canShowHands.mockReset().mockReturnValue(true);
    localStorage.clear();
    overlayProps.mockClear();
    vi.stubGlobal('AudioContext', class {});
  });

  const TOGGLE = 'Customize 3D view';
  const ready = async () => {
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    await screen.findByTestId('fake-overlay');
  };

  it('chưa sẵn sàng hoặc không có 3D thì không có nút mở bảng; có 3D thì có, bảng đóng sẵn', async () => {
    setup();
    expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull();
    await ready();
    const toggle = screen.getByRole('button', { name: TOGGLE });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // `aria-controls` chỉ trỏ tới bảng khi bảng có trong DOM (đang mở).
    expect(toggle).not.toHaveAttribute('aria-controls');
    expect(screen.queryByRole('group', { name: /Customize the 3D view/ })).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-controls', 'view-settings-panel');
    expect(document.getElementById('view-settings-panel')).not.toBeNull();
  });

  it('không WebGL: không nút, không bảng', async () => {
    canShowHands.mockReturnValue(false);
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByRole('button', { name: TOGGLE })).toBeNull();
  });

  it('mặc định truyền cài đặt mặc định xuống cảnh; mở bảng rồi chỉnh thì cảnh nhận ngay và lưu vào trình duyệt', async () => {
    setup();
    await ready();
    expect(lastView()).toEqual(DEFAULT_VIEW_SETTINGS);
    fireEvent.click(screen.getByRole('button', { name: TOGGLE }));
    expect(screen.getByRole('button', { name: TOGGLE })).toHaveAttribute('aria-expanded', 'true');
    fireEvent.change(screen.getByLabelText(/Tilt/), { target: { value: '33' } });
    fireEvent.change(screen.getByLabelText('Hand color'), { target: { value: '#3366ff' } });
    expect(lastView()).toMatchObject({ elevation: 33, handColor: '#3366ff' });
    expect(JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY)!)).toMatchObject({ elevation: 33, handColor: '#3366ff' });
  });

  it('lần sau mở trang: khôi phục cài đặt đã lưu (đã làm sạch giá trị ngoài giới hạn)', async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ elevation: 999, azimuth: 12, noteBlackColor: '#112233', handColor: 'red' }));
    setup();
    await ready();
    expect(lastView()).toMatchObject({
      elevation: VIEW_LIMITS.elevation.max,
      azimuth: 12,
      noteBlackColor: '#112233',
      handColor: DEFAULT_VIEW_SETTINGS.handColor,
    });
  });

  it('đặt lại mặc định: về mặc định và xoá mục đã lưu', async () => {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify({ zoom: 1.4 }));
    setup();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: TOGGLE }));
    expect(lastView().zoom).toBe(1.4);
    fireEvent.click(screen.getByRole('button', { name: 'Reset to default' }));
    expect(lastView()).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(localStorage.getItem(VIEW_STORAGE_KEY)).toBeNull();
  });

  it('bộ nhớ bị chặn: vẫn chỉnh được trong phiên', async () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    setup();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: TOGGLE }));
    fireEvent.change(screen.getByLabelText(/Zoom/), { target: { value: '1.3' } });
    expect(lastView().zoom).toBe(1.3);
  });

  it('chỉnh cài đặt độc lập với công tắc bàn tay', async () => {
    setup();
    await ready();
    fireEvent.click(screen.getByRole('button', { name: TOGGLE }));
    fireEvent.change(screen.getByLabelText(/Rotate left/), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Show hands' }));
    expect(screen.getByTestId('fake-overlay')).toHaveAttribute('data-hands', 'false');
    expect(lastView().azimuth).toBe(15);
  });
});
