'use client';

import {
  type AdminSettings,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  MAX_TOKEN_DAYS,
  MAX_TOKEN_DOWNLOADS,
  SEO_DESCRIPTION_MAX,
  type UpdateSettingsBody,
  updateSettingsBodySchema,
} from '@piano-daily/shared';
import { type ChangeEvent, type FormEvent, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api/client';
import { settingsApi } from '@/lib/api/settings';

const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.';
const LOAD_ERROR = 'Không tải được cài đặt. Vui lòng thử lại.';

type FieldName = keyof UpdateSettingsBody;
type Values = {
  siteName: string;
  seoDescription: string;
  youtubeUrl: string;
  paymentsEnabled: boolean;
  tokenDefaultDays: string;
  tokenDefaultMaxDownloads: string;
};
type FieldErrors = Partial<Record<FieldName, string>>;

const toValues = (s: AdminSettings): Values => ({
  siteName: s.siteName,
  seoDescription: s.seoDescription,
  youtubeUrl: s.youtubeUrl,
  paymentsEnabled: s.paymentsEnabled,
  tokenDefaultDays: String(s.tokenDefaultDays),
  tokenDefaultMaxDownloads: String(s.tokenDefaultMaxDownloads),
});

/** Chuỗi số -> number; rỗng/không phải số thành NaN để schema từ chối bằng thông điệp của trường. */
const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.trim()));

const FIELD_NAMES: readonly string[] = [
  'siteName',
  'seoDescription',
  'youtubeUrl',
  'paymentsEnabled',
  'tokenDefaultDays',
  'tokenDefaultMaxDownloads',
];

/** Lỗi theo trường từ `details` của 400 (`path` là tên trường hoặc mảng đường dẫn). */
function serverFieldErrors(err: unknown): FieldErrors {
  const out: FieldErrors = {};
  if (!isApiError(err) || !Array.isArray(err.details)) return out;
  for (const d of err.details as { path?: unknown; message?: unknown }[]) {
    const path = Array.isArray(d.path) ? d.path[0] : d.path;
    if (typeof path === 'string' && FIELD_NAMES.includes(path) && typeof d.message === 'string') {
      out[path as FieldName] ??= d.message;
    }
  }
  return out;
}

const messageOf = (err: unknown) => (isApiError(err) && err.code !== 'INTERNAL_ERROR' ? err.message : GENERIC_ERROR);

