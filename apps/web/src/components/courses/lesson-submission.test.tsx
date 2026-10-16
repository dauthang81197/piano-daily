import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { ApiError } from '@/lib/public-api';

const auth = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
const api = vi.hoisted(() => ({ lessonSubmission: vi.fn(), saveSubmission: vi.fn(), deleteSubmission: vi.fn() }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));

import { LessonSubmission } from './lesson-submission';

const openAuth = vi.fn();
const signIn = (id = 'c1') => {
  auth.value = { status: 'authenticated', customer: { id }, getToken: async () => 'tok', openAuth };
};
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const sub = (over: object = {}) => ({
  id: 's1',
  kind: 'YOUTUBE',
  url: YT,
  note: null,
  isHidden: false,
  createdAt: '2026-10-16T00:00:00.000Z',
  updatedAt: '2026-10-16T00:00:00.000Z',
  ...over,
});
const view = () => render(withIntl(<LessonSubmission lessonId="l1" />, 'vi'));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('LessonSubmission', () => {
  it('khách chưa đăng nhập thấy nút mời đăng nhập; đang khôi phục phiên thì không hiện gì', async () => {
    auth.value = { status: 'loading', customer: null, getToken: async () => null, openAuth };
    const { container, rerender } = view();
    expect(container).toBeEmptyDOMElement();
    auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
    rerender(withIntl(<LessonSubmission lessonId="l1" />, 'vi'));
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập để nộp bài' }));
    expect(openAuth).toHaveBeenCalledWith('login');
    expect(api.lessonSubmission).not.toHaveBeenCalled();
  });

  it('chưa nộp: hiện form; nộp xong hiện link mở tab mới an toàn', async () => {
    signIn();
    api.lessonSubmission.mockResolvedValue({ submission: null });
    api.saveSubmission.mockResolvedValue({ submission: sub({ note: 'Lần 1' }) });
    view();
    await userEvent.type(await screen.findByLabelText('Link video'), YT);
    await userEvent.type(screen.getByLabelText('Ghi chú (không bắt buộc)'), 'Lần 1');
    await userEvent.click(screen.getByRole('button', { name: 'Nộp bài' }));
    expect(api.saveSubmission).toHaveBeenCalledWith('tok', 'l1', { url: YT, note: 'Lần 1' });
    const link = await screen.findByRole('link', { name: 'Mở link đã nộp' });
    expect(link).toHaveAttribute('href', YT);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Lần 1')).toBeInTheDocument();
  });

  it('đã nộp: sửa gửi link mới; xoá có xác nhận và trở lại form', async () => {
    signIn();
    api.lessonSubmission.mockResolvedValue({ submission: sub() });
    api.saveSubmission.mockResolvedValue({ submission: sub({ url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', kind: 'DRIVE' }) });
    api.deleteSubmission.mockResolvedValue(undefined);
    view();
    await userEvent.click(await screen.findByRole('button', { name: 'Sửa bài nộp' }));
    const input = screen.getByLabelText('Link video');
    expect(input).toHaveValue(YT);
    await userEvent.clear(input);
    await userEvent.type(input, 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() => expect(screen.getByRole('link', { name: 'Mở link đã nộp' })).toHaveAttribute('href', expect.stringContaining('drive.google.com')));

    await userEvent.click(screen.getByRole('button', { name: 'Xoá bài nộp' }));
    expect(api.deleteSubmission).toHaveBeenCalledWith('tok', 'l1');
    expect(await screen.findByLabelText('Link video')).toBeInTheDocument();
  });

  it('không xoá khi người dùng huỷ xác nhận', async () => {
    signIn();
    api.lessonSubmission.mockResolvedValue({ submission: sub() });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    view();
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá bài nộp' }));
    expect(api.deleteSubmission).not.toHaveBeenCalled();
  });

  it('bài nộp bị ẩn hiện nhãn quản trị đã ẩn', async () => {
    signIn();
    api.lessonSubmission.mockResolvedValue({ submission: sub({ isHidden: true }) });
    view();
    expect(await screen.findByText('Quản trị đã ẩn bài nộp này')).toBeInTheDocument();
  });

  it('lỗi 400 ở url, 429 và lỗi khác hiện thông báo riêng, form giữ nguyên để thử lại', async () => {
    signIn();
    api.lessonSubmission.mockResolvedValue({ submission: null });
    view();
    await userEvent.type(await screen.findByLabelText('Link video'), 'https://vimeo.com/1');
    const submit = screen.getByRole('button', { name: 'Nộp bài' });
    api.saveSubmission.mockRejectedValueOnce(new ApiError(400, 'VALIDATION_FAILED', 'x', [{ path: 'url', message: 'x' }]));
    await userEvent.click(submit);
    expect(await screen.findByRole('alert')).toHaveTextContent('Chỉ nhận link video YouTube hoặc file Google Drive.');
    api.saveSubmission.mockRejectedValueOnce(new ApiError(429, 'TOO_MANY_REQUESTS', 'x'));
    await userEvent.click(submit);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('quá nhanh'));
    api.saveSubmission.mockRejectedValueOnce(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    await userEvent.click(submit);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Chưa lưu được bài nộp'));
    expect(screen.getByLabelText('Link video')).toHaveValue('https://vimeo.com/1');
  });

  it('tải lỗi hiện thông báo; đổi tài khoản không lộ bài nộp của người trước', async () => {
    signIn('c1');
    api.lessonSubmission.mockRejectedValueOnce(new Error('boom'));
    const { rerender } = view();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được bài nộp của bạn.');

    api.lessonSubmission.mockResolvedValueOnce({ submission: sub({ note: 'của c1' }) });
    signIn('c2');
    rerender(withIntl(<LessonSubmission lessonId="l1" />, 'vi'));
    expect(await screen.findByText('của c1')).toBeInTheDocument();
    let release: (v: unknown) => void = () => {};
    api.lessonSubmission.mockReturnValueOnce(new Promise((r) => (release = r)));
    signIn('c3');
    rerender(withIntl(<LessonSubmission lessonId="l1" />, 'vi'));
    expect(screen.queryByText('của c1')).not.toBeInTheDocument();
    release({ submission: null });
    expect(await screen.findByLabelText('Link video')).toBeInTheDocument();
  });
});
