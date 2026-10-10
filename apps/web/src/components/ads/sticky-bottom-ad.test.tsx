import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { StickyBottomAd } from './sticky-bottom-ad';

const slots = [{ position: 'STICKY_BOTTOM' as const, htmlCode: '<p>x</p>', image: null, link: null }];

describe('StickyBottomAd', () => {
  it('thanh cố định đáy, z thấp hơn modal (z-50), nút đóng 44px, iframe sandbox', () => {
    const { container } = render(withIntl(<StickyBottomAd slots={slots} />, 'vi'));
    const bar = container.querySelector('.fixed')!;
    expect(bar.className).toContain('bottom-0');
    expect(bar.className).toContain('z-40');
    expect(bar.className).not.toContain('z-50');
    const btn = screen.getByRole('button', { name: 'Đóng quảng cáo' });
    expect(btn.className).toContain('h-11');
    expect(btn.className).toContain('w-11');
    expect(container.querySelector('iframe')!.getAttribute('sandbox')).toBe('allow-scripts allow-popups');
  });

  it('bấm đóng thì ẩn cả thanh lẫn đệm', () => {
    const { container } = render(withIntl(<StickyBottomAd slots={slots} />, 'vi'));
    fireEvent.click(screen.getByRole('button', { name: 'Đóng quảng cáo' }));
    expect(container.innerHTML).toBe('');
  });

  it('không có slot -> không render gì', () => {
    const { container } = render(withIntl(<StickyBottomAd slots={[]} />));
    expect(container.innerHTML).toBe('');
  });
});
