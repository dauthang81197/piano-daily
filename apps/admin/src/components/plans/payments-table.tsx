'use client';

import { formatUsd, type SubscriptionPayment } from '@piano-daily/shared';
import { useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { loadErrorMessage } from '@/components/taxonomy/server-error';
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
  const [payments, setPayments] = useState<SubscriptionPayment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    plansApi
      .payments(controller.signal)
      .then(setPayments)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, []);

  return (
    <section className="flex flex-col gap-3" aria-label="Thanh toán gói">
      <h2 className="text-sm font-medium">Thanh toán gói gần đây</h2>
      <FormError>{error}</FormError>
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
            </TableRow>
          ))}
          {payments === null && !error && (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                Đang tải…
              </TableCell>
            </TableRow>
          )}
          {payments && payments.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                Chưa có thanh toán gói nào.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </section>
  );
}
