'use client';

import type { Entitlement } from '@piano-daily/shared';
import { useLocale, useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/plan-format';
import { useCustomer } from './auth-provider';

/** Một dòng trạng thái quyền tải cạnh tên khách; không hiện khi chưa bật cưỡng chế hoặc chưa tải được. */
function EntitlementNote({ entitlement }: { entitlement: Entitlement | null }) {
  const t = useTranslations('Auth.entitlement');
  const locale = useLocale() === 'en' ? 'en' : 'vi';
  if (!entitlement?.subscriptionsEnabled) return null;
  let text: string;
  if (entitlement.subscription) {
    const { planName, endsAt, downloadsLeft } = entitlement.subscription;
    const until = formatDate(endsAt, locale);
    text =
      downloadsLeft === null
        ? t('planUnlimited', { plan: planName[locale], date: until })
        : t('planLeft', { plan: planName[locale], count: downloadsLeft, date: until });
  } else if (entitlement.trial.active && entitlement.trial.endsAt) {
    text = t('trial', { count: entitlement.trial.downloadsLeft, date: formatDate(entitlement.trial.endsAt, locale) });
  } else {
    text = t('none');
  }
  return (
    <span data-testid="entitlement" className="text-caption text-on-surface-variant">
      {text}
    </span>
  );
}

/** Nút Đăng nhập, hoặc tên khách + Đăng xuất. Không render gì ngoài `AuthProvider` hoặc khi đang khôi phục phiên. */
export function HeaderAuth({ className = '' }: { className?: string }) {
  const t = useTranslations('Auth');
  const auth = useCustomer();
  if (!auth || auth.status === 'loading') return null;
  if (auth.status === 'anonymous' || !auth.customer) {
    return (
      <Button variant="secondary" className={`whitespace-nowrap px-4 py-1.5 ${className}`.trim()} onClick={() => auth.openAuth('login')}>
        {t('login')}
      </Button>
    );
  }
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <span className="flex flex-col leading-tight">
        <span className="max-w-[10rem] truncate text-body-md text-on-surface" title={auth.customer.email}>
          {auth.customer.name}
        </span>
        <EntitlementNote entitlement={auth.entitlement} />
      </span>
      <Button variant="secondary" className="whitespace-nowrap px-4 py-1.5" onClick={() => void auth.logout()}>
        {t('logout')}
      </Button>
    </div>
  );
}
