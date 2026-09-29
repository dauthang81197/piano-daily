import type { ReactNode } from 'react';
import { FormError } from '@/components/form-error';
import { Label } from '@/components/ui/label';

/** Nhãn + control + lỗi của trường (`FormError` ngay dưới trường). Control tự gắn `id`/`aria-describedby`. */
export function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      <FormError id={`${id}-error`} size="sm">
        {error}
      </FormError>
    </div>
  );
}

/** Thuộc tính a11y cho control của `Field`. */
export function fieldAria(id: string, error?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  } as const;
}
