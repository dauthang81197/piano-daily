import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { ApiError } from '@/lib/public-api';

const auth = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
const api = vi.hoisted(() => ({
  myCommunity: vi.fn(),
  setRating: vi.fn(),
  removeRating: vi.fn(),
  createComment: vi.fn(),
  editComment: vi.fn(),
  deleteComment: vi.fn(),
}));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));
const pubApi = vi.hoisted(() => ({ fetchCommunity: vi.fn() }));
vi.mock('@/lib/public-api', async (orig) => ({ ...(await orig<typeof import('@/lib/public-api')>()), fetchCommunity: pubApi.fetchCommunity }));

import { LessonCommunity } from './lesson-community';

const openAuth = vi.fn();
const signIn = (id = 'c1') => {
  auth.value = { status: 'authenticated', customer: { id }, getToken: async () => 'tok', openAuth };
};
const signOut = () => {
  auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
};
const comment = (over: object = {}) => ({ id: 'k1', parentId: null, body: 'Bài hay', authorName: 'Lan', createdAt: '2026-10-16T00:00:00.000Z', edited: false, ...over });
const pubData = (over: object = {}) => ({ rating: { average: 4.5, count: 2 }, comments: [{ ...comment(), replies: [comment({ id: 'r1', parentId: 'k1', body: 'Cảm ơn', authorName: 'Minh' })] }], nextCursor: null, ...over });
const mineData = (over: object = {}) => ({ myRating: null, comments: [], ...over });
const view = () => render(withIntl(<LessonCommunity lessonId="l1" />, 'vi'));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('LessonCommunity', () => {
  it('khách: thấy trung bình sao, bình luận và trả lời dạng văn bản thuần; chỉ có nút đăng nhập, không form', async () => {
    signOut();
    pubApi.fetchCommunity.mockResolvedValue(pubData({ comments: [{ ...comment({ body: '<b>x</b> **y**' }), replies: [] }] }));
    view();
    expect(await screen.findByText('4,5 / 5 sao · 2 đánh giá')).toBeInTheDocument();
    expect(screen.getByText('<b>x</b> **y**')).toBeInTheDocument();
    expect(document.querySelector('b')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập để đánh giá' }));
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập để bình luận' }));
    expect(openAuth).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(api.myCommunity).not.toHaveBeenCalled();
  });

  it('chưa có đánh giá/bình luận hiện thông báo trống; đang khôi phục phiên không hiện gì', async () => {
    auth.value = { status: 'loading', customer: null, getToken: async () => null, openAuth };
    const { container } = view();
    expect(container).toBeEmptyDOMElement();
    signOut();
    pubApi.fetchCommunity.mockResolvedValue(pubData({ rating: { average: null, count: 0 }, comments: [] }));
    view();
    expect(await screen.findByText('Chưa có đánh giá')).toBeInTheDocument();
    expect(screen.getByText('Chưa có bình luận nào. Hãy là người đầu tiên!')).toBeInTheDocument();
  });

  it('chấm sao cập nhật trung bình; gỡ đánh giá', async () => {
    signIn();
    pubApi.fetchCommunity.mockResolvedValue(pubData());
    api.myCommunity.mockResolvedValue(mineData());
    api.setRating.mockResolvedValue({ myRating: 5, rating: { average: 4.7, count: 3 } });
    api.removeRating.mockResolvedValue({ myRating: null, rating: { average: 4.5, count: 2 } });
    view();
    const star = await screen.findByRole('button', { name: '5 sao' });
        await userEvent.click(star);
    expect(api.setRating).toHaveBeenCalledWith('tok', 'l1', 5);
    expect(await screen.findByText('4,7 / 5 sao · 3 đánh giá')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '5 sao' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Gỡ đánh giá' }));
    expect(await screen.findByText('4,5 / 5 sao · 2 đánh giá')).toBeInTheDocument();
  });

  it('gửi bình luận gốc rồi tải lại danh sách; trả lời gửi parentId', async () => {
    signIn();
    pubApi.fetchCommunity.mockResolvedValue(pubData());
    api.myCommunity.mockResolvedValue(mineData());
    api.createComment.mockResolvedValue({ ...comment({ id: 'new' }), isHidden: false });
    view();
    await userEvent.type(await screen.findByLabelText('Bình luận của bạn'), 'Rất hữu ích');
    await userEvent.click(screen.getByRole('button', { name: 'Gửi bình luận' }));
    expect(api.createComment).toHaveBeenCalledWith('tok', 'l1', { body: 'Rất hữu ích', parentId: null });
    await waitFor(() => expect(pubApi.fetchCommunity).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Bình luận của bạn')).toHaveValue('');

    await userEvent.click(screen.getAllByRole('button', { name: 'Trả lời' })[0]!);
    await userEvent.type(screen.getByLabelText('Trả lời'), 'Đồng ý');
    await userEvent.click(within(screen.getByLabelText('Trả lời').closest('form')!).getByRole('button', { name: 'Gửi bình luận' }));
    expect(api.createComment).toHaveBeenLastCalledWith('tok', 'l1', { body: 'Đồng ý', parentId: 'k1' });
  });

  it('chỉ bình luận của mình có Sửa/Xoá; sửa và xoá gọi API; xoá cần xác nhận', async () => {
    signIn();
    pubApi.fetchCommunity.mockResolvedValue(pubData());
    api.myCommunity.mockResolvedValue(mineData({ comments: [{ ...comment(), isHidden: false }] }));
    api.editComment.mockResolvedValue({ ...comment({ body: 'Đã sửa', edited: true }), isHidden: false });
    api.deleteComment.mockResolvedValue(undefined);
    view();
    await screen.findByRole('button', { name: 'Sửa' });
    expect(screen.getAllByRole('button', { name: 'Sửa' })).toHaveLength(1); // chỉ bình luận của mình, không phải của Minh
    await userEvent.click(screen.getByRole('button', { name: 'Sửa' }));
    const box = screen.getByDisplayValue('Bài hay');
    await userEvent.clear(box);
    await userEvent.type(box, 'Đã sửa');
    await userEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(api.editComment).toHaveBeenCalledWith('tok', 'k1', 'Đã sửa');

    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    await userEvent.click(await screen.findByRole('button', { name: 'Xoá' }));
    expect(api.deleteComment).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    expect(api.deleteComment).toHaveBeenCalledWith('tok', 'k1');
  });

  it('bình luận của mình bị ẩn: không hiện công khai nhưng hiện kèm nhãn trong khối riêng và vẫn xoá được', async () => {
    signIn();
    pubApi.fetchCommunity.mockResolvedValue(pubData({ comments: [] }));
    api.myCommunity.mockResolvedValue(mineData({ comments: [{ ...comment({ body: 'Bị ẩn' }), isHidden: true }] }));
    view();
    expect(await screen.findByText('Bình luận của bạn đang bị ẩn')).toBeInTheDocument();
    expect(screen.getByText('Quản trị đã ẩn bình luận này')).toBeInTheDocument();
    expect(screen.getByText('Bị ẩn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeInTheDocument();
  });

  it('lỗi gửi: 429, chưa xác minh email, trùng, 400, 404 hiện thông báo riêng và giữ chữ đã gõ', async () => {
    signIn();
    pubApi.fetchCommunity.mockResolvedValue(pubData());
    api.myCommunity.mockResolvedValue(mineData());
    view();
    await userEvent.type(await screen.findByLabelText('Bình luận của bạn'), 'abc');
    const submit = screen.getByRole('button', { name: 'Gửi bình luận' });
    const cases: [ApiError, string][] = [
      [new ApiError(429, 'TOO_MANY_REQUESTS', 'x'), 'quá nhanh'],
      [new ApiError(402, 'PLAN_REQUIRED', 'x'), 'Cần đăng ký gói'],
      [new ApiError(403, 'EMAIL_NOT_VERIFIED', 'x'), 'xác minh email'],
      [new ApiError(409, 'RESOURCE_IN_USE', 'x'), 'giống hệt'],
      [new ApiError(400, 'VALIDATION_FAILED', 'x'), 'tối đa 2 link'],
      [new ApiError(404, 'NOT_FOUND', 'x'), 'không còn mở bình luận'],
    ];
    for (const [err, text] of cases) {
      api.createComment.mockRejectedValueOnce(err);
      await userEvent.click(submit);
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(text));
    }
    expect(screen.getByLabelText('Bình luận của bạn')).toHaveValue('abc');
  });

  it('xem thêm nối trang kế; tải công khai lỗi báo lỗi', async () => {
    signOut();
    pubApi.fetchCommunity.mockResolvedValueOnce(pubData({ nextCursor: 'cur' }));
    pubApi.fetchCommunity.mockResolvedValueOnce(pubData({ comments: [{ ...comment({ id: 'k2', body: 'Trang hai' }), replies: [] }], nextCursor: null }));
    view();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm bình luận' }));
    expect(pubApi.fetchCommunity).toHaveBeenLastCalledWith('l1', 'cur');
    expect(await screen.findByText('Trang hai')).toBeInTheDocument();
    expect(screen.getByText('Bài hay')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem thêm bình luận' })).toBeNull();
  });

  it('"Xem thêm" lỗi báo ở chỗ nút (không lẫn vào lỗi form); kết quả về muộn sau khi đổi bài bị bỏ', async () => {
    signOut();
    pubApi.fetchCommunity.mockResolvedValueOnce(pubData({ nextCursor: 'cur' }));
    pubApi.fetchCommunity.mockRejectedValueOnce(new Error('boom'));
    const { rerender } = view();
    await userEvent.click(await screen.findByRole('button', { name: 'Xem thêm bình luận' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được bình luận.');

    let release: (v: unknown) => void = () => {};
    pubApi.fetchCommunity.mockReturnValueOnce(new Promise((r) => (release = r)));
    await userEvent.click(screen.getByRole('button', { name: 'Xem thêm bình luận' }));
    pubApi.fetchCommunity.mockResolvedValueOnce(pubData({ comments: [{ ...comment({ id: 'other', body: 'Bài khác' }), replies: [] }] }));
    rerender(withIntl(<LessonCommunity lessonId="l2" />, 'vi'));
    expect(await screen.findByText('Bài khác')).toBeInTheDocument();
    release(pubData({ comments: [{ ...comment({ id: 'late', body: 'Muộn của bài cũ' }), replies: [] }], nextCursor: null }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText('Muộn của bài cũ')).not.toBeInTheDocument();
  });

  it('sao dùng được ngay cả khi phần "của tôi" tải lỗi; trung bình theo định dạng ngôn ngữ', async () => {
    signIn();
    pubApi.fetchCommunity.mockResolvedValue(pubData());
    api.myCommunity.mockRejectedValue(new Error('boom'));
    api.setRating.mockResolvedValue({ myRating: 3, rating: { average: 4.5, count: 3 } });
    view();
    expect(await screen.findByText('4,5 / 5 sao · 2 đánh giá')).toBeInTheDocument();
    const star = screen.getByRole('button', { name: '3 sao' });
    expect(star).toBeEnabled();
    await userEvent.click(star);
    expect(api.setRating).toHaveBeenCalledWith('tok', 'l1', 3);
  });

  it('tải công khai lỗi hiện thông báo', async () => {
    signOut();
    pubApi.fetchCommunity.mockRejectedValue(new Error('boom'));
    view();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được bình luận.');
  });

  it('đổi tài khoản không lộ nút sửa/xoá của người trước', async () => {
    signIn('c1');
    pubApi.fetchCommunity.mockResolvedValue(pubData());
    api.myCommunity.mockResolvedValueOnce(mineData({ comments: [{ ...comment(), isHidden: false }] }));
    const { rerender } = view();
    expect(await screen.findByRole('button', { name: 'Sửa' })).toBeInTheDocument();
    let release: (v: unknown) => void = () => {};
    api.myCommunity.mockReturnValueOnce(new Promise((r) => (release = r)));
    signIn('c2');
    rerender(withIntl(<LessonCommunity lessonId="l1" />, 'vi'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Sửa' })).toBeNull());
    release(mineData());
  });
});
