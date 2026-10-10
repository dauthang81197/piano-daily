'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AD_HTML_MAX,
  type AdPosition,
  type AdSlot,
  createAdSlotBodySchema,
  updateAdSlotBodySchema,
} from '@piano-daily/shared';
import { useState } from 'react';
import { type Resolver, useForm } from 'react-hook-form';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Field, fieldAria } from '@/components/taxonomy/field';
import { applyServerError } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { adsApi } from '@/lib/api/ads';
import { useAuth } from '@/lib/auth/auth-provider';
import { POSITION_LABELS, POSITION_ORDER, READ_ONLY_REASON } from './ad-labels';
import { AdPreview } from './ad-preview';

type Values = { position: AdPosition; htmlCode: string; image: string; link: string };
const FIELDS = ['position', 'htmlCode', 'image', 'link'] as const;

/** Form tạo/sửa slot (trong dialog). EDITOR chỉ xem: mọi trường bị vô hiệu và không có nút lưu. */
export function AdForm({
  item,
  takenPositions,
  onDone,
  onCancel,
}: {
  item: AdSlot | null;
  takenPositions: readonly AdPosition[];
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [formError, setFormError] = useState<string | null>(null);
  const freePositions = POSITION_ORDER.filter((p) => !takenPositions.includes(p));
  const {
    register,
    handleSubmit,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(item ? updateAdSlotBodySchema : createAdSlotBodySchema) as unknown as Resolver<Values>,
    defaultValues: {
      position: item?.position ?? freePositions[0] ?? 'HEADER',
      htmlCode: item?.htmlCode ?? '',
      image: item?.image ?? '',
      link: item?.link ?? '',
    },
  });
  // Preview chỉ cập nhật khi bấm nút, để script không chạy lại sau mỗi phím gõ.
  const [previewHtml, setPreviewHtml] = useState(item?.htmlCode ?? '');

  const onSubmit = handleSubmit(async (values) => {
    if (!canWrite) return;
    setFormError(null);
    try {
      if (item) await adsApi.update(item.id, { htmlCode: values.htmlCode, image: values.image, link: values.link });
      else await adsApi.create(values);
      onDone();
    } catch (err) {
      setFormError(applyServerError(err, FIELDS, (field, message) => setError(field, { message })));
    }
  });

  return (
    <form noValidate onSubmit={onSubmit} className="flex flex-col gap-4">
      {!canWrite && <p className="text-sm text-muted-foreground">{READ_ONLY_REASON}</p>}
      <FormError>{formError}</FormError>
      <fieldset disabled={!canWrite || isSubmitting} className="flex flex-col gap-4">
        <Field id="ad-position" label="Vị trí" error={errors.position?.message}>
          {item ? (
            <p id="ad-position" className="text-sm">
              {POSITION_LABELS[item.position]}
            </p>
          ) : (
            <select
              {...fieldAria('ad-position', errors.position?.message)}
              {...register('position')}
              className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
            >
              {freePositions.map((p) => (
                <option key={p} value={p}>
                  {POSITION_LABELS[p]}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field id="ad-html" label="Mã HTML (chỉ SUPER_ADMIN)" error={errors.htmlCode?.message}>
          <Textarea
            rows={6}
            maxLength={AD_HTML_MAX}
            className="font-mono"
            disabled={!canWrite}
            {...fieldAria('ad-html', errors.htmlCode?.message)}
            {...register('htmlCode')}
          />
        </Field>
        <FormField id="ad-image" label="Ảnh (URL https)" error={errors.image?.message} {...register('image')} />
        <FormField id="ad-link" label="Link đích (URL https)" error={errors.link?.message} {...register('link')} />
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-medium">Xem trước mã HTML</span>
          <Button type="button" variant="outline" size="sm" onClick={() => setPreviewHtml(getValues('htmlCode'))}>
            Cập nhật xem trước
          </Button>
        </div>
        <AdPreview html={previewHtml} />
        <p className="text-caption text-muted-foreground">
          Chạy trong khung cách ly (sandbox), không truy cập được trang admin.
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {canWrite ? 'Huỷ' : 'Đóng'}
        </Button>
        {canWrite && (
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Đang lưu…' : item ? 'Lưu' : 'Tạo'}
          </Button>
        )}
      </div>
    </form>
  );
}
