import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { PublicTrackTree } from '@piano-daily/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/sheet/midi-player', () => ({ MidiPlayer: () => null }));
vi.mock('./lesson-submission', () => ({ LessonSubmission: () => null })); // có test riêng

const auth = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
const api = vi.hoisted(() => ({ courseProgress: vi.fn(), setLessonCompletion: vi.fn() }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));

import { CourseProgressProvider } from './course-progress';
import { LessonView } from './lesson-view';
import { TrackCard } from './track-card';
import { TrackView } from './track-view';

const openAuth = vi.fn();
const signIn = (id = 'c1') => {
  auth.value = { status: 'authenticated', customer: { id, email: `${id}@x.com` }, getToken: async () => 'tok', openAuth };
};
const signOut = () => {
  auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
};

const track = {
  slug: 'ky-thuat',
  title: 'Kỹ thuật',
  description: '',
  lessonCount: 3,
  levels: [
    {
      id: 'lv',
      title: 'Cơ bản',
      description: '',
      sections: [
        {
          id: 's1',
          title: 'Gam',
          description: '',
          lessons: [
            { id: 'a', title: 'Bài A', durationMinutes: null, hasVideo: false, hasMusic: false },
            { id: 'b', title: 'Bài B', durationMinutes: null, hasVideo: false, hasMusic: false },
            { id: 'c', title: 'Bài C', durationMinutes: null, hasVideo: false, hasMusic: false },
          ],
        },
      ],
    },
  ],
} as PublicTrackTree;
const order = track.levels[0]!.sections[0]!.lessons.map((l) => ({ id: l.id, title: l.title }));
const lessonA = {
  id: 'a',
  title: 'Bài A',
  youtubeUrl: null,
  content: 'x',
  durationMinutes: null,
  midi: null,
  track: { slug: 'ky-thuat', title: 'Kỹ thuật' },
  level: { id: 'lv', title: 'Cơ bản' },
  section: { id: 's1', title: 'Gam' },
  prev: null,
  next: { id: 'b', title: 'Bài B' },
} as never;

const app = (ui: React.ReactNode) => withIntl(<CourseProgressProvider>{ui}</CourseProgressProvider>, 'vi');

beforeEach(() => {
  api.courseProgress.mockReset();
  api.setLessonCompletion.mockReset();
  openAuth.mockReset();
});

