import { fireEvent, render, screen } from '@testing-library/react';
import type { PublicAdSlot } from '@piano-daily/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { AdSlotFrame } from './ad-slot-frame';

const html = (position: PublicAdSlot['position'], htmlCode: string): PublicAdSlot => ({ position, htmlCode, items: [] });
const product = (over: Partial<PublicAdSlot['items'][number]> = {}): PublicAdSlot['items'][number] => ({
  id: 'item-1',
  platform: 'SHOPEE',
  image: 'https://cdn.test/a.png',
  link: 'https://shop.test/x',
  label: null,
  ...over,
});
const img: PublicAdSlot = { position: 'IN_LIST', htmlCode: null, items: [product()] };

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_API_URL', 'https://api.test');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('AdSlotFrame', () => {
  it('html: iframe sandbox đúng chuỗi, srcdoc = htmlCode, HTML không lọt ra DOM', () => {
    const code = '<script>window.top.document.title="x"</script><b id="leak">hi</b>';
    const { container } = render(withIntl(<AdSlotFrame slots={[html('HEADER', code)]} position="HEADER" />));
    const frame = container.querySelector('iframe')!;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
    expect(frame.getAttribute('srcdoc')).toBe(code);
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.getAttribute('title')).toBeTruthy();
    expect(container.querySelector('#leak')).toBeNull();
    expect(container.querySelector('script')).toBeNull();
  });

  it('khung trung tính: aside có aria-label, nhãn, viền dashed, không màu thương hiệu', () => {
    const { container } = render(withIntl(<AdSlotFrame slots={[html('HEADER', '<p>x</p>')]} position="HEADER" />, 'vi'));
    const aside = screen.getByRole('complementary', { name: 'Quảng cáo' });
    expect(aside.className).toContain('border-dashed');
    expect(aside.className).toContain('rounded-sm');
    expect(container.innerHTML).not.toMatch(/primary|secondary|hot-accent/);
    expect(screen.getAllByText('Quảng cáo').length).toBeGreaterThan(0);
  });

  it('ảnh: link rel noopener noreferrer sponsored, target _blank, img lazy alt rỗng', () => {
    const { container } = render(withIntl(<AdSlotFrame slots={[img]} position="IN_LIST" />));
    const a = container.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://shop.test/x');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer sponsored');
    expect(a.getAttribute('target')).toBe('_blank');
    const i = a.querySelector('img')!;
    expect(i.getAttribute('loading')).toBe('lazy');
    expect(i.getAttribute('alt')).toBe('');
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('chiều cao iframe: HEADER thấp hơn IN_LIST', () => {
    const { container } = render(
      withIntl(
        <>
          <AdSlotFrame slots={[html('HEADER', 'a')]} position="HEADER" />
          <AdSlotFrame slots={[html('IN_LIST', 'b')]} position="IN_LIST" />
        </>,
      ),
    );
    const [h, l] = Array.from(container.querySelectorAll('iframe'));
    expect(h!.className).toContain('h-24');
    expect(l!.className).toContain('h-64');
  });

  it.each([
    ['không có slot', []],
    ['thiếu vị trí', [html('IN_LIST', 'x')]],
    ['slot rỗng', [{ position: 'HEADER', htmlCode: '  ', items: [] } as PublicAdSlot]],
    ['không html, không sản phẩm', [{ position: 'HEADER', htmlCode: null, items: [] } as PublicAdSlot]],
  ])('%s -> không render gì', (_name, slots) => {
    const { container } = render(withIntl(<AdSlotFrame slots={slots} position="HEADER" />));
    expect(container.innerHTML).toBe('');
  });

  it('slots undefined -> không render gì', () => {
    const { container } = render(withIntl(<AdSlotFrame slots={undefined} position="HEADER" />));
    expect(container.innerHTML).toBe('');
  });
});

