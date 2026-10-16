import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/components/sheet/midi-player', () => ({ MidiPlayer: () => null }));
vi.mock('./lesson-community', () => ({ LessonCommunity: () => null })); // có test riêng
const auth = vi.hoisted(() => ({ value: null as unknown }));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
const api = vi.hoisted(() => ({ lessonSubmission: vi.fn() }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));

import { LessonView } from './lesson-view';

const lesson = {
  id: 'lesson-xyz',
  title: 'Bài A',
  youtubeUrl: null,
  content: 'x',
  durationMinutes: null,
  midi: null,
  track: { slug: 'ky-thuat', title: 'Kỹ thuật' },
  level: { id: 'lv', title: 'Cơ bản' },
  section: { id: 's1', title: 'Gam' },
  prev: null,
  next: null,
} as never;

beforeEach(() => vi.resetAllMocks());

describe('LessonView gắn khối nộp bài (C3)', () => {
  it('khách chưa đăng nhập thấy nút "Đăng nhập để nộp bài" ở trang bài', () => {
    auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth: vi.fn() };
    render(withIntl(<LessonView lesson={lesson} order={[]} />, 'vi'));
    expect(screen.getByRole('button', { name: 'Đăng nhập để nộp bài' })).toBeInTheDocument();
  });

  it('đã đăng nhập: tải bài nộp đúng id bài đang xem', async () => {
    auth.value = { status: 'authenticated', customer: { id: 'c1' }, getToken: async () => 'tok', openAuth: vi.fn() };
    api.lessonSubmission.mockResolvedValue({ submission: null });
    render(withIntl(<LessonView lesson={lesson} order={[]} />, 'vi'));
    await waitFor(() => expect(api.lessonSubmission).toHaveBeenCalledWith('tok', 'lesson-xyz'));
  });
});
