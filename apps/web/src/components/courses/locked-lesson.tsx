'use client';

import type { LessonFull } from '@piano-daily/shared';
import { Lock } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { buttonClasses } from '@/components/ui/button';
import { calloutCardClass } from '@/components/sheet/download-button-class';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import { paymentsEnabled } from '@/lib/public-env';
import { LessonBody } from './lesson-body';

const secondaryButton = buttonClasses({ variant: 'secondary', className: 'min-h-11' });
const primaryButton = buttonClasses({ className: 'min-h-11' });

type State =
  | { kind: 'loading' }
  | { kind: 'ok'; owner: string; full: LessonFull }
  | { kind: 'plan' | 'login' | 'error'; owner: string };

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
        // 401 (phiên hết hạn) → mời đăng nhập lại; 402 → mời đăng ký gói; còn lại → lỗi tải.
        const kind = err instanceof ApiError && err.status === 402 ? 'plan' : err instanceof ApiError && err.status === 401 ? 'login' : 'error';
        setState({ kind, owner: customerId });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, getToken, lessonId, locale]);

  if (!auth || auth.status === 'loading') return null;
  // Kết quả của khách trước (chưa kịp reset) coi như đang tải, không hiện nhầm cho khách mới.
  const current = state.kind !== 'loading' && state.owner === customerId ? state : null;
  if (customerId && current?.kind === 'ok') return <LessonBody title={title} full={current.full} />;
  if (customerId && !current) return <p className="text-body-md text-on-surface-variant">{t('lockedLoading')}</p>;
  const needLogin = !customerId || current?.kind === 'login';
  const needPlan = (!customerId || current?.kind === 'plan') && paymentsEnabled();

  return (
    <section aria-labelledby="lesson-locked" className={`${calloutCardClass} items-start`}>
      <h2 id="lesson-locked" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
        <Lock aria-hidden="true" className="size-5" />
        {t('lockedTitle')}
      </h2>
      {customerId && current?.kind === 'error' ? (
        <p role="alert" className="text-body-md text-error">
          {t('lockedError')}
        </p>
      ) : (
        <p className="text-body-md text-on-surface-variant">{customerId && current?.kind === 'plan' ? t('lockedNeedPlan') : t('lockedBody')}</p>
      )}
      {needLogin ? (
        <button type="button" className={primaryButton} onClick={() => auth.openAuth('login')}>
          {t('lockedLogin')}
        </button>
      ) : null}
      {needPlan ? (
        <Link href="/pricing" className={secondaryButton}>
          {t('lockedPricing')}
        </Link>
      ) : null}
    </section>
  );
}
