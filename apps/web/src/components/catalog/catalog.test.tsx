import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { PublicSheetItem } from '@piano-daily/shared';
import { withIntl } from '../layout/test-utils';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { GenreTags } from './genre-tags';
import { Pagination, pageWindow } from './pagination';
import { SheetCard } from './sheet-card';
import { SheetCardSkeleton } from './sheet-card-skeleton';
import { SortLinks } from './sort-links';

const sheet: PublicSheetItem = {
  id: 'i1',
  publicId: 1,
  slug: 'fur-elise',
  title: 'Für Elise',
  level: 'BEGINNER',
  composer: { id: 'c1', name: 'Beethoven' },
  viewCount: 42,
  hasSheet: true,
  hasChords: false,
  hasMidi: true,
  hasMp3: false,
  hasVideo: false,
  pageCount: 3,
  isHot: true,
  thumbnailUrl: 'http://cdn/x.webp',
};

describe('SheetCard', () => {
  it('cả thẻ là link tới trang chi tiết; alt đúng; chỉ nhãn định dạng có thật; badge HOT', () => {
    render(withIntl(<SheetCard sheet={sheet} />));
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/sheet/fur-elise');
    const img = within(link).getByRole('img');
    expect(img).toHaveAttribute('alt', 'Für Elise – page 1');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(within(link).getByText('Midi')).toBeInTheDocument();
    expect(within(link).getByText('Sheet')).toBeInTheDocument();
    expect(within(link).queryByText('Mp3')).toBeNull();
    expect(within(link).queryByText('Chords')).toBeNull();
    expect(within(link).getByText('HOT')).toBeInTheDocument();
    expect(within(link).getByText('Beginner')).toBeInTheDocument();
    expect(within(link).getByText(/Beethoven/)).toHaveTextContent('42 views');
  });

  it('không HOT thì không có badge; thiếu thumbnail thì có placeholder', () => {
    render(withIntl(<SheetCard sheet={{ ...sheet, isHot: false, thumbnailUrl: null }} />, 'vi'));
    expect(screen.queryByText('HOT')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Chưa có bản xem trước')).toBeInTheDocument();
  });
});

describe('SheetCardSkeleton', () => {
  it('render ẩn khỏi trợ năng', () => {
    render(<SheetCardSkeleton />);
    expect(screen.getByTestId('sheet-card-skeleton')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('GenreTags', () => {
  const genres = [
    { id: 'g1', slug: 'jazz', name: 'Jazz', count: 3 },
    { id: 'g2', slug: 'pop', name: 'Pop', count: 1 },
  ];

  it('link giữ sort, đặt genre, bỏ page; tag chọn nền secondary và bấm lại bỏ lọc', () => {
    render(withIntl(<GenreTags level="beginner" genres={genres} selectedSlug="jazz" sort="most_viewed" />));
    const jazz = screen.getByRole('link', { name: /Jazz/ });
    expect(jazz).toHaveAttribute('href', '/level/beginner?sort=most_viewed');
    expect(jazz).toHaveClass('bg-secondary');
    const pop = screen.getByRole('link', { name: /Pop/ });
    expect(pop).toHaveAttribute('href', '/level/beginner?genre=pop&sort=most_viewed');
    expect(pop).not.toHaveClass('bg-secondary');
    expect(screen.getByRole('link', { name: 'All' })).toHaveAttribute('href', '/level/beginner?sort=most_viewed');
  });

  it('chưa chọn thì "Tất cả" được chọn', () => {
    render(withIntl(<GenreTags level="expert" genres={genres} selectedSlug={undefined} sort="newest" />));
    expect(screen.getByRole('link', { name: 'All' })).toHaveClass('bg-secondary');
    expect(screen.getByRole('link', { name: /Jazz/ })).toHaveAttribute('href', '/level/expert?genre=jazz');
  });
});

describe('SortLinks', () => {
  it('giữ genre và đánh dấu lựa chọn hiện tại', () => {
    render(withIntl(<SortLinks level="beginner" genre="jazz" sort="newest" />));
    expect(screen.getByRole('link', { name: 'Newest' })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('link', { name: 'Most viewed' })).toHaveAttribute(
      'href',
      '/level/beginner?genre=jazz&sort=most_viewed',
    );
  });
});

describe('Pagination', () => {
  const hrefFor = (p: number) => `/level/beginner?page=${p}`;

  it('một trang thì không render', () => {
    const { container } = render(withIntl(<Pagination page={1} pageSize={12} total={12} hrefFor={hrefFor} />));
    expect(container).toBeEmptyDOMElement();
  });

  it('có Trước/Sau và số trang, mỗi trang một URL', () => {
    render(withIntl(<Pagination page={2} pageSize={12} total={30} hrefFor={hrefFor} />));
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/level/beginner?page=1');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/level/beginner?page=3');
    expect(screen.getByRole('link', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
  });

  it('trang đầu không có Trước, trang cuối không có Sau', () => {
    const { rerender } = render(withIntl(<Pagination page={1} pageSize={12} total={30} hrefFor={hrefFor} />));
    expect(screen.queryByRole('link', { name: 'Previous' })).toBeNull();
    rerender(withIntl(<Pagination page={3} pageSize={12} total={30} hrefFor={hrefFor} />));
    expect(screen.queryByRole('link', { name: 'Next' })).toBeNull();
  });

  it('pageWindow rút gọn bằng dấu ba chấm', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10]);
  });
});
