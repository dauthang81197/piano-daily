'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createSeriesSchema, type Series } from '@piano-daily/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { seriesApi } from '@/lib/api/catalog';
import { Field, fieldAria } from './field';
import { FormActions } from './form-actions';
import { applyServerError } from './server-error';
import type { FormProps } from './taxonomy-table';
import { useComposerOptions } from './use-composer-options';

const FIELDS = ['name', 'composerId'] as const;

export function SeriesForm({ item, onDone, onCancel }: FormProps<Series>) {
  const [formError, setFormError] = useState<string | null>(null);
  const composers = useComposerOptions(item?.composer);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createSeriesSchema),
    defaultValues: { name: item?.name ?? '', composerId: item?.composer.id ?? '' },
  });

  const fail = (err: unknown) =>
    setFormError(applyServerError(err, FIELDS, (field, message) => setError(field, { message })));

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (item) await seriesApi.update(item.id, values);
      else await seriesApi.create(values);
      onDone();
    } catch (err) {
      fail(err);
    }
  });

  const onDelete = async () => {
    if (!item) return;
    setFormError(null);
    try {
      await seriesApi.remove(item.id);
      onDone();
    } catch (err) {
      fail(err);
    }
  };

  const composerError =
    errors.composerId?.message ?? (composers.error ? 'Không tải được danh sách Composer. Vui lòng thử lại.' : undefined);

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError>{formError}</FormError>
      <FormField id="series-name" label="Tên" error={errors.name?.message} {...register('name')} />
      <Field id="series-composer" label="Composer" error={composerError}>
        <Controller
          control={control}
          name="composerId"
          render={({ field }) => (
            <Select
              items={composers.options}
              value={field.value || null}
              onValueChange={(value) => field.onChange(value ?? '')}
            >
              <SelectTrigger className="w-full" onBlur={field.onBlur} {...fieldAria('series-composer', composerError)}>
                <SelectValue placeholder={composers.loading ? 'Đang tải Composer…' : 'Chọn Composer'} />
              </SelectTrigger>
              <SelectContent>
                {composers.options.map(({ value, label }) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <FormActions editingName={item?.name ?? null} submitting={isSubmitting} onCancel={onCancel} onDelete={onDelete} />
    </form>
  );
}
