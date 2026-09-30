import type { AnchorHTMLAttributes, ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

type Variant = 'primary' | 'secondary';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md px-5 py-2.5 text-body-md font-semibold transition-colors ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary ' +
  'disabled:pointer-events-none disabled:opacity-50';

const variants: Record<Variant, string> = {
  primary: 'bg-primary text-on-primary hover:bg-primary/90',
  secondary: 'border border-primary bg-transparent text-primary hover:bg-surface-container-low',
};

type ButtonAsButton = ButtonHTMLAttributes<HTMLButtonElement> & { href?: undefined };
type ButtonAsLink = AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
export type ButtonProps = (ButtonAsButton | ButtonAsLink) & { variant?: Variant };

/** `primary` walnut, `secondary` outline. Có `href` thì render như link. */
export function Button({ variant = 'primary', className, ...props }: ButtonProps) {
  const classes = cn(base, variants[variant], className);
  if ('href' in props && props.href !== undefined) {
    return <a {...(props as AnchorHTMLAttributes<HTMLAnchorElement>)} className={classes} />;
  }
  const { type = 'button', ...rest } = props as ButtonHTMLAttributes<HTMLButtonElement>;
  return <button {...rest} type={type} className={classes} />;
}
