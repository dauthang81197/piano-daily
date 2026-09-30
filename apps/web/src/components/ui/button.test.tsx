import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Button } from './button';
import { Input } from './input';

describe('Button / Input', () => {
  it('render button mặc định type=button, primary walnut', () => {
    render(<Button>Lưu</Button>);
    const button = screen.getByRole('button', { name: 'Lưu' });
    expect(button).toHaveAttribute('type', 'button');
    expect(button.className).toContain('bg-primary');
    expect(button.className).toContain('focus-visible:outline-secondary');
  });
  it('secondary là outline', () => {
    render(<Button variant="secondary">Xem</Button>);
    expect(screen.getByRole('button').className).toContain('border-primary');
  });
  it('có href thì render như link', () => {
    render(<Button href="/vi">Về trang chủ</Button>);
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/vi');
  });
  it('Input có focus ring brass', () => {
    render(<Input aria-label="q" />);
    expect(screen.getByLabelText('q').className).toContain('focus-visible:outline-secondary');
  });
});
