import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PublicSheetDetail, PublicSheetItem } from '@piano-daily/shared';
import { withIntl } from '@/components/layout/test-utils';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SheetDetail } from './sheet-detail';

const item = (id: string, title: string): PublicSheetItem => ({
  id,
  publicId: 2,
  slug: `slug-${id}`,
  title,
  level: 'BEGINNER',
  composer: { id: 'c', name: 'Bach', slug: 'bach' },
  viewCount: 1,
  hasSheet: true,
  hasChords: false,
  hasMidi: false,
  hasMp3: false,
  hasVideo: false,
  pageCount: 1,
  isHot: false,
  thumbnailUrl: null,
  noteJsonUrl: null,
});

const full: PublicSheetDetail = {
  id: 's1',
  publicId: 1,
  slug: 'fur-elise',
  title: 'Für Elise',
  subtitle: 'Bagatelle No. 25',
  level: 'BEGINNER',
  difficultyScore: 15,
  difficultyNote: 'Phù hợp người mới',
  description: null,
  composer: { id: 'c1', name: 'Beethoven', slug: 'beethoven' },
  series: { id: 'se', name: 'Classics' },
  genres: [{ id: 'g1', name: 'Classical', slug: 'classical' }],
  pageCount: 2,
  viewCount: 1234,
  isHot: true,
  isFree: false,
  downloadTypes: ['PDF', 'MIDI', 'MP3'],
  updatedAt: '2026-10-05T00:00:00.000Z',
  pages: [
    { pageNumber: 1, url: 'http://cdn/1.webp' },
    { pageNumber: 2, url: 'http://cdn/2.webp' },
  ],
  midi: { noteJsonUrl: 'http://cdn/n.json', durationSeconds: 10, noteCount: 5 },
  youtubeUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  lyricsChords: '## Verse\n\n- **Am** la la',
  seriesSheets: [item('a', 'Series one')],
  related: [item('b', 'Related one')],
};

const bare: PublicSheetDetail = {
  ...full,
  subtitle: null,
  difficultyScore: null,
  difficultyNote: null,
  series: null,
  genres: [],
  isHot: false,
  pageCount: 0,
  pages: [],
  midi: null,
  youtubeUrl: null,
  lyricsChords: null,
  seriesSheets: [],
  related: [],
};

const view = (sheet: PublicSheetDetail, locale: 'vi' | 'en' = 'en') => render(withIntl(<SheetDetail sheet={sheet} />, locale));

describe('SheetDetail — nút tải (Story 3.2)', () => {
  const free = { ...full, isFree: true };
  const hrefs = (links: HTMLElement[]) => links.map((a) => a.getAttribute('href'));

  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://api.example:4000/'));

  it('Sheet free đủ 3 định dạng: nhóm nút, call-out MIDI/MP3 và PDF ở sidebar, đều là liên kết tải trực tiếp', () => {
    view(free);
    const group = screen.getByRole('region', { name: 'Downloads' });
    expect(hrefs(within(group).getAllByRole('link'))).toEqual([
      'http://api.example:4000/files/s1/pdf/download',
      'http://api.example:4000/files/s1/midi/download',
      'http://api.example:4000/files/s1/mp3/download',
    ]);
    const callout = screen.getByRole('region', { name: 'Download MIDI and MP3' });
    expect(within(callout).getAllByRole('link')).toHaveLength(2);
    expect(within(callout).queryByRole('link', { name: /PDF/ })).toBeNull();
    const aside = screen.getByRole('complementary');
    expect(hrefs(within(aside).getAllByRole('link', { name: /PDF/ }))).toEqual(['http://api.example:4000/files/s1/pdf/download']);
    for (const a of within(group).getAllByRole('link')) {
      expect(a.className).toContain('bg-secondary');
      expect(a).not.toHaveAttribute('aria-disabled');
    }
    expect(screen.queryAllByRole('button', { name: /Download/ })).toHaveLength(0);
  });

  it('thiếu MP3: không có nút hay liên kết MP3 (ẩn hẳn, không disable)', () => {
    view({ ...free, downloadTypes: ['PDF', 'MIDI'] });
    expect(screen.queryByRole('link', { name: /MP3/ })).toBeNull();
    expect(screen.getAllByRole('link', { name: /MIDI/ }).length).toBeGreaterThan(0);
  });

  it('chỉ có PDF: không có call-out MIDI/MP3', () => {
    view({ ...free, downloadTypes: ['PDF'] });
    expect(screen.queryByRole('region', { name: 'Download MIDI and MP3' })).toBeNull();
  });

  it('Sheet không free: không có nút Download nào', () => {
    view(full);
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Downloads' })).toBeNull();
  });

  it('route preview (showDownloads=false): không có nút dù Sheet free', () => {
    render(withIntl(<SheetDetail sheet={free} showDownloads={false} />, 'en'));
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
  });

  it('thiếu NEXT_PUBLIC_API_URL: không ném, không có nút', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    view(free);
    expect(screen.queryByRole('link', { name: /Download/ })).toBeNull();
  });

  it('tiếng Việt', () => {
    view(free, 'vi');
    expect(within(screen.getByRole('region', { name: 'Tải về' })).getAllByRole('link', { name: /Tải PDF/ })).toHaveLength(1);
  });
});

