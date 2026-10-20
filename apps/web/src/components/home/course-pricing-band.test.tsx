import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { CoursePricingBand } from './course-pricing-band';

describe('CoursePricingBand', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('thanh toán ẩn: chỉ khối khoá học, không link bảng giá', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '');
    render(withIntl(<CoursePricingBand locale="vi" showCourses />, 'vi'));
    expect(screen.getByRole('link', { name: /khoá/i })).toHaveAttribute('href', '/vi/courses');
    expect(document.querySelector('a[href$="/pricing"]')).toBeNull();
  });

  it('thanh toán ẩn và chưa có khoá: không render gì', () => {
    vi.stubEnv('NEXT_PUBLIC_PAYMENTS_ENABLED', '');
    const { container } = render(withIntl(<CoursePricingBand locale="vi" showCourses={false} />, 'vi'));
    expect(container.querySelector('section')).toBeNull();
  });

  it('thanh toán bật: có cả khối bảng giá', () => {
    render(withIntl(<CoursePricingBand locale="vi" showCourses />, 'vi'));
    expect(document.querySelector('a[href="/vi/pricing"]')).not.toBeNull();
  });
});
