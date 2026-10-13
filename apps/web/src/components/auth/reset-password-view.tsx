'use client';

import { CUSTOMER_PASSWORD_MIN_LENGTH } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { type FormEvent, useState } from 'react';
import { FormError } from '@/components/payment/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import { useCustomer } from './auth-provider';

/** Trang đích của link đặt lại mật khẩu: nhập mật khẩu mới, thành công thì mời đăng nhập lại. */
export function ResetPasswordView({ token }: { token: string }) {
  const t = useTranslations('Auth');
  const auth = useCustomer();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<'form' | 'done' | 'invalid' | 'error'>(token ? 'form' : 'invalid');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      await customerApi.resetPassword(token, password);
      setState('done');
    } catch (err) {
      setState(err instanceof ApiError && err.code === 'INVALID_TOKEN' ? 'invalid' : 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1 className="font-display text-headline-md text-on-surface">{t('resetPage.title')}</h1>
      {state === 'invalid' ? <FormError>{t('resetPage.invalid')}</FormError> : null}
      {state === 'error' ? <FormError>{t('errors.generic')}</FormError> : null}
      {state === 'done' ? (
        <>
          <p role="status" className="text-body-md text-on-surface">
            {t('resetPage.done')}
          </p>
          {auth ? <Button onClick={() => auth.openAuth('login')}>{t('login')}</Button> : null}
        </>
      ) : null}
      {state === 'form' || state === 'error' ? (
        <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1 text-body-md text-on-surface">
            {t('resetPage.newPassword')}
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              required
              minLength={CUSTOMER_PASSWORD_MIN_LENGTH}
            />
            <span className="text-caption text-on-surface-variant">{t('passwordHint')}</span>
          </label>
          <Button type="submit" disabled={busy}>
            {busy ? t('busy') : t('resetPage.submit')}
          </Button>
        </form>
      ) : null}
    </>
  );
}
