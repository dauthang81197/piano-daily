import { Midi } from '@tonejs/midi';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../../test/helpers';
import { MusicEditor } from './music-editor';
import { CELL_WIDTH, cellFromPoint, ROW_HEIGHT } from './piano-roll';

const uploadMultipart = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/upload', () => ({ uploadMultipart }));

const LESSON_ID = '0192a000-0000-7000-8000-0000000000d1';

async function signIn(role: 'SUPER_ADMIN' | 'EDITOR', handler: (url: URL, init: RequestInit) => Response | undefined = () => undefined) {
  stubFetch(() => jsonResponse(200, { ...sessionBody(), user: { ...USER, role } }));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw, init) => handler(new URL(raw), init) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}

const renderEditor = (props: Partial<React.ComponentProps<typeof MusicEditor>> = {}) =>
  render(
    <AuthProvider>
      <MusicEditor lessonId={LESSON_ID} lessonTitle="Gam Đô" hasMidi={false} canWrite onSaved={vi.fn()} {...props} />
    </AuthProvider>,
  );

/** jsdom không có `Blob.stream`: đọc file bằng FileReader. */
const readFile = (file: File) =>
  new Promise<Uint8Array>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.readAsArrayBuffer(file);
  });

/** Bấm vào lưới tại (hàng pitch C5=72 tính từ C8, cột col). */
function clickGrid(midi: number, col: number) {
  const grid = screen.getByTestId('roll-grid');
  grid.getBoundingClientRect = () => ({ left: 0, top: 0 }) as DOMRect;
  fireEvent.click(grid, { clientX: col * CELL_WIDTH + 2, clientY: (108 - midi) * ROW_HEIGHT + 2 });
}

