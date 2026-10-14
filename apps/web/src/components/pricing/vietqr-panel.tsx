'use client';

import type { CreateVietqrResponse, Entitlement } from '@piano-daily/shared';
import { Copy, LoaderCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { FormError } from '@/components/payment/form-error';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';

/** Chu kỳ hỏi trạng thái và thời gian chờ tối đa trước khi gợi ý liên hệ (tiền vẫn có thể về muộn). */
export const VIETQR_POLL_MS = 4000;
export const VIETQR_WAIT_MS = 15 * 60 * 1000;
/** Sau thời gian chờ vẫn hỏi, thưa hơn. */
export const VIETQR_SLOW_POLL_MS = 20_000;

type ErrorKey = 'unavailable' | 'paymentsDisabled' | 'network' | 'tooMany' | 'verify' | 'generic';

function errorKeyOf(err: unknown): ErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'SERVICE_UNAVAILABLE':
      return 'unavailable';
    case 'PAYMENTS_DISABLED':
      return 'paymentsDisabled';
    case 'NETWORK_ERROR':
      return 'network';
    case 'TOO_MANY_REQUESTS':
      return 'tooMany';
    case 'EMAIL_NOT_VERIFIED':
      return 'verify';
    default:
      return 'generic';
  }
}

function CopyRow({ label, value, copyLabel }: { label: string; value: string; copyLabel: string }) {
  const [copied, setCopied] = useState(false);
  const t = useTranslations('Pricing.checkout.vietqrPanel');
  return (
    <div className="flex items-center justify-between gap-3 border-b border-outline-variant py-2 text-body-md">
      <span className="text-on-surface-variant">{label}</span>
      <span className="flex items-center gap-2">
        <strong className="break-all text-right text-on-surface">{value}</strong>
        <button
          type="button"
          aria-label={copyLabel}
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => setCopied(true)).catch(() => undefined);
          }}
          className="inline-flex size-9 shrink-0 items-center justify-center rounded-md text-on-surface-variant hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-secondary"
        >
          <Copy aria-hidden="true" className="size-4" />
        </button>
        <span role="status" className="sr-only">
          {copied ? t('copied') : ''}
        </span>
      </span>
    </div>
  );
}

/**
 * Thanh toán gói bằng VietQR (S4): lấy ảnh QR + thông tin chuyển khoản từ server, rồi tự hỏi trạng thái cho tới khi
 * SePay báo tiền về (server kích hoạt gói). Không bao giờ tự coi là đã thanh toán: chỉ tin `status=PAID` từ server.
 */
