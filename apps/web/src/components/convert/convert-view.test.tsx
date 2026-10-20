import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ScoreConversion } from '@piano-daily/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { ApiError } from '@/lib/public-api';

const { auth, api, navigateTo, openAuth } = vi.hoisted(() => ({
  auth: { value: null as unknown },
  api: { createScore: vi.fn(), getScore: vi.fn(), deleteScore: vi.fn() },
  navigateTo: vi.fn(),
  openAuth: vi.fn(),
}));

vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));
vi.mock('@/lib/navigate', () => ({ navigateTo: (url: string) => navigateTo(url) }));
vi.mock('@/components/sheet/midi-player', () => ({
  MidiPlayer: ({ noteJsonUrl, title, notation }: { noteJsonUrl: string; title: string; notation?: boolean }) => (
    <div data-testid="player" data-notation={String(notation)}>
      {noteJsonUrl}|{title}
    </div>
  ),
}));

import { ConvertView } from './convert-view';
import { POLL_INTERVAL_MS } from './use-score-job';

const ID = '0195b0f0-0000-7000-8000-000000000000';
const job = (over: Partial<ScoreConversion> = {}): ScoreConversion => ({
  id: ID,
  status: 'PENDING',
  originalName: 'bai.pdf',
  transpose: 0,
  createdAt: '2026-10-20T00:00:00.000Z',
  expiresAt: '2026-10-20T06:00:00.000Z',
  result: null,
  error: null,
  ...over,
});
const done = job({ status: 'DONE', result: { noteJsonUrl: 'http://cdn/n.json', midiUrl: 'http://cdn/m.mid', durationSeconds: 3, noteCount: 5 } });
const signIn = () => {
  auth.value = { status: 'authenticated', customer: { id: 'c1' }, getToken: async () => 'tok', openAuth };
};
const signOut = () => {
  auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
};
const view = (initialJobId: string | null = null) => render(withIntl(<ConvertView initialJobId={initialJobId} />, 'vi'));
const pdf = () => new File(['%PDF-1.7'], 'bai.pdf', { type: 'application/pdf' });
const pickAndSubmit = async (file = pdf()) => {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, file);
  await userEvent.click(screen.getByRole('button', { name: 'Chuyển sang MIDI' }));
};

beforeEach(() => {
  vi.resetAllMocks();
  window.history.replaceState(null, '', '/vi/convert');
});
afterEach(() => vi.useRealTimers());

describe('ConvertView: đăng nhập', () => {
  it('chưa đăng nhập: chỉ có lời mời đăng nhập, không có form; không gọi API', async () => {
    signOut();
    view();
    expect(screen.getByRole('heading', { name: 'Đăng nhập để dùng công cụ này' })).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(openAuth).toHaveBeenCalledWith('login');
    expect(api.getScore).not.toHaveBeenCalled();
  });

  it('đang khôi phục phiên: không nhấp nháy lời mời đăng nhập', () => {
    auth.value = { status: 'loading', customer: null, getToken: async () => null, openAuth };
    view();
    expect(screen.queryByRole('button', { name: 'Đăng nhập' })).toBeNull();
  });
});

describe('ConvertView: form', () => {
  it('có chọn file nhận đúng loại, chọn dịch giọng −12..+12 và hai cảnh báo (nhận dạng, bản quyền)', () => {
    signIn();
    view();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toContain('.pdf');
    expect(input.accept).toContain('.musicxml');
    const select = screen.getByLabelText('Dịch giọng') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['12', '11', '10', '9', '8', '7', '6', '5', '4', '3', '2', '1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9', '-10', '-11', '-12']);
    expect(screen.getByText(/Nhận dạng không hoàn hảo/)).toBeInTheDocument();
    expect(screen.getByText(/quyền sử dụng/)).toBeInTheDocument();
  });

  it('không chọn file thì báo lỗi và không gọi API; file quá 25MB bị chặn ngay ở trình duyệt', async () => {
    signIn();
    view();
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển sang MIDI' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy chọn một file bản nhạc.');
    const big = pdf();
    Object.defineProperty(big, 'size', { value: 26 * 1024 * 1024 });
    await pickAndSubmit(big);
    expect(screen.getByRole('alert')).toHaveTextContent('File quá lớn');
    expect(api.createScore).not.toHaveBeenCalled();
  });

  it('gửi file kèm dịch giọng, ghi ?job= lên URL và chuyển sang trạng thái đang xử lý', async () => {
    signIn();
    api.createScore.mockResolvedValue(job());
    api.getScore.mockResolvedValue(job({ status: 'PROCESSING' }));
    view();
    await userEvent.selectOptions(screen.getByLabelText('Dịch giọng'), '2');
    await pickAndSubmit();
    expect(api.createScore).toHaveBeenCalledWith('tok', expect.objectContaining({ name: 'bai.pdf' }), 2, expect.any(Function));
    expect(await screen.findByRole('status')).toHaveTextContent('Đang nhận dạng bản nhạc');
    expect(window.location.search).toBe(`?job=${ID}`);
  });
});

