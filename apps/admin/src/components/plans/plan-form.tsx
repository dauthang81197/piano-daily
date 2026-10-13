'use client';

import { type Plan, type PlanBody, planBodySchema } from '@piano-daily/shared';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { applyServerError } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { plansApi } from '@/lib/api/plans';
import { useAuth } from '@/lib/auth/auth-provider';

export const PLAN_READ_ONLY_REASON = 'Chỉ SUPER_ADMIN được thay đổi gói thuê bao.';

const FIELDS = [
  'nameVi',
  'nameEn',
  'descriptionVi',
  'descriptionEn',
  'priceVnd',
  'priceUsdCents',
  'durationDays',
  'downloadQuota',
  'sortOrder',
  'isActive',
] as const;
type Field = (typeof FIELDS)[number];
type Errors = Partial<Record<Field, string>>;
type Values = Record<Exclude<Field, 'isActive'>, string> & { isActive: boolean };

const initial = (plan: Plan | null): Values => ({
  nameVi: plan?.nameVi ?? '',
  nameEn: plan?.nameEn ?? '',
  descriptionVi: plan?.descriptionVi ?? '',
  descriptionEn: plan?.descriptionEn ?? '',
  priceVnd: String(plan?.priceVnd ?? 0),
  priceUsdCents: String(plan?.priceUsdCents ?? 0),
  durationDays: String(plan?.durationDays ?? 30),
  downloadQuota: plan?.downloadQuota == null ? '' : String(plan.downloadQuota),
  sortOrder: String(plan?.sortOrder ?? 0),
  isActive: plan?.isActive ?? true,
});

/** Số nguyên từ chuỗi; rỗng/không phải số thành NaN để schema từ chối bằng thông điệp của trường. */
const toNumber = (text: string) => (text.trim() === '' ? Number.NaN : Number(text.trim()));

/** Form tạo/sửa gói (trong dialog). EDITOR chỉ xem: mọi trường bị vô hiệu và không có nút lưu. */
export function PlanForm({ plan, onDone, onCancel }: { plan: Plan | null; onDone: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [values, setValues] = useState<Values>(() => initial(plan));
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !canWrite) return;
    setFormError(null);
    const parsed = planBodySchema.safeParse({
      nameVi: values.nameVi,
      nameEn: values.nameEn,
      descriptionVi: values.descriptionVi,
      descriptionEn: values.descriptionEn,
      priceVnd: toNumber(values.priceVnd),
      priceUsdCents: toNumber(values.priceUsdCents),
      durationDays: toNumber(values.durationDays),
      // Để trống = không giới hạn lượt tải mỗi kỳ.
      downloadQuota: values.downloadQuota.trim() === '' ? null : toNumber(values.downloadQuota),
      sortOrder: toNumber(values.sortOrder),
      isActive: values.isActive,
    });
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0] as Field | undefined;
        if (path) next[path] ??= issue.message;
      }
      setErrors(next);
      return;
    }
    setBusy(true);
    try {
      const body: PlanBody = parsed.data;
      if (plan) await plansApi.update(plan.id, body);
      else await plansApi.create(body);
      onDone();
    } catch (err) {
      setFormError(applyServerError(err, FIELDS, (field, message) => setErrors((e) => ({ ...e, [field]: message }))));
    } finally {
      setBusy(false);
    }
  };

  const text = (field: Exclude<Field, 'isActive'>, label: string, extra: Record<string, unknown> = {}) => (
    <FormField
      id={`plan-${field}`}
      label={label}
      value={values[field]}
      onChange={(e) => set(field, e.target.value)}
      error={errors[field]}
      disabled={!canWrite}
      {...extra}
    />
  );

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4" aria-label="Gói thuê bao">
      <FormError>{formError}</FormError>
      {!canWrite && <p className="text-sm text-muted-foreground">{PLAN_READ_ONLY_REASON}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        {text('nameVi', 'Tên (tiếng Việt)')}
        {text('nameEn', 'Tên (tiếng Anh)')}
        {text('descriptionVi', 'Mô tả (tiếng Việt)')}
        {text('descriptionEn', 'Mô tả (tiếng Anh)')}
        {text('priceVnd', 'Giá VND', { inputMode: 'numeric' })}
        {text('priceUsdCents', 'Giá USD (cent, 499 = $4,99)', { inputMode: 'numeric' })}
        {text('durationDays', 'Thời hạn (ngày)', { inputMode: 'numeric' })}
        {text('downloadQuota', 'Lượt tải mỗi kỳ (để trống = không giới hạn)', { inputMode: 'numeric' })}
        {text('sortOrder', 'Thứ tự hiển thị (nhỏ trước)', { inputMode: 'numeric' })}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          className="size-4"
          checked={values.isActive}
          disabled={!canWrite}
          onChange={(e) => set('isActive', e.target.checked)}
        />
        Đang bật (hiện trên trang giá)
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          {canWrite ? 'Huỷ' : 'Đóng'}
        </Button>
        {canWrite && (
          <Button type="submit" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Lưu gói'}
          </Button>
        )}
      </div>
    </form>
  );
}
