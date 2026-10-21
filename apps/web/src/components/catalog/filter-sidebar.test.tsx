import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import type { FilterGroup } from '@/lib/filter-groups';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, scroll: _scroll, ...rest }: { href: string; children: React.ReactNode; scroll?: boolean }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CatalogShell } from './catalog-shell';
import { FILTER_VISIBLE, FilterSidebar } from './filter-sidebar';

const items = (n: number, selected = -1) =>
  Array.from({ length: n }, (_, i) => ({ key: `k${i}`, label: `Item ${i}`, count: i + 1, href: `/search?genre=k${i}`, selected: i === selected }));
const group = (id: FilterGroup['id'], n: number, selected = -1): FilterGroup => ({ id, title: `Group ${id}`, items: items(n, selected) });

describe('FilterSidebar', () => {
  it('mỗi nhóm có tiêu đề, danh sách link kèm số lượng; mục đang chọn có aria-current và chữ "selected" cho trình đọc màn hình', () => {
    render(withIntl(<FilterSidebar groups={[group('level', 3, 1)]} />));
    expect(screen.getByRole('heading', { name: 'Group level' })).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(3);
    expect(links[1]).toHaveAttribute('aria-current', 'true');
    expect(links[1]).toHaveTextContent('selected');
    expect(links[0]).not.toHaveAttribute('aria-current');
    expect(links[2]).toHaveTextContent('3');
  });

  it(`nhóm dài: hiện ${FILTER_VISIBLE} mục đầu, phần còn lại sau "Show all" (details), không cần JS`, () => {
    const { container } = render(withIntl(<FilterSidebar groups={[group('genre', 12)]} />));
    const details = container.querySelector('details')!;
    expect(details).not.toHaveAttribute('open');
    expect(within(details).getAllByRole('link', { hidden: true })).toHaveLength(12 - FILTER_VISIBLE);
    expect(screen.getByText('Show all (4)')).toBeInTheDocument();
    // Tám mục đầu nằm ngoài details.
    expect(container.querySelectorAll('section > ul > li')).toHaveLength(FILTER_VISIBLE);
  });

  it('mục đang chọn nằm ngoài 8 mục đầu vẫn luôn hiện (không bị giấu trong "Show all")', () => {
    const { container } = render(withIntl(<FilterSidebar groups={[group('composer', 12, 10)]} />));
    expect(container.querySelectorAll('section > ul > li')).toHaveLength(FILTER_VISIBLE + 1);
    const visible = container.querySelector('section > ul')!;
    expect(within(visible as HTMLElement).getByRole('link', { name: /Item 10/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Show all (3)')).toBeInTheDocument();
  });

  it('nhóm vừa đủ không có "Show all"; mục không có số thì không hiện số', () => {
    const noCount: FilterGroup = { id: 'format', title: 'Format', items: [{ key: 'pdf', label: 'PDF', href: '/search?format=pdf', selected: false }] };
    const { container } = render(withIntl(<FilterSidebar groups={[group('level', FILTER_VISIBLE), noCount]} />));
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByRole('link', { name: 'PDF' }).textContent).toBe('PDF');
  });
});

describe('CatalogShell + FilterDrawer', () => {
  const shell = (count: number) =>
    render(
      withIntl(
        <CatalogShell count={count} filters={<FilterSidebar groups={[group('level', 2)]} />}>
          <h1>Kết quả</h1>
        </CatalogShell>,
      ),
    );

  it('có vùng bộ lọc (aside) và <main> kết quả; nút Bộ lọc đóng mặc định và hiện số bộ lọc đang áp dụng', () => {
    shell(2);
    expect(screen.getByRole('complementary', { name: 'Filters' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('Kết quả');
    const button = screen.getByRole('button', { name: /Filters/ });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveTextContent('2');
  });

  it('bấm nút mở/đóng panel; bấm một link trong panel thì panel đóng (vì là điều hướng)', () => {
    shell(0);
    const button = screen.getByRole('button', { name: /Filters/ });
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect(panel).toHaveClass('hidden');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(panel).toHaveClass('block');
    fireEvent.click(within(panel).getAllByRole('link')[0]!);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(panel).toHaveClass('hidden');
    expect(button).not.toHaveTextContent(/\d/);
  });
});
