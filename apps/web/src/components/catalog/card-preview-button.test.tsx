import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { previewController } from '@/lib/midi/preview-controller';

const startCardPreview = vi.fn();
vi.mock('@/lib/midi/card-preview', () => ({ startCardPreview: (...a: unknown[]) => startCardPreview(...a) }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { CardPreviewButton } from './card-preview-button';
import { SheetCard } from './sheet-card';

const session = () => ({ stop: vi.fn() });
const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

describe('CardPreviewButton', () => {
  beforeEach(() => {
    vi.stubGlobal('AudioContext', class {});
    startCardPreview.mockReset();
    previewController.stop();
  });
  afterEach(() => {
    previewController.stop();
    vi.unstubAllGlobals();
  });

  const view = (id = 's1', title = 'Für Elise') =>
    render(withIntl(<CardPreviewButton id={id} title={title} noteJsonUrl={`http://cdn/${id}.json`} />));

  it('nhãn nêu tên bài; có vùng bấm 44px và focus ring brass; ẩn mờ chỉ ở thiết bị có hover', () => {
    view();
    const btn = screen.getByRole('button', { name: 'Preview Für Elise' });
    expect(btn.className).toContain('size-11');
    expect(btn.className).toContain('focus-visible:outline-secondary');
    expect(btn.className).toContain('focus-visible:opacity-100');
    // Mặc định luôn hiện (cảm ứng); chỉ khi hover:hover mới mờ và hiện khi hover thẻ.
    expect(btn.className).toContain('[@media(hover:hover)]:opacity-0');
    expect(btn.className).toContain('[@media(hover:hover)]:group-hover:opacity-100');
    expect(btn.className).not.toMatch(/(^|\s)opacity-0/);
    expect(btn).toHaveAttribute('type', 'button');
  });

  it('không tải gì khi chưa bấm', () => {
    view();
    expect(startCardPreview).not.toHaveBeenCalled();
  });

  it('bấm: tải lazy với URL của thẻ; trạng thái loading rồi playing, luôn hiện ở mọi thiết bị', async () => {
    const s = session();
    let resolve!: (v: unknown) => void;
    startCardPreview.mockReturnValue(new Promise((r) => (resolve = r)));
    view();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Für Elise' }));
    const loading = await screen.findByRole('button', { name: 'Loading preview of Für Elise' });
    expect(loading).toHaveAttribute('aria-busy', 'true');
    expect(loading.className).not.toContain('[@media(hover:hover)]:opacity-0');
    resolve(s);
    await flush();
    const playing = screen.getByRole('button', { name: 'Stop preview of Für Elise' });
    expect(playing).toHaveAttribute('data-state', 'playing');
    expect(playing.className).not.toContain('[@media(hover:hover)]:opacity-0');
    expect(startCardPreview).toHaveBeenCalledTimes(1);
    expect(startCardPreview.mock.calls[0]![0]).toBe('http://cdn/s1.json');
  });

  it('truyền AudioContext đã mở khoá (tạo đồng bộ trong cú bấm) cho lõi preview', async () => {
    let created = 0;
    vi.stubGlobal('AudioContext', class { resume = vi.fn(); constructor() { created += 1; } });
    startCardPreview.mockResolvedValue(session());
    view();
    expect(created).toBe(0);
    fireEvent.click(screen.getByRole('button'));
    expect(created).toBe(1); // ngay sau click, trước khi chờ gì
    await flush();
    expect(startCardPreview.mock.calls[0]![1]).toBeDefined();
  });

  it('bấm lần nữa khi đang phát thì dừng; tự kết thúc thì về nút phát', async () => {
    const s = session();
    let onEnd!: () => void;
    startCardPreview.mockImplementation((_u, _c, end) => {
      onEnd = end;
      return Promise.resolve(s);
    });
    view();
    fireEvent.click(screen.getByRole('button'));
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Stop preview of Für Elise' }));
    expect(s.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Preview Für Elise' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button'));
    await flush();
    act(() => onEnd());
    expect(screen.getByRole('button', { name: 'Preview Für Elise' })).toBeInTheDocument();
  });

  it('chỉ một nút phát tại một thời điểm: bấm thẻ khác thì thẻ trước dừng', async () => {
    const a = session();
    const b = session();
    startCardPreview.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
    render(
      withIntl(
        <>
          <CardPreviewButton id="a" title="Bài A" noteJsonUrl="http://cdn/a.json" />
          <CardPreviewButton id="b" title="Bài B" noteJsonUrl="http://cdn/b.json" />
        </>,
      ),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Preview Bài A' }));
    await flush();
    expect(screen.getByRole('button', { name: 'Stop preview of Bài A' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Preview Bài B' }));
    await flush();
    expect(a.stop).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Preview Bài A' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Stop preview of Bài B' })).toBeInTheDocument();
  });

  it('lỗi tải: nhãn lỗi rõ ràng, bấm lại thử lại được', async () => {
    startCardPreview.mockRejectedValueOnce(new Error('net')).mockResolvedValueOnce(session());
    view();
    fireEvent.click(screen.getByRole('button'));
    const err = await screen.findByRole('button', { name: /could not be played/ });
    expect(err.className).toContain('ring-error');
    fireEvent.click(err);
    await flush();
    expect(screen.getByRole('button', { name: 'Stop preview of Für Elise' })).toBeInTheDocument();
  });

  it('gỡ thẻ khi đang phát thì dừng', async () => {
    const s = session();
    startCardPreview.mockResolvedValue(s);
    const { unmount } = view();
    fireEvent.click(screen.getByRole('button'));
    await flush();
    unmount();
    expect(s.stop).toHaveBeenCalledTimes(1);
  });

  it('thiếu Web Audio thì ẩn nút', () => {
    vi.stubGlobal('AudioContext', undefined);
    vi.stubGlobal('webkitAudioContext', undefined);
    view();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('nhãn tiếng Việt', () => {
    render(withIntl(<CardPreviewButton id="v" title="Đêm thu" noteJsonUrl="u" />, 'vi'));
    expect(screen.getByRole('button', { name: 'Nghe thử Đêm thu' })).toBeInTheDocument();
  });
});

describe('SheetCard + nghe thử', () => {
  beforeEach(() => vi.stubGlobal('AudioContext', class {}));
  afterEach(() => vi.unstubAllGlobals());

  const sheet = {
    id: 'i1', publicId: 1, slug: 'fur-elise', title: 'Für Elise', level: 'BEGINNER' as const,
    composer: { id: 'c1', name: 'Beethoven', slug: 'beethoven' }, viewCount: 1, hasSheet: true, hasChords: false,
    hasMidi: true, hasMp3: false, hasVideo: false, pageCount: 1, isHot: false, thumbnailUrl: null,
  };

  it('có noteJsonUrl: nút nằm trên thumbnail, KHÔNG nằm trong link; bấm không kích hoạt điều hướng', async () => {
    startCardPreview.mockResolvedValue(session());
    const { container } = render(withIntl(<SheetCard sheet={{ ...sheet, noteJsonUrl: 'http://cdn/n.json' }} />));
    const btn = screen.getByRole('button', { name: 'Preview Für Elise' });
    expect(btn.closest('a')).toBeNull();
    expect(container.querySelector('a a')).toBeNull();
    expect(btn.className).toContain('z-10');
    const link = screen.getByRole('link', { name: 'Für Elise' });
    const onLinkClick = vi.fn();
    link.addEventListener('click', onLinkClick);
    fireEvent.click(btn);
    await flush();
    expect(onLinkClick).not.toHaveBeenCalled();
    previewController.stop();
  });

  it('không có note-JSON: không có nút nghe thử', () => {
    render(withIntl(<SheetCard sheet={{ ...sheet, hasMidi: false, noteJsonUrl: null }} />));
    expect(screen.queryByRole('button')).toBeNull();
  });
});