beforeEach(() => {
  resetSessionForTests();
  uploadMultipart.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('cellFromPoint', () => {
  it('đổi toạ độ thành (cao độ, cột); ngoài lưới là null', () => {
    expect(cellFromPoint(2, 2, 64)).toEqual({ midi: 108, col: 0 });
    expect(cellFromPoint(CELL_WIDTH * 3 + 1, ROW_HEIGHT * 36 + 1, 64)).toEqual({ midi: 72, col: 3 });
    expect(cellFromPoint(-1, 0, 64)).toBeNull();
    expect(cellFromPoint(CELL_WIDTH * 64, 0, 64)).toBeNull();
    expect(cellFromPoint(0, ROW_HEIGHT * 88, 64)).toBeNull();
  });
});

describe('MusicEditor', () => {
  it('gõ nốt bằng cách bấm lưới theo độ dài đã chọn; bấm nốt để xoá; bảng nốt đồng bộ', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Độ dài nốt khi bấm'), 'h');
    clickGrid(72, 4);
    clickGrid(76, 4); // hợp âm
    const table = screen.getByRole('table');
    expect(within(table).getByText('C5')).toBeInTheDocument();
    expect(within(table).getByText('E5')).toBeInTheDocument();
    expect(within(table).getAllByText('8/16')).toHaveLength(2);
    expect(screen.getByText(/2 nốt/)).toBeInTheDocument();
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^C5, ô nhịp 1, vị trí 5/ }));
    expect(within(screen.getByRole('table')).queryByText('C5')).toBeNull();
    await user.click(screen.getByRole('button', { name: /Xoá nốt E5 ô nhịp 1 vị trí 5/ }));
    expect(screen.getByText('Chưa có nốt nào.')).toBeInTheDocument();
  });

  it('bảng nốt: thêm nốt bằng form (cao độ, ô nhịp, vị trí, độ dài)', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText('Cao độ'), '67');
    fireEvent.change(screen.getByLabelText('Ô nhịp'), { target: { value: '2' } });
    await user.selectOptions(screen.getByLabelText('Vị trí trong ô'), '8');
    await user.selectOptions(screen.getByLabelText('Độ dài'), '2');
    await user.click(screen.getByRole('button', { name: 'Thêm nốt' }));
    const row = within(screen.getByRole('table')).getByText('G4').closest('tr')!;
    expect(within(row).getByText('2')).toBeInTheDocument(); // ô nhịp 2
    expect(within(row).getByText('9')).toBeInTheDocument(); // vị trí 9/16
    expect(within(row).getByText('2/16')).toBeInTheDocument();
  });

  it('lưu rỗng bị chặn; lưu có nốt gửi file MIDI hợp lệ bai-<id>.mid qua endpoint upload', async () => {
    await signIn('SUPER_ADMIN');
    const onSaved = vi.fn();
    uploadMultipart.mockResolvedValue({ id: LESSON_ID });
    renderEditor({ onSaved });
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Lưu nhạc' }));
    expect(await screen.findByText(/ít nhất một nốt/)).toBeInTheDocument();
    expect(uploadMultipart).not.toHaveBeenCalled();

    clickGrid(72, 0);
    clickGrid(74, 4);
    await user.click(screen.getByRole('button', { name: 'Lưu nhạc' }));
    await waitFor(() => expect(uploadMultipart).toHaveBeenCalledTimes(1));
    const [path, build] = uploadMultipart.mock.calls[0]!;
    expect(path).toBe(`/admin/courses/lessons/${LESSON_ID}/midi`);
    const file = (build() as FormData).get('file') as File;
    expect(file.name).toBe(`bai-${LESSON_ID}.mid`);
    const midi = new Midi(await readFile(file));
    expect(midi.tracks[0]!.notes.map((n) => n.midi)).toEqual([72, 74]);
    expect(midi.tracks[0]!.notes[0]!.durationTicks).toBe(4 * 120);
    expect(await screen.findByText(/Đã lưu nhạc/)).toBeInTheDocument();
    expect(screen.queryByText('Có thay đổi chưa lưu')).toBeNull();
    expect(onSaved).toHaveBeenCalled();
  });

  it('lỗi API khi lưu: hiện thông báo, giữ nguyên nốt và trạng thái chưa lưu', async () => {
    await signIn('SUPER_ADMIN');
    uploadMultipart.mockRejectedValue(Object.assign(new Error('x'), { name: 'ApiError' }));
    renderEditor();
    clickGrid(72, 0);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Lưu nhạc' }));
    expect(await screen.findByText('Lưu nhạc không thành công. Vui lòng thử lại.')).toBeInTheDocument();
    expect(screen.getByText('Có thay đổi chưa lưu')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('C5')).toBeInTheDocument();
  });

  it('EDITOR: chỉ xem; mọi ô sửa, nút lưu/nhập bị vô hiệu; bấm lưới không thêm nốt', async () => {
    await signIn('EDITOR');
    renderEditor({ canWrite: false });
    expect(screen.getByText('Chỉ SUPER_ADMIN được thay đổi khoá học.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Lưu nhạc' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nhập file MIDI' })).toBeDisabled();
    expect(screen.getByLabelText('Tempo (BPM)')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Thêm nốt' })).toBeNull();
    clickGrid(72, 0);
    expect(screen.getByText('Chưa có nốt nào.')).toBeInTheDocument();
  });

  it('nhập file MIDI: nạp nốt/tempo/nhịp, báo phần làm tròn/bỏ; chưa ghi lên server', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    const midi = new Midi();
    midi.header.setTempo(80);
    midi.header.timeSignatures.push({ ticks: 0, timeSignature: [3, 4] });
    const t = midi.addTrack();
    t.addNote({ midi: 60, ticks: 0, durationTicks: 480 });
    t.addNote({ midi: 64, ticks: 130, durationTicks: 480 }); // lệch lưới
    t.addNote({ midi: 3, ticks: 0, durationTicks: 480 }); // ngoài dải
    const file = new File([midi.toArray() as BlobPart], 'x.mid', { type: 'audio/midi' });
    fireEvent.change(screen.getByLabelText('Chọn file MIDI để nhập'), { target: { files: [file] } });
    expect(await screen.findByText(/1 nốt đã được làm tròn/)).toBeInTheDocument();
    expect(screen.getByText(/1 nốt ngoài dải A0–C8/)).toBeInTheDocument();
    expect(screen.getByLabelText('Tempo (BPM)')).toHaveValue(80);
    expect(screen.getByLabelText('Nhịp')).toHaveValue('3/4');
    expect(within(screen.getByRole('table')).getByText('C4')).toBeInTheDocument();
    expect(uploadMultipart).not.toHaveBeenCalled();
  });

  it('nhập file hỏng hoặc quá lớn: báo lỗi, giữ nguyên nội dung cũ', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    clickGrid(72, 0);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.change(screen.getByLabelText('Chọn file MIDI để nhập'), { target: { files: [new File([new Uint8Array([1, 2, 3, 4])], 'bad.mid')] } });
    expect(await screen.findByText('Không đọc được file MIDI này.')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getByText('C5')).toBeInTheDocument();
    const big = new File([new Uint8Array(3 * 1024 * 1024)], 'big.mid');
    fireEvent.change(screen.getByLabelText('Chọn file MIDI để nhập'), { target: { files: [big] } });
    expect(await screen.findByText('File MIDI vượt quá 2MB.')).toBeInTheDocument();
  });

  it('nhập khi đã có nốt thì hỏi xác nhận; từ chối thì không thay đổi', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    clickGrid(72, 0);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 50, ticks: 0, durationTicks: 480 });
    fireEvent.change(screen.getByLabelText('Chọn file MIDI để nhập'), { target: { files: [new File([midi.toArray() as BlobPart], 'x.mid')] } });
    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(within(screen.getByRole('table')).getByText('C5')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).queryByText('D3')).toBeNull();
  });

  it('Mở nhạc hiện tại: tải file .mid qua API rồi nạp; bài chưa có nhạc thì nút bị vô hiệu', async () => {
    const midi = new Midi();
    midi.addTrack().addNote({ midi: 55, ticks: 0, durationTicks: 960 });
    const bytes = midi.toArray();
    const fetchMock = await signIn('SUPER_ADMIN', (url) =>
      url.pathname === `/admin/courses/lessons/${LESSON_ID}/midi/file` ? new Response(bytes as BlobPart, { status: 200 }) : undefined,
    );
    const first = renderEditor({ hasMidi: false });
    expect(screen.getByRole('button', { name: 'Mở nhạc hiện tại của bài' })).toBeDisabled();
    first.unmount();
    renderEditor({ hasMidi: true });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Mở nhạc hiện tại của bài' }));
    expect(await within(screen.getByRole('table')).findByText('G3')).toBeInTheDocument();
    expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith(`/lessons/${LESSON_ID}/midi/file`))).toBe(true);
  });

  it('cảnh báo beforeunload khi còn thay đổi chưa lưu', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    const clean = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    clickGrid(72, 0);
    const dirty = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
  });

  it('đổi nhịp/số ô nhịp/tempo; nốt ngoài bài bị cắt', async () => {
    await signIn('SUPER_ADMIN');
    renderEditor();
    const user = userEvent.setup();
    clickGrid(72, 30);
    await user.selectOptions(screen.getByLabelText('Nhịp'), '3/4');
    await user.clear(screen.getByLabelText('Số ô nhịp'));
    await user.type(screen.getByLabelText('Số ô nhịp'), '2');
    expect(screen.getByText(/2 ô nhịp 3\/4/)).toBeInTheDocument();
    expect(screen.getByText(/0 nốt/)).toBeInTheDocument();
  });
});
