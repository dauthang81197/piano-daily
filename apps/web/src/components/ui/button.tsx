import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-[color,background-color,transform] active:scale-[0.98] ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ' +
  'disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90',
  secondary: 'border border-primary bg-transparent text-primary hover:bg-surface-container-low',
  ghost: 'bg-transparent text-primary hover:bg-surface-container-low',
};

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-3 py-1.5 text-caption',
  md: 'px-5 py-2.5 text-body-md',
  lg: 'min-h-12 px-7 py-3 text-body-lg',
};

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type ButtonProps = (ButtonAsButton | ButtonAsLink) & { variant?: Variant; size?: Size };

/** Lớp CSS của nút, để gắn lên `Link` (giữ tiền tố locale) khi cần giao diện nút. */
export function buttonClasses({ variant = 'primary', size = 'md', className }: { variant?: Variant; size?: Size; className?: string } = {}): string {
  return cn(base, sizes[size], variants[variant], className);
}

/** `primary` walnut, `secondary` outline, `ghost` nền trong; cỡ `sm`/`md`/`lg`. Có `href` thì render như link. */
export function Button({ variant = 'primary', size = 'md', className, ...props }: ButtonProps) {
  const classes = buttonClasses({ variant, size, className });
  if ('href' in props && props.href !== undefined) {
    return <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />;
  }
  const { type = 'button', ...rest } = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button {...rest} type={type} className={classes} />;
}
