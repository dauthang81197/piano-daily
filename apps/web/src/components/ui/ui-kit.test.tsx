import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Badge } from './badge';
import { Button } from './button';
import { Card } from './card';
import { PageHeader } from './page-header';
import { Skeleton } from './skeleton';

describe('ui kit dùng chung', () => {
  it('Button giữ nguyên lớp mặc định cũ và thêm cỡ/ghost', () => {
    const { rerender } = render(<Button>Lưu</Button>);
    const md = screen.getByRole('button').className;
    expect(md).toContain('px-5');
    expect(md).toContain('py-2.5');
    expect(md).toContain('text-body-md');
    rerender(<Button size="lg">Lưu</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-12');
    rerender(<Button size="sm">Lưu</Button>);
    expect(screen.getByRole('button').className).toContain('min-h-9');
    rerender(<Button variant="ghost">Lưu</Button>);
    expect(screen.getByRole('button').className).toContain('hover:bg-surface-container-low');
  });
  it('Button dạng link nhận cỡ', () => {
    render(
      <Button href="/vi" size="lg" variant="secondary">
        Về trang chủ
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Về trang chủ' });
    expect(link.className).toContain('min-h-12');
    expect(link.className).toContain('border-primary');
  });
  it('Card chỉ nâng bóng khi interactive', () => {
    const { rerender } = render(<Card data-testid="c">x</Card>);
    expect(screen.getByTestId('c').className).not.toContain('hover:shadow-card-hover');
    rerender(
      <Card data-testid="c" interactive className="p-4">
        x
      </Card>,
    );
    expect(screen.getByTestId('c').className).toContain('hover:shadow-card-hover');
    expect(screen.getByTestId('c').className).toContain('p-4');
  });
  it('Badge theo tông cấp độ', () => {
    render(<Badge tone="hot">Hot</Badge>);
    expect(screen.getByText('Hot').className).toContain('bg-hot-accent');
    render(<Badge>Mặc định</Badge>);
    expect(screen.getByText('Mặc định').className).toContain('bg-surface-container');
  });
  it('Skeleton ẩn khỏi trình đọc màn hình và tắt nhấp nháy khi giảm chuyển động', () => {
    const { container } = render(<Skeleton className="h-4" />);
    const el = container.firstElementChild as HTMLElement;
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el.className).toContain('motion-reduce:animate-none');
  });
  it('PageHeader hiện eyebrow, h1, mô tả và vùng hành động', () => {
    render(
      <PageHeader eyebrow="Khoá học" title="Piano nhập môn" description="Mô tả">
        <button type="button">Học</button>
      </PageHeader>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Piano nhập môn' })).toBeInTheDocument();
    expect(screen.getByText('Khoá học')).toBeInTheDocument();
    expect(screen.getByText('Mô tả')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Học' })).toBeInTheDocument();
  });
  it('PageHeader bỏ qua eyebrow/mô tả khi không có', () => {
    render(<PageHeader title="Chỉ tiêu đề" />);
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(document.querySelector('p')).toBeNull();
  });
});