describe('AdSlotFrame: nhiều sản phẩm, huy hiệu nền tảng, đếm lượt bấm', () => {
  const three: PublicAdSlot = {
    position: 'IN_LIST',
    htmlCode: null,
    items: [
      product({ id: 'a', platform: 'SHOPEE', label: 'Đàn điện' }),
      product({ id: 'b', platform: 'TIKTOK', link: 'https://vt.tiktok.com/b' }),
      product({ id: 'c', platform: 'OTHER', label: null, link: 'https://other.test/c' }),
    ],
  };

  it('mỗi sản phẩm một link rel sponsored; huy hiệu theo nền tảng, nền tảng Khác không có huy hiệu', () => {
    const { container } = render(withIntl(<AdSlotFrame slots={[three]} position="IN_LIST" />, 'vi'));
    const links = Array.from(container.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://shop.test/x', 'https://vt.tiktok.com/b', 'https://other.test/c']);
    for (const a of links) expect(a.getAttribute('rel')).toBe('noopener noreferrer sponsored');
    expect(screen.getByText('Shopee')).toBeInTheDocument();
    expect(screen.getByText('TikTok')).toBeInTheDocument();
    expect(screen.queryByText('Khác')).not.toBeInTheDocument();
    expect(screen.getByText('Đàn điện')).toBeInTheDocument();
  });

  it('huy hiệu theo ngôn ngữ (en)', () => {
    render(withIntl(<AdSlotFrame slots={[{ ...three, items: [product({ platform: 'LAZADA' })] }]} position="IN_LIST" />, 'en'));
    expect(screen.getByText('Lazada')).toBeInTheDocument();
  });

  it('vị trí ngang cuộn ngang, cột bên xếp dọc', () => {
    const horizontal = render(withIntl(<AdSlotFrame slots={[three]} position="IN_LIST" />));
    expect(horizontal.container.querySelector('a')!.parentElement!.className).toContain('overflow-x-auto');
    horizontal.unmount();
    const vertical = render(withIntl(<AdSlotFrame slots={[{ ...three, position: 'SIDEBAR_RIGHT' }]} position="SIDEBAR_RIGHT" />));
    const row = vertical.container.querySelector('a')!.parentElement!;
    expect(row.className).toContain('flex-col');
    expect(row.className).not.toContain('overflow-x-auto');
  });

  it('slot có cả sản phẩm và HTML: hiện cả hai, HTML vẫn chỉ trong iframe sandbox', () => {
    const { container } = render(withIntl(<AdSlotFrame slots={[{ ...three, htmlCode: '<b id="leak">x</b>' }]} position="IN_LIST" />));
    expect(container.querySelectorAll('a')).toHaveLength(3);
    expect(container.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
    expect(container.querySelector('#leak')).toBeNull();
  });

  it('bấm sản phẩm gửi beacon tới API với id sản phẩm', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    const { container } = render(withIntl(<AdSlotFrame slots={[three]} position="IN_LIST" />));
    fireEvent.click(container.querySelectorAll('a')[1]!);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    expect(sendBeacon).toHaveBeenCalledWith('https://api.test/ads/items/b/click');
  });

  it('bấm giữa chuột (auxclick) cũng gửi beacon; chuột phải thì không', () => {
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    const { container } = render(withIntl(<AdSlotFrame slots={[three]} position="IN_LIST" />));
    const link = container.querySelectorAll('a')[0]!;
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 2 }));
    expect(sendBeacon).not.toHaveBeenCalled();
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, button: 1 }));
    expect(sendBeacon).toHaveBeenCalledWith('https://api.test/ads/items/a/click');
  });

  it('tên truy cập khác nhau cho từng sản phẩm (nhãn hoặc nền tảng)', () => {
    render(withIntl(<AdSlotFrame slots={[three]} position="IN_LIST" />, 'vi'));
    expect(screen.getByRole('link', { name: 'Quảng cáo: Đàn điện' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quảng cáo: TikTok' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Quảng cáo' })).toBeInTheDocument();
  });

  it('thiếu NEXT_PUBLIC_API_URL: bấm vẫn không lỗi và không gửi gì', () => {
    vi.stubEnv('NEXT_PUBLIC_API_URL', '');
    const sendBeacon = vi.fn(() => true);
    vi.stubGlobal('navigator', { sendBeacon });
    const { container } = render(withIntl(<AdSlotFrame slots={[img]} position="IN_LIST" />));
    expect(() => fireEvent.click(container.querySelector('a')!)).not.toThrow();
    expect(sendBeacon).not.toHaveBeenCalled();
  });

  it('trình duyệt không có sendBeacon: dùng fetch keepalive', () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('fetch', fetchMock);
    const { container } = render(withIntl(<AdSlotFrame slots={[img]} position="IN_LIST" />));
    fireEvent.click(container.querySelector('a')!);
    expect(fetchMock).toHaveBeenCalledWith('https://api.test/ads/items/item-1/click', expect.objectContaining({ method: 'POST', keepalive: true }));
  });
});