describe('ConvertView: theo dõi và kết quả', () => {
  it('hỏi trạng thái định kỳ tới khi xong: hiện khuông nhạc (notation), nghe thử và nút tải MIDI', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn();
    api.createScore.mockResolvedValue(job());
    api.getScore.mockResolvedValueOnce(job({ status: 'PROCESSING' })).mockResolvedValue(done);
    view();
    await pickAndSubmit();
    expect(await screen.findByRole('status')).toBeInTheDocument();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS + 50);
    });
    expect(await screen.findByRole('heading', { name: 'Đã chuyển xong' })).toBeInTheDocument();
    const player = screen.getByTestId('player');
    expect(player).toHaveAttribute('data-notation', 'true');
    expect(player).toHaveTextContent('http://cdn/n.json|bai.pdf');
    await userEvent.click(screen.getByRole('button', { name: /Tải file MIDI/ }));
    expect(navigateTo).toHaveBeenCalledWith('http://cdn/m.mid');
  });

  it('mở lại bằng ?job=<id>: tiếp tục theo dõi và hiện kết quả nếu còn hạn', async () => {
    signIn();
    api.getScore.mockResolvedValue(done);
    view(ID);
    expect(await screen.findByTestId('player')).toBeInTheDocument();
    expect(api.getScore).toHaveBeenCalledWith('tok', ID);
  });

  it('?job= đã hết hạn (404): báo hết hạn, có nút chuyển bản mới và xoá ?job= khỏi URL', async () => {
    signIn();
    window.history.replaceState(null, '', `/vi/convert?job=${ID}`);
    api.getScore.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    view(ID);
    expect(await screen.findByRole('alert')).toHaveTextContent('Kết quả đã hết hạn');
    expect(window.location.search).toBe('');
    await userEvent.click(screen.getByRole('button', { name: 'Chuyển bản mới' }));
    expect(screen.getByRole('button', { name: 'Chuyển sang MIDI' })).toBeInTheDocument();
  });

  it.each([
    ['SCORE_UNREADABLE', 'Không đọc được bản nhạc', 'PDF rõ nét hơn'],
    ['SCORE_UNAVAILABLE', 'Dịch vụ tạm thời không sẵn sàng', 'không tính vào hạn mức'],
  ] as const)('việc FAILED %s: nêu lý do và cho thử lại', async (error, title, hint) => {
    signIn();
    api.getScore.mockResolvedValue(job({ status: 'FAILED', error }));
    view(ID);
    expect(await screen.findByRole('heading', { name: title })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(hint))).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Thử lại' }));
    expect(screen.getByRole('button', { name: 'Chuyển sang MIDI' })).toBeInTheDocument();
  });

  it('xoá kết quả: gọi API xoá rồi quay về form', async () => {
    signIn();
    api.getScore.mockResolvedValue(done);
    api.deleteScore.mockResolvedValue(undefined);
    view(ID);
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá kết quả' }));
    await waitFor(() => expect(api.deleteScore).toHaveBeenCalledWith('tok', ID));
    expect(await screen.findByRole('button', { name: 'Chuyển sang MIDI' })).toBeInTheDocument();
  });

  it('đã có việc chạy (429 SCORE_ACTIVE_JOB): theo dõi việc đó thay vì báo lỗi', async () => {
    signIn();
    api.createScore.mockRejectedValue(new ApiError(429, 'SCORE_ACTIVE_JOB', 'x', { id: ID }));
    api.getScore.mockResolvedValue(job({ status: 'PROCESSING' }));
    view();
    await pickAndSubmit();
    expect(await screen.findByRole('status')).toBeInTheDocument();
    expect(api.getScore).toHaveBeenCalledWith('tok', ID);
    expect(window.location.search).toBe(`?job=${ID}`);
  });
});

