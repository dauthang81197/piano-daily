import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import type { AudioPort } from '@/lib/midi/player-core';
import { LOAD_TIMEOUT_MS, MidiPlayer, type MidiPlayerDeps } from './midi-player';

const note = (midi: number, time: number, duration = 1) => ({ midi, time, duration, velocity: 0.8, name: 'x' });
const json = { tracks: [{ instrument: {}, notes: [note(60, 0, 2), note(64, 0, 2), note(67, 3, 1)] }] };

function fakeAudio() {
  let clock = 10;
  const calls: { name: string; duration: number; time: number }[] = [];
  const audio: AudioPort & { calls: typeof calls; tick: (s: number) => void } = {
    calls,
    tick: (s) => {
      clock += s;
    },
    now: () => clock,
    triggerAttackRelease: (name, duration, time) => calls.push({ name, duration, time }),
    releaseAll: vi.fn(),
    dispose: vi.fn(),
  };
  return audio;
}

function setup(overrides: Partial<MidiPlayerDeps> = {}, audio = fakeAudio()) {
  const deps: MidiPlayerDeps = {
    loadAudio: vi.fn().mockResolvedValue(audio),
    fetchJson: vi.fn().mockResolvedValue(json),
    ...overrides,
  };
  const utils = render(withIntl(<MidiPlayer noteJsonUrl="http://cdn/notes.json" title="Für Elise" deps={deps} />));
  return { deps, audio, ...utils };
}

const FIRST = 'Play & Practice this piece';

