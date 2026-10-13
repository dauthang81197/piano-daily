'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { useCustomer } from './auth-provider';

/** Nút Đăng nhập, hoặc tên khách + Đăng xuất. Không render gì ngoài `AuthProvider` hoặc khi đang khôi phục phiên. */
export function HeaderAuth({ className = '' }: { className?: string }) {
  const t = useTranslations('Auth');
  const auth = useCustomer();
  if (!auth || auth.status === 'loading') return null;
  if (auth.status === 'anonymous' || !auth.customer) {
    return (
      <Button variant="secondary" className={`px-4 py-1.5 ${className}`.trim()} onClick={() => auth.openAuth('login')}>
        {t('login')}
      </Button>
    );
  }
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <span className="max-w-[10rem] truncate text-body-md text-on-surface" title={auth.customer.email}>
        {auth.customer.name}
      </span>
      <Button variant="secondary" className="px-4 py-1.5" onClick={() => void auth.logout()}>
        {t('logout')}
      </Button>
    </div>
  );
}
