import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicLesson, PublicTrackTree } from '@piano-daily/shared';
import { withIntl } from '@/components/layout/test-utils';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));
vi.mock('@/components/sheet/midi-player', () => ({
  MidiPlayer: ({ noteJsonUrl }: { noteJsonUrl: string }) => <div data-testid="player">{noteJsonUrl}</div>,
}));

import { LessonView } from './lesson-view';
import { SafeMarkdown } from './safe-markdown';
import { TrackCard } from './track-card';
import { TrackView } from './track-view';

const lesson = (over: Partial<PublicLesson> = {}): PublicLesson => ({
  id: 'l1',
  title: 'Bài 1',
  youtubeUrl: null,
  content: '',
  durationMinutes: 5,
  midi: null,
  track: { slug: 'ky-thuat', title: 'Kỹ thuật' },
  level: { id: 'lv', title: 'Cơ bản' },
  section: { id: 's', title: 'Gam' },
  prev: null,
  next: null,
  ...over,
} as PublicLesson);

describe('khoá học (web)', () => {
  it('thẻ nhánh: số bài, 0% và thanh tiến độ', () => {
    render(withIntl(<ul><TrackCard track={{ slug: 'ky-thuat', title: 'Kỹ thuật', description: '', lessonCount: 695 } as never} /></ul>, 'vi'));
    expect(screen.getByText('0/695 bài · 0%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('link', { name: 'Kỹ thuật' })).toHaveAttribute('href', '/courses/ky-thuat');
  });

  it('bài chỉ có nội dung: không player, không video', () => {
    render(withIntl(<LessonView lesson={lesson({ content: 'Xin chào **lớp**' })} />, 'vi'));
    expect(screen.queryByTestId('player')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(screen.getByText('lớp')).toBeInTheDocument();
  });

  it('bài có nhạc và video: player + iframe nocookie; bài trước/sau', () => {
    render(
      withIntl(
        <LessonView
          lesson={lesson({
            youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ',
            midi: { noteJsonUrl: 'https://cdn/x.json', durationSeconds: 3, noteCount: 4 },
            prev: { id: 'p', title: 'Trước' },
            next: { id: 'n', title: 'Sau' },
          } as never)}
        />,
        'vi',
      ),
    );
    expect(screen.getByTestId('player')).toHaveTextContent('https://cdn/x.json');
    expect(document.querySelector('iframe')?.getAttribute('src')).toContain('youtube-nocookie.com');
    expect(screen.getByRole('link', { name: /Sau/ })).toHaveAttribute('href', '/courses/ky-thuat/n');
    expect(screen.getByRole('link', { name: /Trước/ })).toHaveAttribute('href', '/courses/ky-thuat/p');
  });

  it('Markdown không chèn HTML thô và không tải ảnh ngoài', () => {
    const { container } = render(<SafeMarkdown markdown={'<script>alert(1)</script>\n\n![x](http://evil/a.png)'} />);
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('lộ trình rỗng hiện thông báo', () => {
    render(withIntl(<TrackView track={{ slug: 't', title: 'T', description: '', lessonCount: 0, levels: [] } as PublicTrackTree} />, 'vi'));
    expect(screen.getByText('Nhánh này chưa có bài nào được công khai.')).toBeInTheDocument();
  });
});
