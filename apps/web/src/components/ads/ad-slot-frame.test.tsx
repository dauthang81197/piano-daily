import { render, screen } from '@testing-library/react';
import type { PublicAdSlot } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { AdSlotFrame } from './ad-slot-frame';

const html = (position: PublicAdSlot['position'], htmlCode: string): PublicAdSlot => ({ position, htmlCode, image: null, link: null });
const img: PublicAdSlot = { position: 'IN_LIST', htmlCode: null, image: 'https://cdn.test/a.png', link: 'https://shop.test/x' };

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
    ['slot rỗng', [{ position: 'HEADER', htmlCode: '  ', image: null, link: null } as PublicAdSlot]],
    ['ảnh thiếu link', [{ position: 'HEADER', htmlCode: null, image: 'https://a.test/i.png', link: null } as PublicAdSlot]],
  ])('%s -> không render gì', (_name, slots) => {
    const { container } = render(withIntl(<AdSlotFrame slots={slots} position="HEADER" />));
    expect(container.innerHTML).toBe('');
  });

  it('slots undefined -> không render gì', () => {
    const { container } = render(withIntl(<AdSlotFrame slots={undefined} position="HEADER" />));
    expect(container.innerHTML).toBe('');
  });
});
