'use client';

import { formatUsd, type Plan } from '@piano-daily/shared';
import { Plus } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { DeleteConfirm } from '@/components/taxonomy/delete-confirm';
import { applyServerError, loadErrorMessage } from '@/components/taxonomy/server-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { plansApi } from '@/lib/api/plans';
import { useAuth } from '@/lib/auth/auth-provider';
import { GrantPlanForm } from './grant-plan-form';
import { PaymentsTable } from './payments-table';
import { PLAN_READ_ONLY_REASON, PlanForm } from './plan-form';

type DialogState = { open: false } | { open: true; plan: Plan | null };

const vnd = (n: number) => `${n.toLocaleString('vi-VN')} ₫`;
const messageOf = (err: unknown) => applyServerError(err, [] as const, () => undefined);

/** Trang Gói thuê bao (S2): danh sách gói, tạo/sửa trong dialog, bật/tắt, xoá, và form cấp gói thủ công. */
export function PlanTable() {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [dialog, setDialog] = useState<DialogState>({ open: false });
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    plansApi
      .list(controller.signal)
      .then((list) => {
        setPlans(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [reloadToken]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);
  const done = useCallback(() => {
    setDialog({ open: false });
    reload();
  }, [reload]);

  const toggle = async (plan: Plan, isActive: boolean) => {
    setBusyId(plan.id);
    setActionError(null);
    try {
      await plansApi.setActive(plan.id, isActive);
      reload();
    } catch (err) {
      setActionError(messageOf(err));
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (plan: Plan) => {
    setActionError(null);
    await plansApi.remove(plan.id);
    reload();
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {!canWrite && <p className="text-sm text-muted-foreground">{PLAN_READ_ONLY_REASON}</p>}
          <Button
            className="ml-auto"
            disabled={!canWrite || plans === null}
            title={!canWrite ? PLAN_READ_ONLY_REASON : undefined}
            onClick={() => setDialog({ open: true, plan: null })}
          >
            <Plus aria-hidden="true" />
            Tạo gói
          </Button>
        </div>

        <FormError>{error}</FormError>
        <FormError>{actionError}</FormError>

        <Table aria-label="Danh sách gói thuê bao">
          <TableHeader>
            <TableRow>
              <TableHead>Gói</TableHead>
              <TableHead>Giá</TableHead>
              <TableHead>Thời hạn</TableHead>
              <TableHead>Lượt tải/kỳ</TableHead>
              <TableHead>Đang dùng</TableHead>
              <TableHead>Bật</TableHead>
              <TableHead className="text-right">Thao tác</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {plans?.map((plan) => (
              <TableRow key={plan.id}>
                <TableCell>
                  <div className="font-medium">{plan.nameVi}</div>
                  <div className="text-caption text-muted-foreground">{plan.nameEn}</div>
                </TableCell>
                <TableCell>
                  {vnd(plan.priceVnd)} / ${formatUsd(plan.priceUsdCents)}
                </TableCell>
                <TableCell>{plan.durationDays} ngày</TableCell>
                <TableCell>{plan.downloadQuota ?? 'Không giới hạn'}</TableCell>
                <TableCell>{plan.activeSubscriptions}</TableCell>
                <TableCell>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={plan.isActive}
                      disabled={!canWrite || busyId === plan.id}
                      title={!canWrite ? PLAN_READ_ONLY_REASON : undefined}
                      aria-label={`Bật ${plan.nameVi}`}
                      onChange={(e) => toggle(plan, e.target.checked)}
                    />
                    {plan.isActive ? 'Đang bật' : 'Đang tắt'}
                  </label>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      aria-label={`${canWrite ? 'Sửa' : 'Xem'} ${plan.nameVi}`}
                      onClick={() => setDialog({ open: true, plan })}
                    >
                      {canWrite ? 'Sửa' : 'Xem'}
                    </Button>
                    {canWrite && (
                      <DeleteConfirm itemLabel={plan.nameVi} onConfirm={() => remove(plan)} onError={(err) => setActionError(messageOf(err))} />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {plans && plans.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                  Chưa có gói nào. Bấm “Tạo gói” để thêm.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <GrantPlanForm plans={plans ?? []} />

      <PaymentsTable />

      <Dialog open={dialog.open} onOpenChange={(open) => !open && setDialog({ open: false })}>
        <DialogContent className="sm:max-w-2xl">
          {dialog.open && (
            <>
              <DialogHeader>
                <DialogTitle>{dialog.plan ? 'Sửa gói' : 'Tạo gói'}</DialogTitle>
                <DialogDescription>
                  Giá VND và USD nhập riêng cho từng gói. Gói đã có người đăng ký thì tắt thay vì xoá.
                </DialogDescription>
              </DialogHeader>
              <PlanForm plan={dialog.plan} onDone={done} onCancel={() => setDialog({ open: false })} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
