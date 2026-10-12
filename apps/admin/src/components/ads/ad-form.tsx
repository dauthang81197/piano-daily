'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import {
  AD_HTML_MAX,
  AD_ITEMS_MAX,
  AD_LABEL_MAX,
  AD_PLATFORM_LABELS,
  type AdPlatform,
  type AdPosition,
  type AdSlot,
  createAdSlotBodySchema,
  isAdUrl,
  updateAdSlotBodySchema,
} from '@piano-daily/shared';
import { useState } from 'react';
import { type Resolver, useFieldArray, useForm } from 'react-hook-form';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Field, fieldAria } from '@/components/taxonomy/field';
import { applyServerError } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { adsApi } from '@/lib/api/ads';
import { isApiError } from '@/lib/api/client';
import { useAuth } from '@/lib/auth/auth-provider';
import { PLATFORM_ORDER, POSITION_LABELS, POSITION_ORDER, READ_ONLY_REASON } from './ad-labels';
import { AdPreview } from './ad-preview';

type ItemValues = { id?: string; platform: AdPlatform; image: string; link: string; label: string };
type Values = { position: AdPosition; htmlCode: string; items: ItemValues[] };
const FIELDS = ['position', 'htmlCode', 'items'] as const;
const NEW_ITEM: ItemValues = { platform: 'SHOPEE', image: '', link: '', label: '' };
const UPLOAD_ERROR = 'Không tải được ảnh. Vui lòng thử lại.';

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
  const [uploading, setUploading] = useState<number | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<number, string>>({});
  const freePositions = POSITION_ORDER.filter((p) => !takenPositions.includes(p));
  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(item ? updateAdSlotBodySchema : createAdSlotBodySchema) as unknown as Resolver<Values>,
    defaultValues: {
      position: item?.position ?? freePositions[0] ?? 'HEADER',
      htmlCode: item?.htmlCode ?? '',
      items: (item?.items ?? []).map((i) => ({ id: i.id, platform: i.platform, image: i.image, link: i.link, label: i.label ?? '' })),
    },
  });
  const { fields, append, remove, move } = useFieldArray({ control, name: 'items', keyName: 'key' });
  // `keyName: 'key'`: mặc định react-hook-form ghi đè thuộc tính `id` của phần tử, mà `id` sản phẩm phải được giữ để API giữ số lượt bấm.
  // Đang tải ảnh thì khoá thêm/xoá/đổi thứ tự và nút lưu: trạng thái tải được gắn theo chỉ số dòng.
  // Preview chỉ cập nhật khi bấm nút, để script không chạy lại sau mỗi phím gõ.
  const [previewHtml, setPreviewHtml] = useState(item?.htmlCode ?? '');

  const onSubmit = handleSubmit(async (values) => {
    if (!canWrite) return;
    setFormError(null);
    const body = { htmlCode: values.htmlCode, items: values.items } as never;
    try {
      if (item) await adsApi.update(item.id, body);
      else await adsApi.create({ position: values.position, ...(body as object) } as never);
      onDone();
    } catch (err) {
      setFormError(applyServerError(err, FIELDS, (field, message) => setError(field, { message })));
    }
  });

  const upload = async (index: number, file: File | undefined) => {
    if (!file || !canWrite) return;
    setUploading(index);
    setUploadErrors((e) => ({ ...e, [index]: '' }));
    try {
      const { url } = await adsApi.uploadImage(file);
      setValue(`items.${index}.image`, url, { shouldValidate: true, shouldDirty: true });
    } catch (err) {
      setUploadErrors((e) => ({ ...e, [index]: isApiError(err) ? err.message : UPLOAD_ERROR }));
    } finally {
      setUploading(null);
    }
  };

  const contentError = errors.htmlCode?.message ?? errors.items?.message ?? errors.items?.root?.message;

  return (
    <form noValidate onSubmit={onSubmit} className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto">
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

        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">
              Sản phẩm ({fields.length}/{AD_ITEMS_MAX})
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!canWrite || uploading !== null || fields.length >= AD_ITEMS_MAX}
              onClick={() => append({ ...NEW_ITEM })}
            >
              Thêm sản phẩm
            </Button>
          </div>
          {fields.length === 0 && (
            <p className="text-sm text-muted-foreground">Chưa có sản phẩm. Thêm sản phẩm (ảnh + link) hoặc nhập mã HTML bên dưới.</p>
          )}
          {fields.map((field, index) => {
            const n = index + 1;
            const itemErrors = errors.items?.[index];
            const image = watch(`items.${index}.image`);
            const stats = item?.items.find((i) => i.id === field.id);
            return (
              <div key={field.key} className="flex flex-col gap-3 rounded-lg border p-3" role="group" aria-label={`Sản phẩm ${n}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium">Sản phẩm {n}</span>
                  <div className="flex gap-1">
                    <Button type="button" variant="ghost" size="sm" disabled={!canWrite || uploading !== null || index === 0} aria-label={`Đưa sản phẩm ${n} lên`} onClick={() => move(index, index - 1)}>
                      ↑
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={!canWrite || uploading !== null || index === fields.length - 1} aria-label={`Đưa sản phẩm ${n} xuống`} onClick={() => move(index, index + 1)}>
                      ↓
                    </Button>
                    <Button type="button" variant="ghost" size="sm" disabled={!canWrite || uploading !== null} aria-label={`Xoá sản phẩm ${n}`} onClick={() => remove(index)}>
                      Xoá
                    </Button>
                  </div>
                </div>
                <Field id={`ad-item-${index}-platform`} label={`Nền tảng (sản phẩm ${n})`} error={itemErrors?.platform?.message}>
                  <select
                    {...fieldAria(`ad-item-${index}-platform`, itemErrors?.platform?.message)}
                    {...register(`items.${index}.platform`)}
                    className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    {PLATFORM_ORDER.map((p) => (
                      <option key={p} value={p}>
                        {AD_PLATFORM_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </Field>
                <FormField id={`ad-item-${index}-image`} label={`Ảnh (URL https, sản phẩm ${n})`} error={itemErrors?.image?.message} {...register(`items.${index}.image`)} />
                <div className="flex flex-col gap-1">
                  <label htmlFor={`ad-item-${index}-file`} className="text-caption text-muted-foreground">
                    Hoặc tải ảnh lên (PNG, JPEG, WebP, tối đa 2 MB)
                  </label>
                  <input
                    id={`ad-item-${index}-file`}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    aria-label={`Tải ảnh lên cho sản phẩm ${n}`}
                    disabled={!canWrite || uploading !== null}
                    onChange={(e) => {
                      void upload(index, e.target.files?.[0]);
                      e.target.value = '';
                    }}
                    className="text-sm"
                  />
                  {uploading === index && <span className="text-caption text-muted-foreground">Đang tải ảnh…</span>}
                  <FormError size="sm">{uploadErrors[index]}</FormError>
                </div>
                {image && isAdUrl(image) && (
                  <img src={image} alt="" className="max-h-24 w-auto max-w-full self-start rounded-sm border" />
                )}
                <FormField id={`ad-item-${index}-link`} label={`Link đích (URL https, sản phẩm ${n})`} error={itemErrors?.link?.message} {...register(`items.${index}.link`)} />
                <FormField id={`ad-item-${index}-label`} label={`Nhãn (tuỳ chọn, tối đa ${AD_LABEL_MAX} ký tự, sản phẩm ${n})`} error={itemErrors?.label?.message} maxLength={AD_LABEL_MAX} {...register(`items.${index}.label`)} />
                {stats && (
                  <p className="text-caption text-muted-foreground">
                    Lượt bấm: 7 ngày {stats.clicks7d} · 30 ngày {stats.clicks30d} · tổng {stats.clicksTotal}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <Field id="ad-html" label="Mã HTML (chỉ SUPER_ADMIN)" error={contentError}>
          <Textarea
            rows={6}
            maxLength={AD_HTML_MAX}
            className="font-mono"
            disabled={!canWrite}
            {...fieldAria('ad-html', contentError)}
            {...register('htmlCode')}
          />
        </Field>
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
          <Button type="submit" disabled={isSubmitting || uploading !== null}>
            {isSubmitting ? 'Đang lưu…' : item ? 'Lưu' : 'Tạo'}
          </Button>
        )}
      </div>
    </form>
  );
}
