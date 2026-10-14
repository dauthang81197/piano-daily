'use client';

import { PayPalButtons, PayPalScriptProvider } from '@paypal/react-paypal-js';
import { formatUsd, type PublicPlan } from '@piano-daily/shared';
import { CircleCheck, LoaderCircle, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { FormError } from '@/components/payment/form-error';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { formatPlanPrice } from '@/lib/plan-format';
import { VietqrPanel } from './vietqr-panel';
import { ApiError } from '@/lib/public-api';
import { paypalClientId } from '@/lib/public-env';

type ErrorKey = 'paymentsDisabled' | 'declined' | 'network' | 'tooMany' | 'cancelled' | 'captureUnknown' | 'verify' | 'generic';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function errorKeyOf(err: unknown): ErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  switch (err.code) {
    case 'PAYMENTS_DISABLED':
      return 'paymentsDisabled';
    case 'PAYMENT_DECLINED':
      return 'declined';
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

function clientId(): string | null {
  try {
    return paypalClientId();
  } catch {
    return null;
  }
}

/**
 * Nút "Chọn gói" (S3): chưa đăng nhập thì mở modal đăng nhập và nhớ gói, đăng nhập xong tự mở modal thanh toán gói đó.
 * Không có `NEXT_PUBLIC_PAYPAL_CLIENT_ID` thì nút bị vô hiệu (không có cách thanh toán).
 */
export function PlanChooseButton({ plan, vietqrEnabled = false }: { plan: PublicPlan; vietqrEnabled?: boolean }) {
  const t = useTranslations('Pricing');
  const auth = useCustomer();
  const [open, setOpen] = useState(false);
  const wantsCheckout = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const configured = clientId() !== null;
  const status = auth?.status;

  // Đăng nhập xong (modal đăng nhập đóng) thì quay lại mua đúng gói đã chọn.
  useEffect(() => {
    if (status === 'authenticated' && wantsCheckout.current) {
      wantsCheckout.current = false;
      setOpen(true);
    }
  }, [status]);

  const onClick = () => {
    if (!auth || auth.status === 'loading') return;
    if (auth.status === 'anonymous') {
      wantsCheckout.current = true;
      auth.openAuth('login');
      return;
    }
    setOpen(true);
  };

  const close = useCallback(() => {
    setOpen(false);
    queueMicrotask(() => trigger.current?.focus());
  }, []);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        onClick={onClick}
        disabled={!configured || !auth || plan.priceUsdCents <= 0}
        aria-describedby="pricing-soon"
        className="mt-auto inline-flex min-h-11 items-center justify-center rounded-md bg-secondary px-6 py-2 text-body-md font-semibold text-on-secondary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-50"
      >
        {configured ? t('choose') : t('checkout.comingSoon')}
      </button>
      {open ? <PlanCheckoutModal plan={plan} vietqrEnabled={vietqrEnabled} onClose={close} /> : null}
    </>
  );
}

function PlanCheckoutModal({ plan, vietqrEnabled, onClose }: { plan: PublicPlan; vietqrEnabled: boolean; onClose: () => void }) {
  const t = useTranslations('Pricing.checkout');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const auth = useCustomer();
  const ids = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const lock = useRef(false);
  const reported = useRef(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [method, setMethod] = useState<'paypal' | 'vietqr'>('paypal');
  const canVietqr = vietqrEnabled && plan.priceVnd > 0;
  /** Đã duyệt trên PayPal nhưng chưa xác nhận được capture: khoá nút để không tạo và trả tiền đơn thứ hai. */
  const [captureUnknown, setCaptureUnknown] = useState(false);
  const id = clientId();
  const name = plan.name[locale];
  const closable = !busy && !popupOpen;
  const showVietqr = method === 'vietqr' && locale === 'vi' && canVietqr;

  useEffect(() => {
    headingRef.current?.focus();
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const release = () => {
    lock.current = false;
    reported.current = false;
    setBusy(false);
    setPopupOpen(false);
  };
  const fail = (err: unknown) => {
    reported.current = true;
    setErrorKey(errorKeyOf(err));
  };

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (closable) onClose();
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

  return (
    <div
      className="payment-fade fixed inset-0 z-50 flex items-stretch bg-on-surface/40 md:items-center md:justify-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && closable) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onKeyDown={onKeyDown}
        className="flex w-full flex-col gap-5 overflow-y-auto bg-surface-container-lowest p-6 md:max-h-full md:max-w-md md:rounded-md md:shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="font-display text-headline-sm text-on-surface outline-none">
            {t('title', { plan: name })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={!closable}
            aria-label={t('close')}
            className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-on-surface-variant disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {done ? (
          <div className="flex flex-col gap-4">
            <p role="status" className="flex items-start gap-3 rounded-md bg-surface-container p-4 text-body-md text-on-surface">
              <CircleCheck aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
              <span>
                {t('success')}
                <span className="block text-on-surface-variant">{t('successHint')}</span>
              </span>
            </p>
            <Link href="/" onClick={onClose} className="self-start rounded-md text-body-md font-semibold text-primary underline underline-offset-4">
              {t('browse')}
            </Link>
          </div>
        ) : (
          <>
            <p className="flex items-baseline justify-between border-b border-outline-variant pb-3 text-body-md">
              <span className="text-on-surface">{t('summary', { plan: name, days: plan.durationDays })}</span>
              <span className="font-display text-headline-sm text-primary">{formatPlanPrice(plan, locale)}</span>
            </p>

            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1 text-body-md font-semibold text-on-surface">{t('method')}</legend>
              <label className="flex min-h-11 items-center gap-3 text-body-md">
                <input
                  type="radio"
                  name={`${ids}-method`}
                  checked={!showVietqr}
                  disabled={busy}
                  onChange={() => setMethod('paypal')}
                  className="size-5 accent-secondary"
                />
                {t('paypal')}
              </label>
              {locale === 'vi' ? (
                <label className={`flex min-h-11 items-center gap-3 text-body-md ${canVietqr ? '' : 'text-on-surface-variant'}`}>
                  <input
                    type="radio"
                    name={`${ids}-method`}
                    checked={showVietqr}
                    disabled={!canVietqr || busy}
                    onChange={() => setMethod('vietqr')}
                    className="size-5 accent-secondary"
                  />
                  {canVietqr ? t('vietqrLabel') : t('vietqr')}
                </label>
              ) : null}
            </fieldset>
            {locale === 'vi' && !showVietqr ? (
              <p className="text-caption text-on-surface-variant">
                {t('usdNote', { usd: `$${formatUsd(plan.priceUsdCents)}`, price: formatPlanPrice(plan, 'vi') })}
              </p>
            ) : null}

            {showVietqr ? (
              <VietqrPanel
                planId={plan.id}
                onPaid={(entitlement) => {
                  auth?.applyEntitlement(entitlement);
                  setDone(true);
                }}
              />
            ) : null}

            {errorKey && !showVietqr ? <FormError>{t(`errors.${errorKey}`)}</FormError> : null}

            {showVietqr ? null : captureUnknown ? null : id === null ? (
              <FormError>{t('config')}</FormError>
            ) : (
              <div className="flex flex-col gap-3">
                {busy ? (
                  <p role="status" className="flex items-center gap-2 text-body-md text-on-surface-variant">
                    <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
                    {t('processing')}
                  </p>
                ) : null}
                <div aria-busy={busy} className={busy ? 'pointer-events-none opacity-60' : undefined}>
                  <PayPalScriptProvider options={{ clientId: id, currency: 'USD', intent: 'capture', components: 'buttons' }}>
                    <PayPalButtons
                      forceReRender={[plan.id]}
                      onClick={(_data, actions) => {
                        if (lock.current) return actions.reject();
                        lock.current = true;
                        reported.current = false;
                        setErrorKey(null);
                        setBusy(true);
                        setPopupOpen(true);
                        return actions.resolve();
                      }}
                      createOrder={async () => {
                        try {
                          const token = await auth?.getToken();
                          if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Cần đăng nhập.');
                          return (await customerApi.createPlanOrder(token, plan.id)).paypalOrderId;
                        } catch (err) {
                          fail(err);
                          throw err;
                        }
                      }}
                      onApprove={async (data) => {
                        setPopupOpen(false);
                        try {
                          const token = await auth?.getToken();
                          if (!token) throw new ApiError(401, 'UNAUTHORIZED', 'Cần đăng nhập.');
                          auth?.applyEntitlement(await customerApi.capturePlanOrder(token, data.orderID));
                          setDone(true);
                          release();
                        } catch (err) {
                          if (err instanceof ApiError && err.code === 'PAYMENT_DECLINED') fail(err);
                          else {
                            // Người mua đã duyệt trên PayPal nhưng chưa biết capture có thành công không: không gợi ý thanh toán lại.
                            reported.current = true;
                            setErrorKey('captureUnknown');
                            setCaptureUnknown(true);
                          }
                          release();
                        }
                      }}
                      onCancel={() => {
                        setErrorKey('cancelled');
                        release();
                      }}
                      onError={() => {
                        if (!reported.current) setErrorKey('generic');
                        release();
                      }}
                    />
                  </PayPalScriptProvider>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
