'use client';

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import {
  type CreateOrderRequest,
  formatUsd,
  orderEmailSchema,
  PURCHASABLE_FILE_TYPES,
  type PurchasableFileType,
  type Quote,
  quoteSchema,
} from '@piano-daily/shared';
import { CircleCheck, LoaderCircle, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { ApiError, capturePaypalOrder, createPaypalOrder, fetchQuote } from '@/lib/public-api';
import { paypalClientId } from '@/lib/public-env';
import { FormError } from './form-error';

type ErrorKey =
  | 'quote'
  | 'paymentsDisabled'
  | 'priceChanged'
  | 'declined'
  | 'network'
  | 'cancelled'
  | 'tooMany'
  | 'paypal'
  | 'captureUnknown'
  | 'generic';

function errorKeyOf(err: unknown): ErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'PRICE_CHANGED':
      return 'priceChanged';
    case 'PAYMENT_DECLINED':
      return 'declined';
    case 'PAYMENTS_DISABLED':
      return 'paymentsDisabled';
    case 'NETWORK_ERROR':
      return 'network';
    case 'TOO_MANY_REQUESTS':
      return 'tooMany';
    default:
      return 'generic';
  }
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function clientId(): string | null {
  try {
    return paypalClientId();
  } catch {
    return null;
  }
}

/**
 * Modal thanh toán (Story 3.6): báo giá `no-store` lấy lại khi mở, chọn file/Bundle, email, nút PayPal chính thức.
 * Giá chỉ để hiển thị: server tính lại và so với `expectedTotalCents`. Thành công thì chuyển tới trang tải.
 * Đóng modal (X/Esc/overlay) không huỷ Order PENDING; overlay, X và Esc bị chặn khi popup PayPal đang mở hoặc đang xử lý.
 * Component chỉ được mount khi modal mở, nên state được khởi tạo lại ở mỗi lần mở.
 */
