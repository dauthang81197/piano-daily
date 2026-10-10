'use client';

import {
  type AdminOrderDetail,
  EXTEND_TOKEN_DAYS_MAX,
  EXTEND_TOKEN_DOWNLOADS_MAX,
  type ExtendTokenBody,
  OrderStatus,
} from '@piano-daily/shared';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isApiError } from '@/lib/api/client';
import { ordersApi } from '@/lib/api/orders';
import { formatUsd } from '@/lib/format';

const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại sau ít phút.';

/** Thông điệp tiếng Việt từ API (lý do cụ thể), còn lại là thông báo chung. */
function actionErrorMessage(err: unknown): string {
  return isApiError(err) && err.code !== 'INTERNAL_ERROR' ? err.message : GENERIC_ERROR;
}

/** Số nguyên dương trong [1, max]; ô trống là `undefined`; sai thì ném thông báo lỗi. */
function parseAmount(raw: string, label: string, max: number): number | undefined {
  const text = raw.trim();
  if (text === '') return undefined;
  const value = Number(text);
  if (!Number.isInteger(value) || value < 1 || value > max) throw new Error(`${label} phải là số nguyên từ 1 đến ${max}.`);
  return value;
}

/** Hai thao tác của founder trên đơn PAID: gửi lại email link tải và gia hạn token (Story 4.2). */
export function OrderActions({ order, onChange }: { order: AdminOrderDetail; onChange: (order: AdminOrderDetail) => void }) {
  const [days, setDays] = useState('');
  const [downloads, setDownloads] = useState('');
  const [busy, setBusy] = useState<'resend' | 'extend' | 'refund' | null>(null);
  const [confirmingRefund, setConfirmingRefund] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const paid = order.status === OrderStatus.PAID;
  const revoked = order.token?.revokedAt != null;
  const noToken = order.token === null;
  const blocked = !paid || revoked || noToken;
  const reason = !paid
    ? 'Chỉ đơn đã thanh toán (PAID) mới gửi lại email, gia hạn hoặc hoàn tiền được.'
    : noToken
      ? 'Đơn chưa có link tải.'
      : revoked
        ? 'Link tải đã bị vô hiệu nên không thể thao tác.'
        : null;

  const resend = async () => {
    setError(null);
    setNotice(null);
    setBusy('resend');
    try {
      onChange(await ordersApi.resendEmail(order.id));
      setNotice('Đã gửi lại email link tải.');
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const refund = async () => {
    if (busy !== null) return;
    setError(null);
    setNotice(null);
    setBusy('refund');
    try {
      onChange(await ordersApi.refund(order.id));
      setConfirmingRefund(false);
      setNotice('Đã hoàn tiền và vô hiệu link tải.');
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const extend = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    let body: ExtendTokenBody;
    try {
      const addDays = parseAmount(days, 'Số ngày', EXTEND_TOKEN_DAYS_MAX);
      const addDownloads = parseAmount(downloads, 'Số lượt', EXTEND_TOKEN_DOWNLOADS_MAX);
      if (addDays === undefined && addDownloads === undefined) throw new Error('Nhập số ngày hoặc số lượt cần thêm.');
      body = { ...(addDays !== undefined ? { addDays } : {}), ...(addDownloads !== undefined ? { addDownloads } : {}) };
    } catch (err) {
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
      return;
    }
    setBusy('extend');
    try {
      onChange(await ordersApi.extendToken(order.id, body));
      setDays('');
      setDownloads('');
      setNotice('Đã gia hạn link tải.');
    } catch (err) {
      setError(actionErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="flex flex-col gap-3" aria-label="Thao tác">
      <h2 className="font-display text-title-md text-primary">Thao tác</h2>
      <FormError>{error}</FormError>
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {reason && <p className="text-sm text-muted-foreground">{reason}</p>}
      <div className="flex flex-wrap items-end gap-3">
        <Button type="button" variant="outline" disabled={blocked || busy !== null} onClick={resend}>
          {busy === 'resend' ? 'Đang gửi…' : 'Gửi lại email'}
        </Button>
      </div>
      <form className="flex flex-wrap items-end gap-3" onSubmit={extend} noValidate>
        <div className="flex flex-col gap-1">
          <Label htmlFor="extend-days">Thêm ngày</Label>
          <Input id="extend-days" type="number" inputMode="numeric" min={1} max={EXTEND_TOKEN_DAYS_MAX} className="w-32" value={days} onChange={(e) => setDays(e.target.value)} disabled={blocked || busy !== null} />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="extend-downloads">Thêm lượt tải</Label>
          <Input id="extend-downloads" type="number" inputMode="numeric" min={1} max={EXTEND_TOKEN_DOWNLOADS_MAX} className="w-32" value={downloads} onChange={(e) => setDownloads(e.target.value)} disabled={blocked || busy !== null} />
        </div>
        <Button type="submit" variant="secondary" disabled={blocked || busy !== null}>
          {busy === 'extend' ? 'Đang gia hạn…' : 'Gia hạn'}
        </Button>
      </form>
      {confirmingRefund && paid ? (
        <div role="group" aria-label="Xác nhận hoàn tiền" className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-error">Hoàn toàn bộ {formatUsd(order.amountCents)} cho đơn {order.orderCode}? Link tải sẽ bị vô hiệu và không thể hoàn tác.</span>
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={refund}>
            {busy === 'refund' ? 'Đang hoàn tiền…' : 'Xác nhận hoàn tiền'}
          </Button>
          <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => setConfirmingRefund(false)}>
            Huỷ
          </Button>
        </div>
      ) : (
        <div>
          <Button type="button" variant="secondary" disabled={!paid || busy !== null} onClick={() => setConfirmingRefund(true)}>
            Hoàn tiền
          </Button>
        </div>
      )}
    </section>
  );
}
