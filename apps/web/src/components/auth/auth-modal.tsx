'use client';

import type { CustomerLocale, CustomerSession } from '@piano-daily/shared';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import { FormError } from '@/components/payment/form-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import { googleClientId } from '@/lib/public-env';
import { GoogleButton } from './google-button';

export type AuthTab = 'login' | 'register' | 'forgot' | 'verify';

type ErrorKey = 'invalidCredentials' | 'tooMany' | 'network' | 'googleUnavailable' | 'generic';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

function errorKeyOf(err: unknown): ErrorKey {
  if (!(err instanceof ApiError)) return 'generic';
  if (err.code === 'INVALID_CREDENTIALS' || (err.status === 401 && err.code === 'UNAUTHORIZED')) return 'invalidCredentials';
  if (err.code === 'TOO_MANY_REQUESTS') return 'tooMany';
  if (err.code === 'NETWORK_ERROR') return 'network';
  return 'generic';
}

/**
 * Modal đăng nhập / đăng ký / quên mật khẩu / nhắc xác minh email (S1 thuê bao). Focus bị giữ trong modal, Esc đóng,
 * mọi lỗi nêu lý do bằng chữ. Đăng ký và quên mật khẩu luôn báo "đã gửi email" dù email có tồn tại hay không.
 */
export function AuthModal({
  initialTab,
  locale,
  defaultEmail = '',
  onSession,
  onClose,
}: {
  initialTab: AuthTab;
  locale: CustomerLocale;
  defaultEmail?: string;
  onSession: (session: CustomerSession) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Auth');
  const ids = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [tab, setTab] = useState<AuthTab>(initialTab);
  const [email, setEmail] = useState(defaultEmail);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  /** Đã gửi email (đăng ký / quên mật khẩu / gửi lại xác minh): hiện thông báo thay cho form. */
  const [sent, setSent] = useState<'register' | 'forgot' | 'verify' | null>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    headingRef.current?.focus();
    return () => returnFocus.current?.focus();
  }, []);

  const switchTab = (next: AuthTab) => {
    setTab(next);
    setErrorKey(null);
    setSent(null);
  };

  const run = async (action: () => Promise<void>, google = false) => {
    setBusy(true);
    setErrorKey(null);
    try {
      await action();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
        switchTab('verify');
        return;
      }
      // 503 chỉ là "Google không dùng được" khi lỗi đến từ luồng Google.
      setErrorKey(google && err instanceof ApiError && err.code === 'SERVICE_UNAVAILABLE' ? 'googleUnavailable' : errorKeyOf(err));
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const address = email.trim();
    if (tab === 'login') {
      void run(async () => {
        onSession(await customerApi.login({ email: address, password }));
        onClose();
      });
    } else if (tab === 'register') {
      void run(async () => {
        await customerApi.register({ email: address, password, name: name.trim(), locale });
        setSent('register');
      });
    } else if (tab === 'forgot') {
      void run(async () => {
        await customerApi.forgotPassword({ email: address, locale });
        setSent('forgot');
      });
    } else {
      void run(async () => {
        await customerApi.resendVerification({ email: address, locale });
        setSent('verify');
      });
    }
  };

  const onGoogle = (idToken: string) =>
    void run(async () => {
      onSession(await customerApi.google(idToken, locale));
      onClose();
    }, true);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      if (!busy) onClose();
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

  const linkButton =
    'rounded-md text-body-md text-primary underline underline-offset-2 focus-visible:outline-2 ' +
    'focus-visible:outline-offset-2 focus-visible:outline-secondary';
  const showForm = sent === null;
  const showPassword = tab === 'login' || tab === 'register';

  return (
    <div
      className="payment-fade fixed inset-0 z-50 flex items-end bg-on-surface/40 md:items-center md:justify-center md:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${ids}-title`}
        onKeyDown={onKeyDown}
        className="motion-fade-up flex max-h-[90dvh] w-full flex-col gap-5 overflow-y-auto rounded-t-xl border border-outline-variant bg-surface-container-lowest p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-card-hover md:max-h-full md:max-w-md md:rounded-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={`${ids}-title`} ref={headingRef} tabIndex={-1} className="font-display text-headline-sm text-on-surface outline-none">
            {t(`title.${tab}`)}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label={t('close')}
            className="-m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md text-on-surface-variant disabled:opacity-50"
          >
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>

        {tab === 'login' || tab === 'register' ? <p className="text-body-md text-on-surface-variant">{t('downloadHint')}</p> : null}
        {tab === 'verify' && showForm ? <p className="text-body-md text-on-surface-variant">{t('verifyHint')}</p> : null}

        {errorKey ? <FormError>{t(`errors.${errorKey}`)}</FormError> : null}

        {sent ? (
          <p role="status" className="rounded-md bg-surface-container-low p-4 text-body-md text-on-surface">
            {t(`sent.${sent}`, { email: email.trim() })}
          </p>
        ) : (
          <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate={false}>
            {tab === 'register' ? (
              <label className="flex flex-col gap-1 text-body-md text-on-surface">
                {t('fields.name')}
                <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required maxLength={100} />
              </label>
            ) : null}
            <label className="flex flex-col gap-1 text-body-md text-on-surface">
              {t('fields.email')}
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
            </label>
            {showPassword ? (
              <label className="flex flex-col gap-1 text-body-md text-on-surface">
                {t('fields.password')}
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                  required
                  {...(tab === 'register' ? { minLength: 8 } : {})}
                />
                {tab === 'register' ? <span className="text-caption text-on-surface-variant">{t('passwordHint')}</span> : null}
              </label>
            ) : null}
            <Button type="submit" disabled={busy}>
              {busy ? t('busy') : t(`submit.${tab}`)}
            </Button>
          </form>
        )}

        {showForm && (tab === 'login' || tab === 'register') && googleClientId() ? (
          <div className="flex flex-col gap-3">
            <p className="text-center text-caption text-on-surface-variant">{t('or')}</p>
            <GoogleButton onCredential={onGoogle} onError={() => setErrorKey('googleUnavailable')} />
          </div>
        ) : null}

        <div className="flex flex-wrap justify-between gap-3">
          {tab === 'login' ? (
            <>
              <button type="button" className={linkButton} onClick={() => switchTab('register')}>
                {t('links.toRegister')}
              </button>
              <button type="button" className={linkButton} onClick={() => switchTab('forgot')}>
                {t('links.toForgot')}
              </button>
            </>
          ) : (
            <button type="button" className={linkButton} onClick={() => switchTab('login')}>
              {t('links.toLogin')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