describe('SheetDetail', () => {
  it('đủ các khối theo thứ tự UX-DR22: breadcrumb → H1 → meta → ảnh → video → lyrics; sidebar riêng', () => {
    const { container } = view(full);
    const text = container.textContent ?? '';
    const order = ['Breadcrumb', 'Für Elise PDF, MIDI, MP4 & Tutorial', 'Composer', 'Sheet pages', 'Video', 'Lyrics & Chords'];
    const at = order.map((s) => (s === 'Breadcrumb' ? 0 : text.indexOf(s)));
    expect(at.every((n) => n >= 0)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Für Elise PDF, MIDI, MP4 & Tutorial');
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByText('Series one')).toBeInTheDocument();
    expect(within(aside).getByText('Related one')).toBeInTheDocument();
    expect(within(aside).getByText('In the same series')).toBeInTheDocument();
  });

  it('breadcrumb: Home › Level (link) › tên bài (trang hiện tại, không link)', () => {
    view(full);
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(within(nav).getByRole('link', { name: 'Home' })).toHaveAttribute('href', '/');
    expect(within(nav).getByRole('link', { name: 'Beginner' })).toHaveAttribute('href', '/level/beginner');
    expect(within(nav).queryByRole('link', { name: 'Für Elise' })).toBeNull();
    expect(within(nav).getByText('Für Elise')).toHaveAttribute('aria-current', 'page');
  });

  it('meta: badge Level và HOT, độ khó "15/100 — ghi chú", link Composer và Genre', () => {
    view(full);
    expect(screen.getByText('HOT')).toBeInTheDocument();
    expect(screen.getAllByText('Beginner').length).toBeGreaterThan(0);
    expect(screen.getByText('15/100 — Phù hợp người mới')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beethoven' })).toHaveAttribute('href', '/composer/beethoven');
    expect(screen.getByRole('link', { name: 'Classical' })).toHaveAttribute('href', '/genre/classical');
    expect(screen.getByText('Classics')).toBeInTheDocument();
    expect(screen.getByText('1,234')).toBeInTheDocument();
  });

  it('ảnh trang: alt "tên bài – trang N", trang 1 eager, các trang sau lazy', () => {
    view(full);
    const imgs = screen.getAllByRole('img');
    expect(imgs).toHaveLength(2);
    expect(imgs[0]).toHaveAttribute('alt', 'Für Elise – page 1');
    expect(imgs[0]).toHaveAttribute('loading', 'eager');
    expect(imgs[1]).toHaveAttribute('alt', 'Für Elise – page 2');
    expect(imgs[1]).toHaveAttribute('loading', 'lazy');
  });

  it('alt tiếng Việt', () => {
    view(full, 'vi');
    expect(screen.getAllByRole('img')[0]).toHaveAttribute('alt', 'Für Elise – trang 1');
  });

  it('video: iframe nocookie, lazy, không autoplay, có ghi chú bên thứ ba', () => {
    const { container } = view(full);
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('src')).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(frame.getAttribute('src')).not.toMatch(/autoplay/i);
    expect(frame).toHaveAttribute('loading', 'lazy');
    expect(frame).toHaveAttribute('title', 'Für Elise video');
    expect(screen.getByText(/third-party service/)).toBeInTheDocument();
  });

  it('lyrics Markdown render định dạng; HTML thô không thành phần tử', () => {
    const { container } = view({ ...full, lyricsChords: '**Am** la\n\n<script>window.x=1</script><img src=x onerror=alert(1)>' });
    expect(screen.getByText('Am').tagName).toBe('STRONG');
    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img[src="x"]')).toBeNull();
  });

  it('ảnh trong Markdown không được tải (chỉ giữ chữ thay thế)', () => {
    const { container } = view({ ...full, lyricsChords: '![sơ đồ](https://tracker.example/p.gif) và ![](https://t.example/x.gif)' });
    expect(container.querySelector('img[src^="https://tracker"]')).toBeNull();
    expect(container.querySelector('img[src^="https://t.example"]')).toBeNull();
    expect(screen.getByText('sơ đồ')).toBeInTheDocument();
  });

  it('link ngoài trong lyrics mở tab mới với rel an toàn', () => {
    view({ ...full, lyricsChords: '[nguồn](https://example.com)' });
    const a = screen.getByRole('link', { name: 'nguồn' });
    expect(a).toHaveAttribute('target', '_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(a.getAttribute('rel')).toContain('nofollow');
  });

  it('thiếu dữ liệu: không có khối video, lyrics, ảnh, series, liên quan, HOT, độ khó', () => {
    const { container } = view(bare);
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.queryByText('Video')).toBeNull();
    expect(screen.queryByText('Lyrics & Chords')).toBeNull();
    expect(screen.queryByText('Sheet pages')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText('In the same series')).toBeNull();
    expect(screen.queryByText('Related sheets', { selector: 'h2' })).toBeNull();
    expect(screen.queryByText('HOT')).toBeNull();
    expect(screen.queryByText('Difficulty')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('link YouTube không hợp lệ thì không có khối video', () => {
    const { container } = view({ ...full, youtubeUrl: 'https://example.com/video' });
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('lyrics chỉ khoảng trắng thì không có khối', () => {
    view({ ...full, lyricsChords: '   \n ' });
    expect(screen.queryByText('Lyrics & Chords')).toBeNull();
  });

  it('không có nút hay link Download/tải', () => {
    const { container } = view(full);
    // Chỉ có nút của player (Play/Pause/đang tải), không có nút tải.
    expect(screen.queryAllByRole('button').every((b) => /play|pause|loading|chơi|phát|tạm dừng|đang tải/i.test(b.textContent ?? ''))).toBe(true);
    expect(screen.queryByRole('button', { name: /download|tải/i })).toBeNull();
    expect(container.textContent).not.toMatch(/download|tải (xuống|về)/i);
    expect(container.querySelector('a[download]')).toBeNull();
  });

  it('render SheetDetail không gửi request nào (beacon lượt xem nằm ở trang, để preview Draft không đếm)', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    try {
      view(full);
      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('PlayerSlot truyền đúng tên bài và đúng URL note-JSON (không phải URL nào khác) cho player', async () => {
    vi.stubGlobal('AudioContext', class {});
    const fetchMock = vi.fn().mockRejectedValue(new Error('stop'));
    vi.stubGlobal('fetch', fetchMock);
    try {
      view(full);
      expect(screen.getByRole('img', { name: 'Virtual piano keyboard for Für Elise' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Play & Practice this piece' }));
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(fetchMock.mock.calls[0]![0]).toBe(full.midi!.noteJsonUrl);
      expect(String(fetchMock.mock.calls[0]![0])).not.toMatch(/\.mid$/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('PlayerSlot: có MIDI thì hiện khối player (giữa meta và ảnh trang), không MIDI thì không có khối', () => {
    const { container, unmount } = view(full);
    const text = container.textContent ?? '';
    expect(text.indexOf('Listen')).toBeGreaterThan(text.indexOf('Composer'));
    expect(text.indexOf('Listen')).toBeLessThan(text.indexOf('Sheet pages'));
    expect(screen.getByRole('heading', { name: 'Listen' })).toBeInTheDocument();
    unmount();
    view(bare);
    expect(screen.queryByRole('heading', { name: 'Listen' })).toBeNull();
    expect(screen.queryByText(/Simulated playback/)).toBeNull();
  });
});
