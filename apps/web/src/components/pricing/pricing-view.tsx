import { PAYWALL_REASONS, type PaywallReason, type PublicPlansResponse } from '@piano-daily/shared';
import { useLocale, useTranslations } from 'next-intl';
import { formatPlanPrice } from '@/lib/plan-format';
import { PlanChooseButton } from './plan-checkout';

export function paywallReason(value: string | string[] | undefined): PaywallReason | null {
  const first = Array.isArray(value) ? value[0] : value;
  return (PAYWALL_REASONS as readonly string[]).includes(first ?? '') ? (first as PaywallReason) : null;
}

/**
 * Trang giá (S2): các gói đang bật. Nút chọn gói chưa dùng được vì thanh toán gói (VietQR/PayPal) ở bước sau, nên chỉ
 * là nút vô hiệu kèm chú thích. `reason` (từ paywall) hiện một dòng giải thích vì sao khách được chuyển tới đây.
 */
export function PricingView({ data, reason }: { data: PublicPlansResponse; reason: PaywallReason | null }) {
  const t = useTranslations('Pricing');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  const available = data.subscriptionsEnabled && data.plans.length > 0;
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-headline-md text-primary">{t('title')}</h1>
        <p className="text-body-lg text-on-surface-variant">{t('intro')}</p>
        {reason && available ? (
          <p role="status" className="rounded-md bg-surface-container-low p-4 text-body-md text-on-surface">
            {t(`reason.${reason}`)}
          </p>
        ) : null}
      </header>

      {available ? (
        <>
          <ul className="grid gap-gutter md:grid-cols-2 lg:grid-cols-3">
            {data.plans.map((plan) => (
              <li
                key={plan.id}
                className="flex flex-col gap-4 rounded-md border border-outline-variant bg-surface-container-lowest p-6"
              >
                <h2 className="font-display text-headline-sm text-on-surface">{plan.name[locale]}</h2>
                <p className="text-headline-md text-primary">
                  {plan.priceVnd === 0 && plan.priceUsdCents === 0 ? t('free') : formatPlanPrice(plan, locale)}
                </p>
                {plan.description[locale] ? <p className="text-body-md text-on-surface-variant">{plan.description[locale]}</p> : null}
                <ul className="flex flex-col gap-1 text-body-md text-on-surface">
                  <li>{t('duration', { days: plan.durationDays })}</li>
                  <li>{plan.downloadQuota === null ? t('unlimited') : t('quota', { count: plan.downloadQuota })}</li>
                </ul>
                <PlanChooseButton plan={plan} vietqrEnabled={data.vietqrEnabled} />
              </li>
            ))}
          </ul>
          <p id="pricing-soon" className="text-body-md text-on-surface-variant">
            {t('paymentSoon')}
          </p>
        </>
      ) : (
        <p className="rounded-md bg-surface-container-low p-6 text-body-lg text-on-surface">{t('unavailable')}</p>
      )}
    </main>
  );
}
