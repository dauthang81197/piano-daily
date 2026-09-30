import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export function Input({ className, type = 'text', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      {...props}
      className={cn(
        'w-full rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-body-md text-on-surface ' +
          'placeholder:text-on-surface-variant/70 focus-visible:outline-2 focus-visible:outline-offset-2 ' +
          'focus-visible:outline-secondary disabled:opacity-50',
        className,
      )}
    />
  );
}
