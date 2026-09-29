'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { createGenreSchema, type Genre, GENRE_ICONS, type GenreIcon } from '@piano-daily/shared';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { genresApi } from '@/lib/api/catalog';
import { Field, fieldAria } from './field';
import { FormActions } from './form-actions';
import { GENRE_ICON_COMPONENTS } from './genre-icons';
import { applyServerError } from './server-error';
import type { FormProps } from './taxonomy-table';

const FIELDS = ['name', 'icon'] as const;
/** Giá trị của lựa chọn "Không có icon" trong dropdown (form lưu `null`). */
const NO_ICON = 'none';

const ICON_ITEMS = [
  { value: NO_ICON, label: 'Không có icon' },
  ...GENRE_ICONS.map((icon) => ({ value: icon, label: icon })),
];

export function GenreForm({ item, onDone, onCancel }: FormProps<Genre>) {
  const [formError, setFormError] = useState<string | null>(null);
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm({
    resolver: zodResolver(createGenreSchema),
    defaultValues: { name: item?.name ?? '', icon: item?.icon ?? null },
  });

  const fail = (err: unknown) =>
    setFormError(applyServerError(err, FIELDS, (field, message) => setError(field, { message })));

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const body = { name: values.name, icon: values.icon ?? null };
    try {
      if (item) await genresApi.update(item.id, body);
      else await genresApi.create(body);
      onDone();
    } catch (err) {
      fail(err);
    }
  });

  const onDelete = async () => {
    if (!item) return;
    setFormError(null);
    try {
      await genresApi.remove(item.id);
      onDone();
    } catch (err) {
      fail(err);
    }
  };

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      <FormError>{formError}</FormError>
      <FormField id="genre-name" label="Tên" error={errors.name?.message} {...register('name')} />
      <Field id="genre-icon" label="Icon (không bắt buộc)" error={errors.icon?.message}>
        <Controller
          control={control}
          name="icon"
          render={({ field }) => (
            <Select
              items={ICON_ITEMS}
              value={field.value ?? NO_ICON}
              onValueChange={(value) => field.onChange(value === NO_ICON ? null : (value as GenreIcon))}
            >
              <SelectTrigger className="w-full" onBlur={field.onBlur} {...fieldAria('genre-icon', errors.icon?.message)}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ICON_ITEMS.map(({ value, label }) => {
                  const Icon = value === NO_ICON ? null : GENRE_ICON_COMPONENTS[value as GenreIcon];
                  return (
                    <SelectItem key={value} value={value}>
                      {Icon && <Icon aria-hidden="true" />}
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          )}
        />
      </Field>
      <FormActions editingName={item?.name ?? null} submitting={isSubmitting} onCancel={onCancel} onDelete={onDelete} />
    </form>
  );
}
