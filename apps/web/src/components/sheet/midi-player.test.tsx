import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import type { AudioPort } from '@/lib/midi/player-core';
import { claimAudio, resetAudioClaims } from '@/lib/midi/audio-exclusive';
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
    resetAudioClaims();
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
    // nốt sắp rơi: G4 ở giây 3 nằm trong cửa sổ nhìn trước (LOOKAHEAD_SECONDS) ngay từ đầu bài.
    expect(container.querySelector('[data-falling="G4"]')).not.toBeNull();
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

  it('BPM: hiện BPM gốc (120 khi thiếu tempo), −/+ chỉ dùng được sau khi tải; mỗi lần bấm đổi 1 BPM và đổi tốc độ phát thật', async () => {
    const { audio } = setup();
    const bpm = screen.getByRole('group', { name: 'BPM' });
    expect(bpm).toHaveTextContent('120');
    expect(screen.getByRole('button', { name: 'Decrease 1 BPM' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    fireEvent.click(screen.getByRole('button', { name: 'Increase 1 BPM' }));
    expect(bpm).toHaveTextContent('121');
    for (let i = 0; i < 61; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Decrease 1 BPM' }));
    expect(bpm).toHaveTextContent('60');
    // Về đầu rồi lên lịch lại ở 0.5x: nốt dài 2 giây phát trong 4 giây thực.
    fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
    expect(audio.calls.filter((c) => c.name === 'C4').at(-1)!.duration).toBeCloseTo(4);
  });

  it('BPM chạm biên 0.25×: nút − bị vô hiệu', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    for (let i = 0; i < 90; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Decrease 1 BPM' }));
    expect(screen.getByRole('group', { name: 'BPM' })).toHaveTextContent('30');
    expect(screen.getByRole('button', { name: 'Decrease 1 BPM' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Increase 1 BPM' })).toBeEnabled();
  });

  it('Về đầu bài: tua về 0 và giữ trạng thái đang phát', async () => {
    const { audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    audio.tick(1.5);
    fireEvent.change(screen.getByLabelText('Seek within the piece'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back to start' }));
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(screen.getByLabelText('Seek within the piece')).toHaveValue('0');
  });

  it('Space bật/tắt phát khi focus ngoài các điều khiển; trên nút/ô nhập thì không bắt', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    const section = screen.getByRole('toolbar').closest('section')!;
    fireEvent.keyDown(section, { key: ' ' });
    expect(await screen.findByRole('button', { name: 'Play' })).toBeInTheDocument();
    fireEvent.keyDown(section, { key: ' ' });
    expect(await screen.findByRole('button', { name: 'Pause' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('button', { name: 'Back to start' }), { key: ' ' });
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('chế độ tối: bật thêm lớp phạm vi `player-dark`, nhớ lựa chọn, mở lại vẫn tối', () => {
    localStorage.clear();
    const first = setup();
    const section = screen.getByRole('toolbar').closest('section')!;
    expect(section).not.toHaveClass('player-dark');
    fireEvent.click(screen.getByRole('button', { name: 'Dark mode' }));
    expect(section).toHaveClass('player-dark');
    expect(screen.getByRole('button', { name: 'Dark mode' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('piano-daily:player-dark')).toBe('on');
    first.unmount();
    setup();
    expect(screen.getByRole('toolbar').closest('section')).toHaveClass('player-dark');
  });

  it('toàn màn hình (không có Fullscreen API): phủ kín cửa sổ, Esc thoát và trả focus về nút', async () => {
    setup();
    const button = screen.getByRole('button', { name: 'Full screen' });
    button.focus();
    fireEvent.click(button);
    const exit = await screen.findByRole('button', { name: 'Exit full screen' });
    expect(exit).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('toolbar').closest('section')).toHaveClass('fixed');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    const back = await screen.findByRole('button', { name: 'Full screen' });
    await waitFor(() => expect(back).toHaveFocus());
  });

  it('không bật khuông nhạc: không có nút chuyển chế độ và không có zoom (chỉ phím đàn)', () => {
    setup();
    expect(screen.queryByRole('group', { name: 'View' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Zoom in the staff' })).toBeNull();
  });

  it('Transpose: hiện 0, −/+ đổi từng nửa cung, kẹp ±12; đặt trước khi phát thì âm thanh và "đang phát" đều theo nốt đã dịch', async () => {
    const { audio } = setup();
    const group = screen.getByRole('group', { name: 'Transpose' });
    expect(group).toHaveTextContent('0');
    fireEvent.click(screen.getByRole('button', { name: 'Up 1 semitone' }));
    fireEvent.click(screen.getByRole('button', { name: 'Up 1 semitone' }));
    expect(group).toHaveTextContent('+2');
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(audio.calls.map((c) => c.name)).toEqual(expect.arrayContaining(['D4', 'F#4']));
    expect(audio.calls.map((c) => c.name)).not.toContain('C4');
    expect(screen.getByTestId('now-playing')).toHaveTextContent('D4');
    for (let i = 0; i < 20; i += 1) fireEvent.click(screen.getByRole('button', { name: 'Down 1 semitone' }));
    expect(group).toHaveTextContent('−12');
    expect(screen.getByRole('button', { name: 'Down 1 semitone' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Up 1 semitone' })).toBeEnabled();
  });

  it('Transpose khi đang phát: nốt chưa phát theo giọng mới ngay', async () => {
    const { audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    audio.calls.length = 0;
    fireEvent.click(screen.getByRole('button', { name: 'Up 1 semitone' }));
    expect(audio.calls.map((c) => c.name)).toEqual(expect.arrayContaining(['C#4']));
  });

  it('Loop: nút Lặp bật/tắt (aria-pressed) và hiện dải + vạch A/B trên thanh tiến trình sau khi tải; đặt A/B tại vị trí hiện tại; xoá', async () => {
    setup();
    const toggle = screen.getByRole('button', { name: 'Loop' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Loop range options' }));
    expect(screen.getByRole('button', { name: /Set point A/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(screen.queryByTestId('loop-band')).toBeNull();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('loop-band')).toBeInTheDocument();
    expect(screen.getByText(/Looping the whole piece/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Seek within the piece'), { target: { value: '1' } });
    // Tua được áp vào lõi sau khoảng lặng 150ms (debounce); đợi xong rồi mới đặt điểm A tại vị trí đó.
    await new Promise((resolve) => setTimeout(resolve, 250));
    fireEvent.click(screen.getByRole('button', { name: /Set point A/ }));
    expect(screen.getByText(/Loop range: 0:01/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear loop range' }));
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByTestId('loop-band')).toBeNull();
  });

  it('Mixer: mở bảng âm lượng từng tay; tắt tiếng cả hai tay thì không phát nốt nào; kéo thanh tự bật lại tiếng', async () => {
    const { audio } = setup();
    const toggle = screen.getByRole('button', { name: 'Mixer' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    const right = screen.getByRole('button', { name: 'Mute right hand' });
    const left = screen.getByRole('button', { name: 'Mute left hand' });
    fireEvent.click(right);
    fireEvent.click(left);
    expect(right).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Right hand volume')).toHaveValue('0');
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    expect(audio.calls).toHaveLength(0);
    fireEvent.change(screen.getByLabelText('Right hand volume'), { target: { value: '50' } });
    expect(screen.getByRole('button', { name: 'Mute right hand' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Right hand volume')).toHaveValue('50');
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

  it('lỗi hiện ngay dưới thanh tiến trình, trước phím đàn', async () => {
    setup({ fetchJson: vi.fn().mockRejectedValue(new Error('x')) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    const alert = await screen.findByRole('alert');
    const seek = screen.getByLabelText('Seek within the piece');
    const keyboard = screen.getByRole('img', { name: 'Virtual piano keyboard for Für Elise' });
    expect(seek.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.compareDocumentPosition(keyboard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it('lỗi tải: đóng AudioContext đã mở khoá trong cú bấm (không rò rỉ context)', async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('AudioContext', class { resume = vi.fn(); close = close; });
    setup({ loadAudio: vi.fn().mockRejectedValue(new Error('chunk')) });
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('alert');
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('nghe thử trên thẻ bắt đầu thì player chính tạm dừng (một nguồn âm thanh tại một thời điểm)', async () => {
    const { audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    await screen.findByRole('button', { name: 'Pause' });
    (audio.releaseAll as ReturnType<typeof vi.fn>).mockClear();
    act(() => {
      claimAudio('card-preview', vi.fn()); // nghe thử trên thẻ nhận quyền phát
    });
    await screen.findByRole('button', { name: 'Play' });
    expect(audio.releaseAll).toHaveBeenCalled();
    // Bấm Play lại: player nhận lại quyền và dừng nghe thử.
    const stopPreview = vi.fn();
    act(() => {
      claimAudio('card-preview', stopPreview);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Play' }));
    expect(stopPreview).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  });

  it('bấm phát ở player chính dừng nghe thử ngay từ lúc bấm (kể cả khi còn đang tải)', () => {
    setup({ loadAudio: vi.fn(() => new Promise<AudioPort>(() => undefined)) });
    const stopPreview = vi.fn();
    claimAudio('card-preview', stopPreview);
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    expect(stopPreview).toHaveBeenCalledTimes(1);
  });

  it('Pause hoặc hết bài nhả quyền: nghe thử bắt đầu sau đó không làm player dừng lần nữa', async () => {
    const { audio } = setup();
    fireEvent.click(screen.getByRole('button', { name: FIRST }));
    fireEvent.click(await screen.findByRole('button', { name: 'Pause' }));
    (audio.releaseAll as ReturnType<typeof vi.fn>).mockClear();
    act(() => {
      claimAudio('card-preview', vi.fn());
    });
    expect(audio.releaseAll).not.toHaveBeenCalled();
  });
});