describe('ConvertView: lỗi khi gửi', () => {
  const cases: [ApiError, RegExp][] = [
    [new ApiError(429, 'SCORE_DAILY_LIMIT', 'x', { retryAfterSeconds: 7200 }), /hết lượt chuyển nhạc hôm nay.*2 giờ/],
    [new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'x'), /Chỉ nhận PDF/],
    [new ApiError(413, 'FILE_TOO_LARGE', 'x'), /File quá lớn/],
    [new ApiError(503, 'FEATURE_DISABLED', 'x'), /chưa được mở/],
    [new ApiError(503, 'SERVICE_UNAVAILABLE', 'x'), /đang bận/],
    [new ApiError(403, 'EMAIL_NOT_VERIFIED', 'x'), /xác minh email/],
    [new ApiError(0, 'NETWORK_ERROR', 'x'), /Không kết nối được/],
  ];
  it.each(cases)('%s → thông báo bằng chữ, form vẫn dùng được', async (err, text) => {
    signIn();
    api.createScore.mockRejectedValue(err);
    view();
    await pickAndSubmit();
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByRole('button', { name: 'Chuyển sang MIDI' })).toBeInTheDocument();
  });

  it('rời trang khi đang hỏi trạng thái thì dừng hỏi (không rò timer)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    signIn();
    api.getScore.mockResolvedValue(job({ status: 'PROCESSING' }));
    const { unmount } = view(ID);
    await screen.findByRole('status');
    const calls = api.getScore.mock.calls.length;
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS * 4);
    });
    expect(api.getScore.mock.calls.length).toBe(calls);
  });
});


describe('ConvertView: tiến trình (% tải lên, các bước, thời gian đã chạy)', () => {
  it('đang tải lên: thanh % thật theo sự kiện tiến độ, bước 1 đang làm, bước 2-3 chưa tới', async () => {
    signIn();
    let report: (f: number) => void = () => undefined;
    api.createScore.mockImplementation((_t: string, _f: File, _n: number, onProgress: (f: number) => void) => {
      report = onProgress;
      return new Promise(() => undefined);
    });
    view();
    await pickAndSubmit();
    expect(await screen.findByRole('progressbar', { name: 'Tiến độ tải lên' })).toHaveAttribute('aria-valuenow', '0');
    act(() => report(0.42));
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('heading', { name: 'Đang tải lên… 42%' })).toBeInTheDocument();
    const steps = screen.getAllByRole('listitem');
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[0]).toHaveTextContent('Tải file lên');
    expect(steps[1]).not.toHaveAttribute('aria-current');
    expect(steps[2]).toHaveTextContent('chưa tới');
  });

  it('đang nhận dạng: bước 1 xong, bước 2 đang làm, không có thanh % giả; hiện thời gian đã chạy và tăng dần', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-20T00:01:05.000Z'));
    signIn();
    api.getScore.mockResolvedValue(job({ status: 'PROCESSING', createdAt: '2026-10-20T00:00:00.000Z' }));
    view(ID);
    expect(await screen.findByText(/Đã chạy 1:05/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).toBeNull();
    const steps = screen.getAllByRole('listitem');
    expect(steps[0]).toHaveTextContent('xong');
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).toHaveTextContent('đang thực hiện');
    expect(steps[2]).toHaveTextContent('chưa tới');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByText(/Đã chạy 1:10/)).toBeInTheDocument();
    expect(screen.queryByText(/lâu hơn bình thường/)).toBeNull();
  });

  it('chạy quá 5 phút: nhắc lần này lâu hơn bình thường, vẫn cho xoá', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-20T00:06:00.000Z'));
    signIn();
    api.getScore.mockResolvedValue(job({ status: 'PROCESSING', createdAt: '2026-10-20T00:00:00.000Z' }));
    view(ID);
    expect(await screen.findByText(/lâu hơn bình thường/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá kết quả' })).toBeInTheDocument();
  });

  it('đồng hồ máy lệch (việc tạo "trong tương lai"): thời gian không bao giờ âm', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-10-19T23:59:00.000Z'));
    signIn();
    api.getScore.mockResolvedValue(job({ status: 'PROCESSING', createdAt: '2026-10-20T00:00:00.000Z' }));
    view(ID);
    expect(await screen.findByText(/Đã chạy 0:00/)).toBeInTheDocument();
  });
});
