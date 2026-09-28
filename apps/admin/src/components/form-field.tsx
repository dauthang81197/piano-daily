import type { ComponentProps } from 'react';
import { FormError } from '@/components/form-error';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Label gắn với input (`htmlFor`/`id`), lỗi của trường hiện bằng `FormError` và nối qua `aria-describedby`. */
export function FormField({
  id,
  label,
  error,
  ...inputProps
}: { id: string; label: string; error?: string } & Omit<ComponentProps<typeof Input>, 'id'>) {
  const errorId = `${id}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={error ? errorId : undefined} {...inputProps} />
      <FormError id={errorId} size="sm">
        {error}
      </FormError>
    </div>
  );
}
