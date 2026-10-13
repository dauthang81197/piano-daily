'use client';

import { type Plan, grantPlanBodySchema } from '@piano-daily/shared';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { FormField } from '@/components/form-field';
import { applyServerError } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { isApiError } from '@/lib/api/client';
import { plansApi } from '@/lib/api/plans';
import { useAuth } from '@/lib/auth/auth-provider';
import { PLAN_READ_ONLY_REASON } from './plan-form';

const formatDate = (iso: string) => new Date(iso).toLocaleString('vi-VN');

/** Cấp tay một gói cho khách theo email (S2: chưa có thanh toán, dùng để thử và hỗ trợ khách). Chỉ SUPER_ADMIN. */
export function GrantPlanForm({ plans }: { plans: Plan[] }) {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const active = plans.filter((p) => p.isActive);
  const [email, setEmail] = useState('');
  const [planId, setPlanId] = useState('');
  const [errors, setErrors] = useState<{ email?: string; planId?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !canWrite) return;
    setFormError(null);
    setNotice(null);
    const parsed = grantPlanBodySchema.safeParse({ email, planId: planId || undefined });
    if (!parsed.success) {
      const next: { email?: string; planId?: string } = {};
      for (const issue of parsed.error.issues) {
        const path = issue.path[0];
        if (path === 'email') next.email ??= issue.message;
        if (path === 'planId') next.planId ??= 'Vui lòng chọn gói.';
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const result = await plansApi.grant(parsed.data);
      setNotice(`Đã cấp gói cho ${result.customerEmail}, hiệu lực đến ${formatDate(result.currentPeriodEnd)}.`);
    } catch (err) {
      // 404 ở đây nghĩa là không có khách với email này (thông điệp của API rõ nghĩa hơn thông điệp chung).
      if (isApiError(err) && err.code === 'NOT_FOUND') setFormError(err.message);
      else setFormError(applyServerError(err, ['planId'] as const, (field, message) => setErrors((e) => ({ ...e, [field]: message }))));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate aria-label="Cấp gói thủ công" className="flex max-w-xl flex-col gap-4 rounded-lg border p-4">
      <h2 className="text-sm font-medium">Cấp gói thủ công</h2>
      <p className="text-caption text-muted-foreground">
        Cấp một gói còn hạn cho khách đã đăng ký (theo email). Gói đang dùng của khách (nếu có) sẽ bị thay thế. Dùng để thử trước khi có thanh toán.
      </p>
      {!canWrite && <p className="text-sm text-muted-foreground">{PLAN_READ_ONLY_REASON}</p>}
      <FormField
        id="grant-email"
        label="Email khách"
        type="email"
        value={email}
        onChange={(e) => {
          setEmail(e.target.value);
          setErrors((v) => ({ ...v, email: undefined }));
        }}
        error={errors.email}
        disabled={!canWrite}
      />
      <div className="flex flex-col gap-2">
        <Label htmlFor="grant-plan">Gói</Label>
        <select
          id="grant-plan"
          value={planId}
          disabled={!canWrite}
          onChange={(e) => {
            setPlanId(e.target.value);
            setErrors((v) => ({ ...v, planId: undefined }));
          }}
          aria-invalid={errors.planId ? true : undefined}
          className="h-9 rounded-md border bg-background px-3 text-sm"
        >
          <option value="">Chọn gói…</option>
          {active.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nameVi} ({p.durationDays} ngày)
            </option>
          ))}
        </select>
        <FormError size="sm">{errors.planId}</FormError>
      </div>
      <FormError>{formError}</FormError>
      {notice ? (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={busy || !canWrite}>
          {busy ? 'Đang cấp…' : 'Cấp gói'}
        </Button>
      </div>
    </form>
  );
}
