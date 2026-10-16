'use client';

import type { LessonFull } from '@piano-daily/shared';
import { Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import { LessonBody } from './lesson-body';

const button =
  'inline-flex min-h-11 items-center rounded-md border border-outline-variant px-4 py-2 text-body-md font-semibold text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

type State = { kind: 'loading' } | { kind: 'ok'; owner: string; full: LessonFull } | { kind: 'plan' } | { kind: 'error' };

/**
 * Bài khoá theo thuê bao (C5). HTML công khai (cache dùng chung) không chứa nội dung; khách có gói tải bản đầy đủ ở trình duyệt,
 * người khác thấy lời mời đăng nhập/đăng ký gói.
 */
export function LockedLesson({ lessonId, title }: { lessonId: string; title: string }) {
  const t = useTranslations('Courses');
  const locale = useLocale();
  const auth = useCustomer();
  const customerId = auth?.customer?.id ?? null;
  const getToken = auth?.getToken;
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    setState({ kind: 'loading' });
    if (!customerId || !getToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('no token');
        const full = await customerApi.lessonFull(token, lessonId, locale);
        if (!cancelled) setState({ kind: 'ok', owner: customerId, full });
      } catch (err) {
        if (cancelled) return;
        setState(err instanceof ApiError && err.status === 402 ? { kind: 'plan' } : { kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, getToken, lessonId, locale]);

  if (!auth || auth.status === 'loading') return null;
  if (customerId && state.kind === 'ok' && state.owner === customerId) return <LessonBody title={title} full={state.full} />;
  if (customerId && state.kind === 'loading') return <p className="text-body-md text-on-surface-variant">{t('lockedLoading')}</p>;

  return (
    <section aria-labelledby="lesson-locked" className="flex flex-col items-start gap-3 rounded-md border border-outline-variant p-4">
      <h2 id="lesson-locked" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
        <Lock aria-hidden="true" className="size-5" />
        {t('lockedTitle')}
      </h2>
      {customerId && state.kind === 'error' ? (
        <p role="alert" className="text-body-md text-error">
          {t('lockedError')}
        </p>
      ) : (
        <p className="text-body-md text-on-surface-variant">{customerId ? t('lockedNeedPlan') : t('lockedBody')}</p>
      )}
      {!customerId ? (
        <button type="button" className={button} onClick={() => auth.openAuth('login')}>
          {t('lockedLogin')}
        </button>
      ) : null}
      {!customerId || state.kind === 'plan' ? (
        <Link href="/pricing" className={button}>
          {t('lockedPricing')}
        </Link>
      ) : null}
    </section>
  );
}
