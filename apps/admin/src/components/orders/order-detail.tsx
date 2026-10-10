'use client';

import type { AdminOrderDetail } from '@piano-daily/shared';
import { ArrowLeft, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { type ReactNode, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { loadErrorMessage } from '@/components/taxonomy/server-error';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ordersApi } from '@/lib/api/orders';
import { formatReportDateTime, formatUsd } from '@/lib/format';
import { ORDER_STATUS_LABELS, REVIEW_LABEL, TOKEN_STATUS_LABELS } from './order-labels';

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="break-words">{children || '—'}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3" aria-label={title}>
      <h2 className="font-display text-title-md text-primary">{title}</h2>
      {children}
    </section>
  );
}

/** Trang chi tiết đơn (chỉ đọc): đơn, items snapshot, PayPal, mốc thời gian, token và lịch sử tải. */
export function OrderDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setOrder(null);
    setError(null);
    ordersApi
      .get(id, controller.signal)
      .then(setOrder)
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(loadErrorMessage(err));
      });
    return () => controller.abort();
  }, [id]);

  return (
    <section className="flex flex-col gap-6">
      <Link href="/orders" className="inline-flex items-center gap-1 text-sm text-primary underline underline-offset-4">
        <ArrowLeft aria-hidden="true" className="size-4" />
        Danh sách đơn hàng
      </Link>
      <FormError>{error}</FormError>
      {!order && !error && <p className="text-muted-foreground">Đang tải…</p>}
      {order && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="font-display text-headline-md text-primary">Đơn {order.orderCode}</h1>
            <span className="rounded-sm bg-muted px-2 py-0.5 text-sm">{ORDER_STATUS_LABELS[order.status]}</span>
            {order.reviewRequired && (
              <span role="status" className="inline-flex items-center gap-1 rounded-sm bg-error-container px-2 py-0.5 text-sm font-semibold text-error">
                <TriangleAlert aria-hidden="true" className="size-4" />
                {REVIEW_LABEL}
              </span>
            )}
          </div>

          <Section title="Thông tin đơn">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="Email người mua">{order.email}</Field>
              <Field label="Sheet">{order.sheet.title}</Field>
              <Field label="Tổng tiền">{`${formatUsd(order.amountCents)} ${order.currency}`}</Field>
              <Field label="Ngày tạo">{formatReportDateTime(order.createdAt)}</Field>
              <Field label="Thanh toán lúc">{formatReportDateTime(order.paidAt)}</Field>
              <Field label="Hoàn tiền lúc">{formatReportDateTime(order.refundedAt)}</Field>
              <Field label="Gửi email lúc">{formatReportDateTime(order.emailSentAt)}</Field>
            </dl>
          </Section>

          <Section title="File đã mua">
            <Table aria-label="File đã mua">
              <TableHeader>
                <TableRow>
                  <TableHead>Loại file</TableHead>
                  <TableHead>Giá lúc mua</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.fileType}>
                    <TableCell>{item.fileType}</TableCell>
                    <TableCell>{formatUsd(item.priceCents)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Section>

          <Section title="PayPal">
            <dl className="grid gap-4 sm:grid-cols-2">
              <Field label="PayPal order ID">{order.paypalOrderId}</Field>
              <Field label="PayPal capture ID">{order.paypalCaptureId}</Field>
              <Field label="Email PayPal">{order.payerEmail}</Field>
              <Field label="Tên người thanh toán">{order.payerName}</Field>
            </dl>
          </Section>

          <Section title="Link tải">
            {order.token ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <Field label="Trạng thái">{TOKEN_STATUS_LABELS[order.token.status]}</Field>
                <Field label="Hết hạn lúc">{formatReportDateTime(order.token.expiresAt)}</Field>
                <Field label="Lượt đã dùng / tối đa">{`${order.token.usedDownloads} / ${order.token.maxDownloads}`}</Field>
                <Field label="Vô hiệu lúc">{order.token.revokedAt ? formatReportDateTime(order.token.revokedAt) : 'Chưa vô hiệu'}</Field>
              </dl>
            ) : (
              <p className="text-muted-foreground">Đơn chưa có link tải.</p>
            )}
          </Section>

          <Section title="Lịch sử tải">
            <Table aria-label="Lịch sử tải">
              <TableHeader>
                <TableRow>
                  <TableHead>Thời điểm</TableHead>
                  <TableHead>Loại file</TableHead>
                  <TableHead>Trình duyệt (UA)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.downloads.map((log) => (
                  <TableRow key={log.id}>
                    <TableCell>{formatReportDateTime(log.createdAt)}</TableCell>
                    <TableCell>{log.fileType}</TableCell>
                    <TableCell className="break-all text-muted-foreground">{log.ua ?? '—'}</TableCell>
                  </TableRow>
                ))}
                {order.downloads.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="py-6 text-center text-muted-foreground">
                      Chưa có lượt tải nào.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Section>
        </>
      )}
    </section>
  );
}
