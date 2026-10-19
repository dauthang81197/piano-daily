import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicTrackTree } from '@piano-daily/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { ApiError } from '@/lib/public-api';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/sheet/midi-player', () => ({ MidiPlayer: ({ noteJsonUrl }: { noteJsonUrl: string }) => <div data-testid="player">{noteJsonUrl}</div> }));
vi.mock('./lesson-community', () => ({ LessonCommunity: () => null }));
vi.mock('./lesson-submission', () => ({ LessonSubmission: () => null }));
vi.mock('./course-progress', () => ({
  LessonProgressPanel: () => null,
  LessonDoneMark: () => null,
  ScopeProgress: () => null,
  ContinueLearning: () => null,
  TrackCardProgress: () => null,
}));
const auth = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
const api = vi.hoisted(() => ({ lessonFull: vi.fn() }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));

import { LessonView } from './lesson-view';
import { TrackView } from './track-view';

const openAuth = vi.fn();
const signIn = (id = 'c1') => {
  auth.value = { status: 'authenticated', customer: { id }, getToken: async () => 'tok', openAuth };
};
const signOut = () => {
  auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
};
const lesson = (over: object = {}) =>
  ({
    id: 'l1',
    title: 'Bài khoá',
    youtubeUrl: null,
    content: '',
    durationMinutes: 5,
    midi: null,
    locked: true,
    track: { slug: 'ky-thuat', title: 'Kỹ thuật' },
    level: { id: 'lv', title: 'Cơ bản' },
    section: { id: 's1', title: 'Gam' },
    prev: null,
    next: null,
    ...over,
  }) as never;
const full = { youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', content: 'Nội dung đầy đủ', midi: { noteJsonUrl: 'https://cdn/x.json', durationSeconds: 3, noteCount: 4 } };
const view = (over: object = {}) => render(withIntl(<LessonView lesson={lesson(over)} order={[]} />, 'vi'));

beforeEach(() => vi.resetAllMocks());

describe('Bài khoá theo thuê bao (C5)', () => {
  it('khách chưa đăng nhập: không có nội dung, thấy lời mời đăng nhập và link gói; không gọi API', async () => {
    signOut();
    view();
    expect(screen.getByRole('heading', { name: 'Bài học dành cho thành viên' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(openAuth).toHaveBeenCalledWith('login');
    expect(screen.getByRole('link', { name: 'Xem các gói' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByTestId('player')).toBeNull();
    expect(api.lessonFull).not.toHaveBeenCalled();
  });

  it('đang khôi phục phiên: không nhấp nháy lời mời', () => {
    auth.value = { status: 'loading', customer: null, getToken: async () => null, openAuth };
    view();
    expect(screen.queryByRole('heading', { name: 'Bài học dành cho thành viên' })).toBeNull();
  });

  it('khách có gói: tải bản đầy đủ rồi hiện nhạc, video và nội dung', async () => {
    signIn();
    api.lessonFull.mockResolvedValue(full);
    view();
    expect(await screen.findByText('Nội dung đầy đủ')).toBeInTheDocument();
    expect(api.lessonFull).toHaveBeenCalledWith('tok', 'l1', 'vi');
    expect(screen.getByTestId('player')).toHaveTextContent('https://cdn/x.json');
    expect(screen.queryByRole('heading', { name: 'Bài học dành cho thành viên' })).toBeNull();
  });

  it('đã đăng nhập nhưng chưa có gói (402): lời mời xem các gói, không có nút đăng nhập', async () => {
    signIn();
    api.lessonFull.mockRejectedValue(new ApiError(402, 'PLAN_REQUIRED', 'x', { reason: 'PLAN_REQUIRED' }));
    view();
    expect(await screen.findByText('Bạn cần một gói đang hoạt động để xem bài này.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem các gói' })).toHaveAttribute('href', '/pricing');
    expect(screen.queryByRole('button', { name: 'Đăng nhập' })).toBeNull();
  });

  it('phiên hết hạn (401 từ /full): mời đăng nhập lại thay vì báo lỗi chung', async () => {
    signIn();
    api.lessonFull.mockRejectedValue(new ApiError(401, 'UNAUTHORIZED', 'x'));
    view();
    await userEvent.click(await screen.findByRole('button', { name: 'Đăng nhập' }));
    expect(openAuth).toHaveBeenCalledWith('login');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('lỗi khác (mạng/500): báo lỗi, không đẩy sang trang gói', async () => {
    signIn();
    api.lessonFull.mockRejectedValue(new ApiError(500, 'INTERNAL_ERROR', 'x'));
    view();
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa tải được nội dung bài');
    expect(screen.queryByRole('link', { name: 'Xem các gói' })).toBeNull();
  });

  it('đổi tài khoản không để lộ nội dung đã tải của người trước', async () => {
    signIn('c1');
    api.lessonFull.mockResolvedValueOnce(full);
    const { rerender } = view();
    expect(await screen.findByText('Nội dung đầy đủ')).toBeInTheDocument();
    let release: (v: unknown) => void = () => {};
    api.lessonFull.mockReturnValueOnce(new Promise((r) => (release = r)));
    signIn('c2');
    rerender(withIntl(<LessonView lesson={lesson()} order={[]} />, 'vi'));
    await waitFor(() => expect(screen.queryByText('Nội dung đầy đủ')).toBeNull());
    release(full);
  });

  it('bài không khoá: hiện nội dung từ API công khai, không gọi API khách', () => {
    signOut();
    view({ locked: false, content: 'Nội dung mở', midi: null });
    expect(screen.getByText('Nội dung mở')).toBeInTheDocument();
    expect(api.lessonFull).not.toHaveBeenCalled();
  });

  it('trang nhánh đánh dấu ổ khoá cho bài khoá', () => {
    signOut();
    const track = {
      slug: 'ky-thuat', title: 'Kỹ thuật', description: '', lessonCount: 2,
      levels: [{ id: 'lv', title: 'Cơ bản', description: '', sections: [{ id: 's1', title: 'Gam', description: '', lessons: [
        { id: 'a', title: 'Bài A', durationMinutes: null, hasVideo: true, hasMusic: false, locked: true },
        { id: 'b', title: 'Bài B', durationMinutes: null, hasVideo: false, hasMusic: false, locked: false },
      ] }] }],
    } as PublicTrackTree;
    render(withIntl(<TrackView track={track} />, 'vi'));
    const a = screen.getByRole('link', { name: /Bài A/ });
    const b = screen.getByRole('link', { name: /Bài B/ });
    expect(a).toHaveTextContent('Thành viên');
    expect(b).not.toHaveTextContent('Thành viên');
  });
});
