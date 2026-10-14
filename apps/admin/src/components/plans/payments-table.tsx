'use client';

import { formatUsd, type SubscriptionPayment } from '@piano-daily/shared';
import { useCallback, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-provider';
import { applyServerError, loadErrorMessage } from '@/components/taxonomy/server-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { plansApi } from '@/lib/api/plans';

const STATUS_LABELS: Record<SubscriptionPayment['status'], string> = {
  PENDING: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  FAILED: 'Thất bại',
  CANCELLED: 'Đã huỷ',
  REFUNDED: 'Đã hoàn tiền',
};
const PROVIDER_LABELS: Record<SubscriptionPayment['provider'], string> = { PAYPAL: 'PayPal', VIETQR: 'VietQR' };

/** Tiền theo đơn vị nhỏ nhất của tiền tệ: USD cents -> "$4.99", VND -> "99.000 ₫". */
export function formatPaymentAmount(payment: Pick<SubscriptionPayment, 'amount' | 'currency'>): string {
  return payment.currency === 'USD' ? `$${formatUsd(payment.amount)}` : `${payment.amount.toLocaleString('vi-VN')} ₫`;
}

/** Thanh toán gói gần đây (chỉ đọc). Hoàn tiền gói làm trên PayPal/ngân hàng; webhook tự cập nhật trạng thái. */
export function PaymentsTable() {
  const { user } = useAuth();
  const canWrite = user?.role === 'SUPER_ADMIN';
  const [payments, setPayments] = useState<SubscriptionPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  /** Xác nhận hai bước: hành động cấp quyền dùng trả phí nên bấm lần đầu chỉ hỏi lại. */
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    plansApi
      .payments(controller.signal)
      .then(setPayments)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [reloadToken]);

  /** Khách chuyển khoản sai nội dung nên đối soát tự động không khớp: admin kiểm tra sao kê rồi xác nhận thủ công. */
  const confirm = useCallback(async (payment: SubscriptionPayment) => {
    setBusyId(payment.id);
    setConfirmingId(null);
    setActionError(null);
    setNotice(null);
    try {
      await plansApi.confirmPayment(payment.id);
      setNotice(`Đã xác nhận thanh toán ${payment.code} và kích hoạt gói.`);
      setReloadToken((t) => t + 1);
    } catch (err) {
      setActionError(applyServerError(err, [] as const, () => undefined));
    } finally {
      setBusyId(null);
    }
  }, []);

  return (
    <section className="flex flex-col gap-3" aria-label="Thanh toán gói">
      <h2 className="text-sm font-medium">Thanh toán gói gần đây</h2>
      <FormError>{error}</FormError>
      <FormError>{actionError}</FormError>
      {notice ? (
        <p role="status" className="text-sm text-primary">
          {notice}
        </p>
      ) : null}
      <Table aria-label="Danh sách thanh toán gói">
        <TableHeader>
          <TableRow>
            <TableHead>Mã</TableHead>
            <TableHead>Khách</TableHead>
            <TableHead>Gói</TableHead>
            <TableHead>Cách trả</TableHead>
            <TableHead>Số tiền</TableHead>
            <TableHead>Trạng thái</TableHead>
            <TableHead>Thời gian</TableHead>
            <TableHead className="text-right">Thao tác</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments?.map((p) => (
            <TableRow key={p.id}>
              <TableCell className="font-mono text-xs">{p.code}</TableCell>
              <TableCell>{p.customerEmail}</TableCell>
              <TableCell>{p.planNameVi}</TableCell>
              <TableCell>{PROVIDER_LABELS[p.provider]}</TableCell>
              <TableCell>{formatPaymentAmount(p)}</TableCell>
              <TableCell>
                {STATUS_LABELS[p.status]}
                {p.reviewRequired ? <span className="ml-2 text-error">Cần xem xét</span> : null}
              </TableCell>
              <TableCell>{new Date(p.paidAt ?? p.createdAt).toLocaleString('vi-VN')}</TableCell>
              <TableCell className="text-right">
                {canWrite && p.provider === 'VIETQR' && (p.status === 'PENDING' || p.status === 'FAILED') ? (
                  confirmingId === p.id ? (
                    <div role="group" aria-label={`Xác nhận ${p.code}`} className="flex flex-wrap items-center justify-end gap-2">
                      <span className="text-xs text-error">Đã đối chiếu sao kê và nhận đủ tiền?</span>
                      <Button size="sm" disabled={busyId !== null} aria-label={`Chắc chắn đã nhận tiền ${p.code}`} onClick={() => void confirm(p)}>
                        {busyId === p.id ? 'Đang xác nhận…' : 'Chắc chắn'}
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId !== null} onClick={() => setConfirmingId(null)}>
                        Huỷ
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId !== null}
                      aria-label={`Xác nhận đã nhận tiền ${p.code}`}
                      onClick={() => setConfirmingId(p.id)}
                    >
                      Xác nhận đã nhận tiền
                    </Button>
                  )
                ) : null}
              </TableCell>
            </TableRow>
          ))}
          {payments === null && !error && (
            <TableRow>
              <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                Đang tải…
              </TableCell>
            </TableRow>
          )}
          {payments && payments.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-6 text-center text-muted-foreground">
                Chưa có thanh toán gói nào.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