export function PaymentModal({
  sheetId,
  title,
  initialType,
  onClose,
}: {
  sheetId: string;
  title: string;
  initialType: PurchasableFileType;
  onClose: () => void;
}) {
  const t = useTranslations('Payment');
  const locale = useLocale();
  const router = useRouter();
  const ids = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false); // chặn tạo đơn trùng ngay cả khi state chưa kịp cập nhật
  const reported = useRef(false); // lỗi đã được createOrder/onApprove ghi nhận, onError của SDK không ghi đè

  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PurchasableFileType[]>([initialType]);
  const [bundle, setBundle] = useState(false);
  const [email, setEmail] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [alreadyPurchased, setAlreadyPurchased] = useState(false); // thông báo trạng thái (không phải lỗi): link đã gửi lại
  const [busy, setBusy] = useState(false); // đã bấm PayPal: popup mở hoặc đang capture
  const [popupOpen, setPopupOpen] = useState(false);

  const id = clientId();

  /** Áp báo giá mới: bỏ lựa chọn không còn bán, giữ nguyên phần còn lại. */
  const applyQuote = useCallback((next: Quote) => {
    setQuote(next);
    setSelected((prev) => prev.filter((type) => next.items.some((item) => item.fileType === type)));
    setBundle((prev) => prev && next.bundle !== null);
  }, []);

  const load = useCallback(() => {
    const controller = new AbortController();
    setLoading(true);
    setErrorKey(null);
    fetchQuote(sheetId, controller.signal)
      .then((next) => {
        applyQuote(next);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setErrorKey('quote');
        setLoading(false);
      });
    return () => controller.abort();
  }, [sheetId, applyQuote]);

  useEffect(() => load(), [load]);

  // Focus vào modal khi mở; khoá cuộn nền.
  useEffect(() => {
    headingRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const closable = !busy && !popupOpen;
  const requestClose = () => {
    if (closable) onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      requestClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0]!;
    const last = nodes[nodes.length - 1]!;
    if (event.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const emailOk = orderEmailSchema.safeParse(email).success;
  const total = useMemo(() => {
    if (!quote) return 0;
    if (bundle && quote.bundle) return quote.bundle.priceCents;
    return quote.items.filter((item) => selected.includes(item.fileType)).reduce((sum, item) => sum + item.priceCents, 0);
  }, [quote, bundle, selected]);

  const payable = quote !== null && quote.paymentsEnabled && !loading && total > 0 && emailOk && id !== null;
  const noItems = quote !== null && quote.items.length === 0;
  const emailInvalid = emailTouched && email !== '' && !emailOk;

  const toggleType = (type: PurchasableFileType) => {
    setErrorKey(null);
    setAlreadyPurchased(false);
    setSelected((prev) => PURCHASABLE_FILE_TYPES.filter((x) => (x === type ? !prev.includes(x) : prev.includes(x))));
  };

  const release = () => {
    lock.current = false;
    reported.current = false;
    setBusy(false);
    setPopupOpen(false);
  };

  const fail = (err: unknown) => {
    reported.current = true;
    if (err instanceof ApiError && err.code === 'ALREADY_PURCHASED') {
      // Không phải lỗi: người mua đã có link tải còn hiệu lực và vừa được gửi lại qua email. Không điều hướng, không mở PayPal.
      setAlreadyPurchased(true);
      return;
    }
    if (err instanceof ApiError && err.code === 'PRICE_CHANGED') {
      const parsed = quoteSchema.safeParse(err.details);
      if (parsed.success) applyQuote(parsed.data);
      else void load(); // thiếu báo giá mới trong lỗi: tải lại để giá hiển thị khớp thông điệp
    }
    if (err instanceof ApiError && err.code === 'PAYMENTS_DISABLED') {
      setQuote((prev) => (prev ? { ...prev, paymentsEnabled: false } : prev));
    }
    setErrorKey(errorKeyOf(err));
  };

  const orderRequest = (): CreateOrderRequest => ({
    sheetId,
    email: email.trim(),
    expectedTotalCents: total,
    locale: locale === 'en' ? ('en' as const) : ('vi' as const),
    ...(bundle ? { bundle: true as const } : { fileTypes: PURCHASABLE_FILE_TYPES.filter((type) => selected.includes(type)) }),
  });

  return (
    <div
      className="payment-fade fixed inset-0 z-50 flex items-stretch bg-on-surface/40 md:items-center md:justify-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onKeyDown={onKeyDown}
        className="flex w-full flex-col gap-6 overflow-y-auto bg-surface-container-lowest p-6 md:max-h-full md:max-w-lg md:rounded-md md:shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="font-display text-headline-sm text-on-surface outline-none">
            {t('title', { format: t(`formats.${initialType}`) })}
          </h2>
          <button
            type="button"
            onClick={requestClose}
            disabled={!closable}
            aria-label={t('close')}
            className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-on-surface-variant disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        <p className="text-body-md text-on-surface-variant">
          <span className="sr-only">{t('sheetHeading')}: </span>
          <span className="font-semibold text-on-surface">{title}</span>
        </p>

        {loading ? (
          <p role="status" className="flex items-center gap-2 text-body-md text-on-surface-variant">
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
            {t('loadingQuote')}
          </p>
        ) : null}

        {alreadyPurchased ? (
          <p role="status" className="flex items-start gap-3 rounded-md bg-surface-container p-4 text-body-md text-on-surface">
            <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
            <span>{t('alreadyPurchased')}</span>
          </p>
        ) : null}

        {errorKey ? (
          <FormError
            action={
              errorKey === 'quote' ? (
                <button type="button" onClick={load} className="self-start rounded-sm font-semibold underline underline-offset-4">
                  {t('errors.retry')}
                </button>
              ) : undefined
            }
          >
            {t(`errors.${errorKey}`)}
          </FormError>
        ) : null}

        {quote && !loading ? (
          <>
            {noItems ? (
              <FormError>{t('errors.noItems')}</FormError>
            ) : (
              <fieldset className="flex flex-col gap-3" disabled={busy}>
                <legend className="mb-1 text-body-md font-semibold text-on-surface">{t('filesHeading')}</legend>
                {quote.items.map((item) => {
                  const inputId = `${ids}-${item.fileType}`;
                  return (
                    <label key={item.fileType} htmlFor={inputId} className="flex min-h-11 items-center gap-3 text-body-md">
                      <input
                        id={inputId}
                        type="checkbox"
                        className="size-5 accent-secondary"
                        checked={bundle || selected.includes(item.fileType)}
                        disabled={bundle}
                        onChange={() => toggleType(item.fileType)}
                      />
                      <span className="flex-1">
                        {t(`formats.${item.fileType}`)}
                        {bundle ? <span className="block text-caption text-on-surface-variant">{t('bundleIncluded')}</span> : null}
                      </span>
                      <span className="text-on-surface-variant">{t('price', { price: formatUsd(item.priceCents) })}</span>
                    </label>
                  );
                })}
                {quote.bundle ? (
                  <label htmlFor={`${ids}-bundle`} className="flex min-h-11 items-center gap-3 border-t border-outline-variant pt-3 text-body-md">
                    <input
                      id={`${ids}-bundle`}
                      type="checkbox"
                      className="size-5 accent-secondary"
                      checked={bundle}
                      onChange={(event) => {
                        setErrorKey(null);
                        setBundle(event.target.checked);
                      }}
                    />
                    <span className="flex-1">
                      {t('bundleLabel', { formats: quote.bundle.fileTypes.map((type) => t(`formats.${type}`)).join(', ') })}
                      <span className="block text-caption text-on-surface-variant">{t('bundleHint')}</span>
                    </span>
                    <span className="text-on-surface-variant">{t('price', { price: formatUsd(quote.bundle.priceCents) })}</span>
                  </label>
                ) : null}
              </fieldset>
            )}

            <div className="flex flex-col gap-2">
              <label htmlFor={`${ids}-email`} className="text-body-md font-semibold text-on-surface">
                {t('emailLabel')}
              </label>
              <input
                id={`${ids}-email`}
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                disabled={busy}
                aria-invalid={emailInvalid ? true : undefined}
                aria-describedby={`${ids}-email-hint`}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setAlreadyPurchased(false);
                }}
                onBlur={() => setEmailTouched(true)}
                className="min-h-11 rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-body-md"
              />
              <p id={`${ids}-email-hint`} className={`text-caption ${emailInvalid ? 'text-error' : 'text-on-surface-variant'}`}>
                {emailInvalid ? t('emailInvalid') : t('emailHint')}
              </p>
            </div>

            <p className="flex items-baseline justify-between border-t border-outline-variant pt-4 text-body-md">
              <span className="font-semibold text-on-surface">{t('total')}</span>
              <span className="font-display text-headline-sm text-primary">{t('price', { price: formatUsd(total) })}</span>
            </p>

            {!quote.paymentsEnabled ? (
              errorKey === 'paymentsDisabled' ? null : <FormError>{t('disabledNote')}</FormError>
            ) : id === null ? (
              <FormError>{t('errors.config')}</FormError>
            ) : (
              <div className="flex flex-col gap-3">
                {!payable && !busy ? <p className="text-caption text-on-surface-variant">{t('payPrompt')}</p> : null}
                {busy ? (
                  <p role="status" className="flex items-center gap-2 text-body-md text-on-surface-variant">
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    {t('processing')}
                  </p>
                ) : null}
                <div aria-busy={busy} className={busy ? 'pointer-events-none opacity-60' : undefined}>
                  <PayPalScriptProvider options={{ clientId: id, currency: 'USD', intent: 'capture', components: 'buttons' }}>
                    <PayPalButtons
                      disabled={!payable}
                      forceReRender={[total, bundle, selected, email, sheetId]}
                      onClick={(_data, actions) => {
                        if (lock.current) return actions.reject();
                        lock.current = true;
                        reported.current = false;
                        setErrorKey(null);
                        setAlreadyPurchased(false);
                        setBusy(true);
                        setPopupOpen(true);
                        return actions.resolve();
                      }}
                      createOrder={async () => {
                        try {
                          const created = await createPaypalOrder(orderRequest());
                          return created.paypalOrderId;
                        } catch (err) {
                          fail(err);
                          throw err;
                        }
                      }}
                      onApprove={async (data) => {
                        setPopupOpen(false);
                        try {
                          const captured = await capturePaypalOrder(data.orderID);
                          // Giữ trạng thái đang xử lý tới khi trang tải hiện ra, tránh bấm lần hai.
                          router.push(`/downloads/${encodeURIComponent(captured.token)}`);
                        } catch (err) {
                          if (err instanceof ApiError && err.code === 'PAYMENT_DECLINED') fail(err);
                          else {
                            // Người mua đã duyệt trên PayPal nhưng chưa biết capture có thành công không: không gợi ý thanh toán lại.
                            reported.current = true;
                            setErrorKey('captureUnknown');
                          }
                          release();
                        }
                      }}
                      onCancel={() => {
                        setErrorKey('cancelled');
                        release();
                      }}
                      onError={() => {
                        if (!reported.current) setErrorKey('paypal');
                        release();
                      }}
                    />
                  </PayPalScriptProvider>
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
