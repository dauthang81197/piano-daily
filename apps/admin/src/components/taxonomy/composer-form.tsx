'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { type Composer, createComposerSchema } from '@piano-daily/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Textarea } from '@/components/ui/textarea';
import { composersApi } from '@/lib/api/catalog';
import { Field, fieldAria } from './field';
import { FormActions } from './form-actions';
import { applyServerError } from './server-error';
import type { FormProps } from './taxonomy-table';

const FIELDS = ['name', 'bio'] as const;

export function ComposerForm({ item, onDone, onCancel }: FormProps<Composer>) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createComposerSchema),
    defaultValues: { name: item?.name ?? '', bio: item?.bio ?? '' },
  });

  const fail = (err: unknown) =>
    setFormError(applyServerError(err, FIELDS, (field, message) => setError(field, { message })));

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (item) await composersApi.update(item.id, values);
      else await composersApi.create(values);
      onDone();
    } catch (err) {
      fail(err);
    }
  });

  const onDelete = async () => {
    if (!item) return;
    setFormError(null);
    try {
      await composersApi.remove(item.id);
      onDone();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError>{formError}</FormError>
      <FormField id="composer-name" label="Tên" error={errors.name?.message} {...register('name')} />
      <Field id="composer-bio" label="Tiểu sử (không bắt buộc)" error={errors.bio?.message}>
        <Textarea rows={5} {...fieldAria('composer-bio', errors.bio?.message)} {...register('bio')} />
      </Field>
      <FormActions editingName={item?.name ?? null} submitting={isSubmitting} onCancel={onCancel} onDelete={onDelete} />
    </form>
  );
}