describe('MidiPlayer', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', class {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('vào trang: khối tĩnh, KHÔNG tải Tone/note-JSON, không phát, có ghi chú mô phỏng và phím đàn', () => {
    const { deps } = setup();
    expect(deps.loadAudio).not.toHaveBeenCalled();
    expect(deps.fetchJson).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: FIRST })).toBeEnabled();
    expect(screen.getByText('Simulated playback, for reference only.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Virtual piano keyboard for Für Elise' })).toBeInTheDocument();
    expect(screen.getByLabelText('Seek within the piece')).toBeDisabled();
    expect(screen.getByTestId('now-playing')).toHaveTextContent('—');
  });

  it('ghi chú mô phỏng bằng tiếng Việt', () => {
    render(withIntl(<MidiPlayer noteJsonUrl="u" title="t" deps={{ loadAudio: vi.fn(), fetchJson: vi.fn() }} />, 'vi'));
    expect(screen.getByText('Đây là bản mô phỏng, chỉ để tham khảo.')).toBeInTheDocument();
  });

  it('bấm lần đầu: tải đúng một lần note-JSON công khai và Tone, rồi phát; nút thành Pause', async () => {
    const { deps, audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(screen.getByRole('button', { name: 'Loading player' })).toBeDisabled();
    await screen.findByRole('button', { name: 'Pause' });
    expect(deps.fetchJson).toHaveBeenCalledTimes(1);
    expect(deps.fetchJson).toHaveBeenCalledWith('http://cdn/notes.json');
    expect(deps.loadAudio).toHaveBeenCalledTimes(1);
    expect(audio.calls.map((c) => c.name)).toContain('C4');
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Seek within the piece')).toBeEnabled();
  });

  it('Pause rồi Play: dừng nốt đang ngân, không tải lại dữ liệu', async () => {
    const { deps, audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    expect(audio.releaseAll).toHaveBeenCalled();
    const play = screen.getByRole('button', { name: 'Play' });
    expect(play).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(play);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(deps.fetchJson).toHaveBeenCalledTimes(1);
    expect(deps.loadAudio).toHaveBeenCalledTimes(1);
  });

  it('phím đàn: nốt đang phát tô brass kèm tên nốt dạng chữ và dòng "Now playing"', async () => {
    const { container } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    await waitFor(() => expect(screen.getByTestId('now-playing')).toHaveTextContent('C4 E4'));
    const c4 = container.querySelector('rect[data-midi="60"]')!;
    expect(c4).toHaveAttribute('data-active', 'true');
    expect(c4.getAttribute('class')).toContain('fill-secondary');
    const keysGroup = container.querySelector('g[data-part="keys"]')!;
    expect(keysGroup.textContent).toContain('C4');
    expect(keysGroup.textContent).toContain('E4');
    const inactive = container.querySelector('rect[data-midi="62"]')!;
    expect(inactive).not.toHaveAttribute('data-active');
    expect(inactive.getAttribute('class')).toContain('fill-surface-bright');
    // phím đen không đang phát dùng on-surface.
    expect(container.querySelector('rect[data-midi="61"]')!.getAttribute('class')).toContain('fill-on-surface');
    // nốt sắp rơi (G4 ở giây 3, trong cửa sổ 2 giây khi vị trí ≥ 1) chưa hiện lúc bắt đầu.
    expect(container.querySelector('[data-falling="G4"]')).toBeNull();
  });

  it('thanh tua: đổi vị trí và hiển thị thời gian', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const seek = screen.getByLabelText('Seek within the piece') as HTMLInputElement;
    fireEvent.change(seek, { target: { value: '3.5' } });
    expect(Number(seek.value)).toBeCloseTo(3.5);
    expect(screen.getByText(/0:03 \/ 0:04/)).toBeInTheDocument();
    // tại 3.5s nốt G4 (bắt đầu 3, dài 1) đang phát.
    await waitFor(() => expect(screen.getByTestId('now-playing')).toHaveTextContent('G4'));
  });

  it('dropdown tốc độ có 0.5x–2x và đổi được', async () => {
    const { audio } = setup();
    const select = screen.getByLabelText('Speed') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['0.5x', '0.75x', '1x', '1.25x', '1.5x', '2x']);
    fireEvent.change(select, { target: { value: '0.5' } });
    expect(select.value).toBe('0.5');
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    // ở 0.5x, nốt dài 2 giây phát trong 4 giây thực.
    expect(audio.calls.find((c) => c.name === 'C4')!.duration).toBeCloseTo(4);
    fireEvent.change(select, { target: { value: '2' } });
    expect(select.value).toBe('2');
  });

  it('thiếu Web Audio: thay player bằng thông báo, không có nút phát', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    const { deps } = setup();
    await screen.findByText(/does not support Web Audio/);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(deps.fetchJson).not.toHaveBeenCalled();
  });

  it('lỗi tải: thông báo lỗi, nút bấm lại được và thử lại thành công', async () => {
    const fetchJson = vi.fn().mockRejectedValueOnce(new Error('net')).mockResolvedValue(json);
    const { audio } = setup({ fetchJson });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(audio.dispose).toHaveBeenCalledTimes(1);
    const retry = screen.getByRole('button', { name: FIRST });
    expect(retry).toBeEnabled();
    fireEvent.click(retry);
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(fetchJson).toHaveBeenCalledTimes(2);
  });

  it('Tone không tải được: thông báo lỗi, không ném', async () => {
    setup({ loadAudio: vi.fn().mockRejectedValue(new Error('chunk')) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
  });

  it('note-JSON sai dạng hoặc không có nốt: thông báo phù hợp', async () => {
    const { unmount } = setup({ fetchJson: vi.fn().mockResolvedValue({ nope: true }) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    unmount();
    setup({ fetchJson: vi.fn().mockResolvedValue({ tracks: [] }) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(await screen.findByRole('alert')).toHaveTextContent('no notes to play');
  });

  it('hết bài: tự dừng, nút về Play', async () => {
    const audio = fakeAudio();
    setup({}, audio);
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    // nhảy tới cuối rồi để lõi kiểm tra tick kế tiếp.
    const seek = screen.getByLabelText('Seek within the piece');
    fireEvent.change(seek, { target: { value: '4' } });
    await act(async () => {
      audio.tick(5);
      await new Promise((r) => setTimeout(r, 150));
    });
    await screen.findByRole('button', { name: 'Play' });
  });

  it('gỡ component: dừng và giải phóng âm thanh; không cập nhật state sau khi gỡ', async () => {
    const { audio, unmount } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    unmount();
    expect(audio.dispose).toHaveBeenCalled();
  });

  it('gỡ trong lúc đang tải thì giải phóng âm thanh vừa tạo', async () => {
    let resolveAudio!: (a: AudioPort) => void;
    const audio = fakeAudio();
    const { unmount } = setup({ loadAudio: vi.fn(() => new Promise<AudioPort>((r) => (resolveAudio = r))) }, audio);
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    unmount();
    await act(async () => {
      resolveAudio(audio);
      await Promise.resolve();
    });
    await waitFor(() => expect(audio.dispose).toHaveBeenCalled());
  });
  it('mở khoá AudioContext đồng bộ trong cú bấm (trước mọi await) và truyền cho loadAudio', async () => {
    const resume = vi.fn().mockResolvedValue(undefined);
    let created = 0;
    vi.stubGlobal(
      'AudioContext',
      class {
        resume = resume;
        constructor() {
          created += 1;
        }
      },
    );
    const loadAudio = vi.fn().mockResolvedValue(fakeAudio());
    setup({ loadAudio });
    // Mount chỉ kiểm tra có Web Audio, không tạo context.
    expect(created).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    // Ngay sau click (chưa chờ gì): context đã được tạo và resume.
    expect(created).toBe(1);
    expect(resume).toHaveBeenCalledTimes(1);
    expect(loadAudio).toHaveBeenCalledTimes(1);
    expect(loadAudio.mock.calls[0]![0]).toBeDefined();
    await screen.findByRole('button', { name: 'Pause' });
  });

  it('kéo thanh tua: hình cập nhật ngay nhưng chỉ áp vào lõi một lần sau khoảng lặng (không khởi động lại mỗi bước)', async () => {
    const { audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const seek = screen.getByLabelText('Seek within the piece') as HTMLInputElement;
    (audio.releaseAll as ReturnType<typeof vi.fn>).mockClear();
    for (const v of ['0.5', '1', '1.5', '2', '2.5', '3']) fireEvent.change(seek, { target: { value: v } });
    expect(Number(seek.value)).toBeCloseTo(3);
    expect(audio.releaseAll).not.toHaveBeenCalled(); // chưa áp dụng trong lúc kéo
    await waitFor(() => expect(audio.releaseAll).toHaveBeenCalledTimes(1));
    expect(Number(seek.value)).toBeGreaterThanOrEqual(3);
  });

  it('tua tới cuối bài khi đang phát: lõi tự dừng, UI về 0 và nút về Play, không lệch với lõi', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const seek = screen.getByLabelText('Seek within the piece') as HTMLInputElement;
    fireEvent.change(seek, { target: { value: seek.max } });
    await screen.findByRole('button', { name: 'Play' });
    expect(Number(seek.value)).toBe(0);
  });

  it('treo quá thời hạn tải: báo lỗi, bấm lại được (không kẹt ở trạng thái đang tải)', async () => {
    vi.useFakeTimers();
    const never = new Promise<never>(() => undefined);
    setup({ loadAudio: vi.fn(() => never), fetchJson: vi.fn(() => never) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(screen.getByRole('button', { name: 'Loading player' })).toBeDisabled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(LOAD_TIMEOUT_MS + 10);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getByRole('button', { name: FIRST })).toBeEnabled();
  });

  it('nốt ngoài dải phím không được liệt kê ở "Now playing" (không có phím để sáng)', async () => {
    const out = { tracks: [{ instrument: {}, notes: [note(60, 0, 2), note(5, 0, 2)] }] };
    setup({ fetchJson: vi.fn().mockResolvedValue(out) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    await waitFor(() => expect(screen.getByTestId('now-playing')).toHaveTextContent('C4'));
    expect(screen.getByTestId('now-playing')).not.toHaveTextContent('F-1');
  });

  it('lỗi hiện ngay dưới hàng điều khiển, trước thanh tua và phím đàn', async () => {
    setup({ fetchJson: vi.fn().mockRejectedValue(new Error('x')) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    const alert = await screen.findByRole('alert');
    const seek = screen.getByLabelText('Seek within the piece');
    expect(alert.compareDocumentPosition(seek) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