/** Trang Cài đặt site (Story 4.4): thông tin site, logo, công tắc thanh toán, mặc định của link tải. */
export function SettingsForm() {
  const [saved, setSaved] = useState<AdminSettings | null>(null);
  const [values, setValues] = useState<Values | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    settingsApi
      .get(controller.signal)
      .then((s) => {
        setSaved(s);
        setValues(toValues(s));
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        setLoadError(isApiError(err) && err.code !== 'INTERNAL_ERROR' ? err.message : LOAD_ERROR);
      });
    return () => controller.abort();
  }, []);

  if (loadError) return <FormError>{loadError}</FormError>;
  if (!values || !saved) return <p className="text-body-md text-muted-foreground">Đang tải cài đặt…</p>;

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => (v ? { ...v, [key]: value } : v));
    setErrors((e) => ({ ...e, [key]: undefined }));
    setNotice(null);
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setFormError(null);
    setNotice(null);
    const parsed = updateSettingsBodySchema.safeParse({
      siteName: values.siteName,
      seoDescription: values.seoDescription,
      youtubeUrl: values.youtubeUrl,
      paymentsEnabled: values.paymentsEnabled,
      tokenDefaultDays: toNumber(values.tokenDefaultDays),
      tokenDefaultMaxDownloads: toNumber(values.tokenDefaultMaxDownloads),
    });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (typeof path === 'string') next[path as FieldName] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const result = await settingsApi.update(parsed.data);
      setSaved(result);
      setValues(toValues(result));
      setNotice('Đã lưu cài đặt.');
    } catch (err) {
      const fields = serverFieldErrors(err);
      if (Object.keys(fields).length > 0) setErrors(fields);
      else setFormError(messageOf(err));
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    setLogoError(null);
    setNotice(null);
    if (!(LOGO_MIME_TYPES as readonly string[]).includes(file.type)) {
      setLogoError('Logo phải là ảnh PNG, JPEG hoặc WebP.');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      setLogoError('Logo vượt quá 2 MB.');
      return;
    }
    setUploading(true);
    try {
      const result = await settingsApi.uploadLogo(file);
      // Chỉ cập nhật logo; giữ nguyên các ô người dùng đang sửa dở.
      setSaved((s) => (s ? { ...s, logoUrl: result.logoUrl } : result));
      setNotice('Đã cập nhật logo.');
    } catch (err) {
      const first = isApiError(err) && Array.isArray(err.details) ? (err.details as { message?: unknown }[])[0]?.message : null;
      setLogoError(typeof first === 'string' ? first : messageOf(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate className="flex max-w-2xl flex-col gap-8" aria-label="Cài đặt site">
      <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Thông tin site</legend>
        <FormField
          id="settings-site-name"
          label="Tên site"
          value={values.siteName}
          onChange={(e) => set('siteName', e.target.value)}
          error={errors.siteName}
        />
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-logo">Logo</Label>
          {saved.logoUrl ? (
            <img src={saved.logoUrl} alt="Logo hiện tại" className="h-16 w-auto max-w-48 self-start rounded-sm border object-contain" />
          ) : (
            <p className="text-caption text-muted-foreground">Chưa có logo.</p>
          )}
          <input
            id="settings-logo"
            type="file"
            accept={LOGO_MIME_TYPES.join(',')}
            disabled={uploading}
            onChange={onLogo}
            aria-describedby="settings-logo-hint"
            className="text-sm"
          />
          <p id="settings-logo-hint" className="text-caption text-muted-foreground">
            PNG, JPEG hoặc WebP, tối đa 2 MB; được thu về WebP cạnh dài tối đa 512 px. Logo áp dụng ngay khi tải lên.
          </p>
          {uploading ? <p className="text-caption text-muted-foreground">Đang tải logo lên…</p> : null}
          <FormError size="sm">{logoError}</FormError>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="settings-seo">Mô tả SEO mặc định</Label>
          <Textarea
            id="settings-seo"
            rows={3}
            value={values.seoDescription}
            onChange={(e) => set('seoDescription', e.target.value)}
            aria-invalid={errors.seoDescription ? true : undefined}
            aria-describedby={errors.seoDescription ? 'settings-seo-error' : undefined}
          />
          <p className="text-caption text-muted-foreground">
            {values.seoDescription.length}/{SEO_DESCRIPTION_MAX} ký tự. Để trống để dùng mô tả mặc định theo ngôn ngữ.
          </p>
          <FormError id="settings-seo-error" size="sm">
            {errors.seoDescription}
          </FormError>
        </div>
        <FormField
          id="settings-youtube"
          label="Link YouTube"
          placeholder="https://www.youtube.com/@kenh-cua-ban (để trống để ẩn)"
          value={values.youtubeUrl}
          onChange={(e) => set('youtubeUrl', e.target.value)}
          error={errors.youtubeUrl}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4 rounded-lg border p-4">
        <legend className="px-1 text-sm font-medium">Thanh toán và link tải</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="size-4"
            checked={values.paymentsEnabled}
            onChange={(e) => set('paymentsEnabled', e.target.checked)}
          />
          Bật thanh toán
        </label>
        <p className="text-caption text-muted-foreground">
          Tắt thì không tạo được đơn mới và nút mua Sheet trả phí không khả dụng. Link tải đã phát vẫn tải được; Sheet miễn phí không ảnh hưởng.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            id="settings-token-days"
            label="Số ngày hiệu lực mặc định"
            inputMode="numeric"
            placeholder={`1 đến ${MAX_TOKEN_DAYS}`}
            value={values.tokenDefaultDays}
            onChange={(e) => set('tokenDefaultDays', e.target.value)}
            error={errors.tokenDefaultDays}
          />
          <FormField
            id="settings-token-downloads"
            label="Số lượt tải mặc định"
            inputMode="numeric"
            placeholder={`1 đến ${MAX_TOKEN_DOWNLOADS}`}
            value={values.tokenDefaultMaxDownloads}
            onChange={(e) => set('tokenDefaultMaxDownloads', e.target.value)}
            error={errors.tokenDefaultMaxDownloads}
          />
        </div>
        <p className="text-caption text-muted-foreground">Chỉ áp dụng cho link tải phát sau khi lưu; link cũ giữ nguyên giá trị đã phát.</p>
      </fieldset>

      <FormError>{formError}</FormError>
      {notice ? (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? 'Đang lưu…' : 'Lưu cài đặt'}
        </Button>
      </div>
    </form>
  );
}
