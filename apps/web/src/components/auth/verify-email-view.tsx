'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { FormError } from '@/components/payment/form-error';
import { Button } from '@/components/ui/button';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import { useCustomer } from './auth-provider';

/** Trang đích của link xác minh email: tự gọi API một lần khi mở, rồi mời đăng nhập. */
export function VerifyEmailView({ token }: { token: string }) {
  const t = useTranslations('Auth');
  const auth = useCustomer();
  const [state, setState] = useState<'working' | 'done' | 'invalid' | 'error'>(token ? 'working' : 'invalid');

  // Token dùng một lần: chỉ gọi API đúng một lần cho mỗi token (React Strict Mode chạy effect hai lần ở dev).
  const started = useRef<string | null>(null);

  useEffect(() => {
    if (!token || started.current === token) return;
    started.current = token;
    customerApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch((err: unknown) => setState(err instanceof ApiError && err.code === 'INVALID_TOKEN' ? 'invalid' : 'error'));
  }, [token]);

  return (
    <>
      <h1 className="font-display text-headline-md text-on-surface">{t('verifyPage.title')}</h1>
      {state === 'working' ? <p role="status">{t('verifyPage.working')}</p> : null}
      {state === 'done' ? (
        <>
          <p role="status" className="text-body-md text-on-surface">
            {t('verifyPage.done')}
          </p>
          {auth ? <Button onClick={() => auth.openAuth('login')}>{t('login')}</Button> : null}
        </>
      ) : null}
      {state === 'invalid' ? <FormError>{t('verifyPage.invalid')}</FormError> : null}
      {state === 'error' ? <FormError>{t('errors.generic')}</FormError> : null}
    </>
  );
}
