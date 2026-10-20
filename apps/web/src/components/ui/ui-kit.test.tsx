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

describe('tương phản (AA ≥ 4.5:1 cho chữ nhỏ)', () => {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const luminance = (h: string) => {
    const n = parseInt(h.slice(1), 16);
    return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  };
  const ratio = (a: string, b: string) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const tokens = async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    // vitest chạy với cwd = apps/web.
    const css = readFileSync(join(process.cwd(), '..', '..', 'packages', 'tokens', 'theme.css'), 'utf8');
    return (name: string) => {
      const hex = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1];
      expect(hex, `token ${name}`).toBeDefined();
      return hex!;
    };
  };

  it('chữ trắng trên level-advanced-strong và secondary-strong (nhãn, nút Tải, tag Genre đang chọn)', async () => {
    const get = await tokens();
    expect(ratio(get('on-secondary'), get('level-advanced-strong'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(get('on-secondary'), get('secondary-strong'))).toBeGreaterThanOrEqual(4.5);
  });

  it('chữ secondary-strong đạt AA trên mọi nền bề mặt đang dùng (menu đang chọn, eyebrow, link)', async () => {
    const get = await tokens();
    for (const bg of ['surface', 'surface-bright', 'surface-container-low', 'surface-container']) {
      expect(ratio(get('secondary-strong'), get(bg)), `secondary-strong trên ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('chữ phụ (on-surface-variant) và lỗi đạt AA trên bề mặt; brass gốc KHÔNG đủ cho chữ nhỏ', async () => {
    const get = await tokens();
    for (const bg of ['surface', 'surface-bright', 'surface-container-low', 'surface-container', 'surface-container-high']) {
      expect(ratio(get('on-surface-variant'), get(bg)), `on-surface-variant trên ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(get('error'), get('surface'))).toBeGreaterThanOrEqual(4.5);
    // Lý do tồn tại của biến thể "strong": secondary gốc thấp hơn AA cho chữ nhỏ.
    expect(ratio(get('secondary'), get('surface'))).toBeLessThan(4.5);
  });

  it('palette tối cục bộ của player (`.player-dark` trong globals.css) đạt AA cho chữ và nút', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const css = readFileSync(join(process.cwd(), 'src', 'app', 'globals.css'), 'utf8');
    const block = /\.player-dark\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(block, '.player-dark').toBeDefined();
    const theme = readFileSync(join(process.cwd(), '..', '..', 'packages', 'tokens', 'theme.css'), 'utf8');
    const color = (name: string) => {
      const hex = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(block!)?.[1] ?? new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(theme)?.[1];
      expect(hex, `token ${name}`).toBeDefined();
      return hex!;
    };
    for (const bg of ['surface', 'surface-bright', 'surface-container-lowest', 'surface-container-low', 'surface-container', 'surface-container-high']) {
      expect(ratio(color('on-surface'), color(bg)), `on-surface trên ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color('on-surface-variant'), color(bg)), `on-surface-variant trên ${bg}`).toBeGreaterThanOrEqual(4.5);
      expect(ratio(color('secondary-strong'), color(bg)), `secondary-strong trên ${bg}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(ratio(color('on-primary'), color('primary'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(color('on-secondary'), color('secondary-strong'))).toBeGreaterThanOrEqual(4.5);
    expect(ratio(color('error'), color('surface'))).toBeGreaterThanOrEqual(4.5);
  });
});