export function VietqrPanel({ planId, onPaid }: { planId: string; onPaid: (entitlement: Entitlement) => void }) {
  const t = useTranslations('Pricing.checkout.vietqrPanel');
  const auth = useCustomer();
  const [info, setInfo] = useState<CreateVietqrResponse | null>(null);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  /** Trạng thái cuối không thể tự hết: thanh toán đã hoàn tiền/huỷ (khác `FAILED`, vốn vẫn có thể kích hoạt khi tiền về muộn). */
  const [closed, setClosed] = useState(false);
  const [sessionLost, setSessionLost] = useState(false);
  const paid = useRef(false);
  // Giữ phiên bản mới nhất của callback/token mà không phải dựng lại vòng polling (có thể kéo dài nhiều phút).
  const latest = useRef({ getToken: auth?.getToken, onPaid });
  latest.current = { getToken: auth?.getToken, onPaid };

  const load = useCallback(async () => {
    setErrorKey(null);
    try {
      const token = await latest.current.getToken?.();
      if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Cần đăng nhập.');
      return await customerApi.createVietqr(token, planId);
    } catch (err) {
      setErrorKey(errorKeyOf(err));
      return null;
    }
  }, [planId]);

  useEffect(() => {
    let cancelled = false;
    setInfo(null);
    void load().then((created) => {
      if (!cancelled && created) setInfo(created);
    });
    return () => {
      cancelled = true; // bỏ kết quả của lần tạo cũ khi đổi gói hoặc đóng panel
    };
  }, [load]);

  const code = info?.paymentCode;
  useEffect(() => {
    if (!code) return;
    const startedAt = Date.now();
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      if (stopped || paid.current) return;
      // Sau thời gian chờ vẫn hỏi tiếp nhưng thưa hơn: tiền có thể về muộn và server vẫn kích hoạt.
      const slow = Date.now() - startedAt > VIETQR_WAIT_MS;
      timer = setTimeout(() => void tick(), slow ? VIETQR_SLOW_POLL_MS : VIETQR_POLL_MS);
    };
    const tick = async () => {
      if (stopped || paid.current) return;
      if (Date.now() - startedAt > VIETQR_WAIT_MS) setTimedOut(true);
      try {
        const token = await latest.current.getToken?.();
        if (!token) {
          setSessionLost(true); // phiên hết hạn: không hỏi được nữa, nhưng gói vẫn tự kích hoạt khi tiền về
          return;
        }
        const result = await customerApi.paymentStatus(token, code);
        if (result.status === 'PAID' && result.entitlement && !stopped && !paid.current) {
          paid.current = true;
          latest.current.onPaid(result.entitlement);
          return;
        }
        if (result.status === 'REFUNDED' || result.status === 'CANCELLED') {
          setClosed(true);
          return;
        }
      } catch {
        /* lỗi mạng thoáng qua: thử lại ở lần sau */
      }
      schedule();
    };
    schedule();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [code]);

  if (errorKey) {
    return (
      <FormError
        action={
          errorKey === 'network' || errorKey === 'generic' ? (
            <button type="button" onClick={() => void load().then((created) => created && setInfo(created))} className="self-start rounded-sm font-semibold underline underline-offset-4">
              {t('retry')}
            </button>
          ) : undefined
        }
      >
        {t(`errors.${errorKey}`)}
      </FormError>
    );
  }
  if (!info) {
    return (
      <p role="status" className="flex items-center gap-2 text-body-md text-on-surface-variant">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        {t('loading')}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-body-md text-on-surface-variant">{t('instructions')}</p>
      <img src={info.qrUrl} alt={t('qrAlt')} width={240} height={240} className="mx-auto size-60 rounded-md border border-outline-variant bg-white" />
      <div>
        <CopyRow label={t('bank')} value={info.bankName} copyLabel={t('copy', { field: t('bank') })} />
        <CopyRow label={t('account')} value={info.bankAccount} copyLabel={t('copy', { field: t('account') })} />
        {info.accountHolder ? <CopyRow label={t('holder')} value={info.accountHolder} copyLabel={t('copy', { field: t('holder') })} /> : null}
        <CopyRow label={t('amount')} value={`${info.amount.toLocaleString('vi-VN')} ₫`} copyLabel={t('copy', { field: t('amount') })} />
        <CopyRow label={t('content')} value={info.transferContent} copyLabel={t('copy', { field: t('content') })} />
      </div>
      <p className="text-caption text-on-surface-variant">{t('contentWarning')}</p>
      {closed ? (
        <p role="alert" className="rounded-md bg-surface-container p-4 text-body-md text-on-surface">
          {t('closed', { code: info.paymentCode })}
        </p>
      ) : sessionLost ? (
        <p role="alert" className="rounded-md bg-surface-container p-4 text-body-md text-on-surface">
          {t('sessionLost', { code: info.paymentCode })}
        </p>
      ) : timedOut ? (
        <p role="alert" className="rounded-md bg-surface-container p-4 text-body-md text-on-surface">
          {t('timedOut', { code: info.paymentCode })}
        </p>
      ) : (
        <p role="status" className="flex items-center gap-2 text-body-md text-on-surface-variant">
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
          {t('waiting')}
        </p>
      )}
    </div>
  );
}