describe('tiến độ khoá học (web)', () => {
  it('khách: 0%, không dấu ✓, nút mời đăng nhập mở modal, không gọi API', async () => {
    signOut();
    render(app(<><ul><TrackCard track={{ slug: 'ky-thuat', title: 'Kỹ thuật', description: '', lessonCount: 3 }} /></ul><LessonView lesson={lessonA} order={order} /></>));
    expect(screen.getByText('0/3 bài · 0%')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập để lưu tiến độ' }));
    expect(openAuth).toHaveBeenCalledWith('login');
    expect(api.courseProgress).not.toHaveBeenCalled();
  });

  it('đã đăng nhập: thẻ nhánh, trang nhánh hiện số bài/% thật, dấu ✓, x/y theo level/section và "Tiếp tục học"', async () => {
    signIn();
    api.courseProgress.mockResolvedValue({ tracks: [{ slug: 'ky-thuat', completed: 2 }], lessonIds: ['a', 'b'] });
    render(app(<><ul><TrackCard track={{ slug: 'ky-thuat', title: 'Kỹ thuật', description: '', lessonCount: 3 }} /></ul><TrackView track={track} /></>));
    expect(await screen.findByText('2/3 bài · 67%')).toBeInTheDocument();
    expect(screen.getAllByText('2/3 bài')).toHaveLength(2); // level + section
    expect(screen.getAllByText('Đã học')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Tiếp tục học: Bài C/ })).toHaveAttribute('href', '/courses/ky-thuat/c');
  });

  it('chưa học bài nào: "Bắt đầu học"; học hết: thông báo hoàn thành, không nút', async () => {
    signIn();
    api.courseProgress.mockResolvedValue({ tracks: [], lessonIds: [] });
    const { unmount } = render(app(<TrackView track={track} />));
    expect(await screen.findByRole('link', { name: 'Bắt đầu học' })).toHaveAttribute('href', '/courses/ky-thuat/a');
    unmount();
    api.courseProgress.mockResolvedValue({ tracks: [{ slug: 'ky-thuat', completed: 3 }], lessonIds: ['a', 'b', 'c'] });
    render(app(<TrackView track={track} />));
    expect(await screen.findByText(/hoàn thành toàn bộ nhánh/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Tiếp tục học|Bắt đầu học/ })).toBeNull();
  });

  it('trang bài: đánh dấu lạc quan, gợi ý bài kế chưa học, bỏ đánh dấu', async () => {
    signIn();
    api.courseProgress.mockResolvedValue({ tracks: [{ slug: 'ky-thuat', completed: 1 }], lessonIds: ['b'] });
    api.setLessonCompletion.mockResolvedValue({ completed: true });
    render(app(<LessonView lesson={lessonA} order={order} />));
    const mark = await screen.findByRole('button', { name: 'Đánh dấu hoàn thành' });
    expect(mark).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(mark);
    expect(api.setLessonCompletion).toHaveBeenCalledWith('tok', 'a', true);
    const unmark = await screen.findByRole('button', { name: 'Đánh dấu hoàn thành', pressed: true });
    // B đã học nên bài kế chưa học sau A là C.
    expect(screen.getByRole('link', { name: /Bài tiếp theo chưa học: Bài C/ })).toHaveAttribute('href', '/courses/ky-thuat/c');
    api.setLessonCompletion.mockResolvedValue({ completed: false });
    await userEvent.click(unmark);
    expect(await screen.findByRole('button', { name: 'Đánh dấu hoàn thành', pressed: false })).toBeInTheDocument();
    expect(api.setLessonCompletion).toHaveBeenLastCalledWith('tok', 'a', false);
  });

  it('lỗi mạng khi đánh dấu: hoàn lại trạng thái và báo lỗi', async () => {
    signIn();
    api.courseProgress.mockResolvedValue({ tracks: [], lessonIds: [] });
    api.setLessonCompletion.mockRejectedValue(new Error('net'));
    render(app(<LessonView lesson={lessonA} order={order} />));
    await userEvent.click(await screen.findByRole('button', { name: 'Đánh dấu hoàn thành' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Chưa lưu được tiến độ');
    const again = screen.getByRole('button', { name: 'Đánh dấu hoàn thành' });
    expect(again).toHaveAttribute('aria-pressed', 'false');
    expect(again).toBeEnabled();
    api.setLessonCompletion.mockResolvedValue({ completed: true });
    await userEvent.click(again); // thử lại được
    expect(await screen.findByRole('button', { name: 'Đánh dấu hoàn thành', pressed: true })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('đăng xuất: tiến độ biến mất; đổi tài khoản không hiện dữ liệu người trước', async () => {
    signIn('c1');
    api.courseProgress.mockResolvedValue({ tracks: [{ slug: 'ky-thuat', completed: 2 }], lessonIds: ['a', 'b'] });
    const card = <ul><TrackCard track={{ slug: 'ky-thuat', title: 'Kỹ thuật', description: '', lessonCount: 3 }} /></ul>;
    const { rerender } = render(app(card));
    expect(await screen.findByText('2/3 bài · 67%')).toBeInTheDocument();
    api.courseProgress.mockReturnValue(new Promise(() => {})); // c2 chưa tải xong
    signIn('c2');
    rerender(app(card));
    expect(screen.getByText('0/3 bài · 0%')).toBeInTheDocument();
    signOut();
    rerender(app(card));
    await waitFor(() => expect(screen.getByText('0/3 bài · 0%')).toBeInTheDocument());
  });

  it('đăng xuất sau khi đã tải: xoá tiến độ; đăng nhập lại cùng tài khoản không thấy dữ liệu cũ trước khi tải xong', async () => {
    signIn('c1');
    api.courseProgress.mockResolvedValue({ tracks: [{ slug: 'ky-thuat', completed: 2 }], lessonIds: ['a', 'b'] });
    const card = <ul><TrackCard track={{ slug: 'ky-thuat', title: 'Kỹ thuật', description: '', lessonCount: 3 }} /></ul>;
    const { rerender } = render(app(card));
    expect(await screen.findByText('2/3 bài · 67%')).toBeInTheDocument();
    signOut();
    rerender(app(card));
    await waitFor(() => expect(screen.getByText('0/3 bài · 0%')).toBeInTheDocument());
    api.courseProgress.mockReturnValue(new Promise(() => {}));
    signIn('c1');
    rerender(app(card));
    expect(screen.getByText('0/3 bài · 0%')).toBeInTheDocument();
  });

  it('tải tiến độ lỗi: vẫn đánh dấu được; đang khôi phục phiên: không hiện lời mời đăng nhập', async () => {
    signIn();
    api.courseProgress.mockRejectedValue(new Error('500'));
    api.setLessonCompletion.mockResolvedValue({ completed: true });
    const { unmount } = render(app(<LessonView lesson={lessonA} order={order} />));
    const mark = await screen.findByRole('button', { name: 'Đánh dấu hoàn thành' });
    await waitFor(() => expect(mark).toBeEnabled());
    await userEvent.click(mark);
    expect(await screen.findByRole('button', { name: 'Đánh dấu hoàn thành', pressed: true })).toBeInTheDocument();
    unmount();
    auth.value = { status: 'loading', customer: null, getToken: async () => null, openAuth };
    render(app(<><LessonView lesson={lessonA} order={order} /><TrackView track={track} /></>));
    expect(screen.queryByRole('button', { name: 'Đăng nhập để lưu tiến độ' })).toBeNull();
  });

  it('trang nhánh: khách thấy lời mời đăng nhập', async () => {
    signOut();
    render(app(<TrackView track={track} />));
    await userEvent.click(screen.getByRole('button', { name: 'Đăng nhập để lưu tiến độ' }));
    expect(openAuth).toHaveBeenCalledWith('login');
  });

  it('bài cuối: quay vòng lên bài chưa học đầu tiên; học hết thì báo hoàn thành nhánh', async () => {
    signIn();
    api.courseProgress.mockResolvedValue({ tracks: [{ slug: 'ky-thuat', completed: 2 }], lessonIds: ['b', 'c'] });
    api.setLessonCompletion.mockResolvedValue({ completed: true });
    const lessonC = { ...(lessonA as object), id: 'c', title: 'Bài C' } as never;
    render(app(<LessonView lesson={lessonC} order={order} />));
    // C đã học, A chưa: sau C quay vòng về A.
    expect(await screen.findByRole('link', { name: /Bài tiếp theo chưa học: Bài A/ })).toHaveAttribute('href', '/courses/ky-thuat/a');
  });

  it('bấm liên tiếp: PUT đến server theo đúng thứ tự bấm', async () => {
    signIn();
    api.courseProgress.mockResolvedValue({ tracks: [], lessonIds: [] });
    const calls: boolean[] = [];
    api.setLessonCompletion.mockImplementation(async (_t: string, _id: string, done: boolean) => {
      await new Promise((r) => setTimeout(r, done ? 20 : 0));
      calls.push(done);
      return { completed: done };
    });
    render(app(<LessonView lesson={lessonA} order={order} />));
    const mark = await screen.findByRole('button', { name: 'Đánh dấu hoàn thành' });
    await waitFor(() => expect(mark).toBeEnabled());
    await userEvent.click(mark); // true (chậm)
    await waitFor(() => expect(api.setLessonCompletion).toHaveBeenCalledTimes(1));
    // Panel khoá nút khi đang gửi nên gọi thẳng provider qua nút còn lại sau khi xong; kiểm hàng đợi bằng hai lần bấm liên tiếp sau đó.
    await waitFor(() => expect(calls).toEqual([true]));
    await userEvent.click(await screen.findByRole('button', { name: 'Đánh dấu hoàn thành', pressed: true }));
    await waitFor(() => expect(calls).toEqual([true, false]));
  });
});
