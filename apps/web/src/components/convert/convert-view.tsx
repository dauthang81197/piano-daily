'use client';

import { SCORE_ACCEPT, SCORE_TRANSPOSE_MAX, SCORE_TRANSPOSE_MIN } from '@piano-daily/shared';
import { FileMusic, Loader2, Lock, TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type FormEvent, useId, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { calloutCardClass } from '@/components/sheet/download-button-class';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ConvertResult } from './convert-result';
import { type ConvertError, useScoreJob } from './use-score-job';

/** Trần phía trình duyệt (bằng giới hạn cứng của máy chủ); giới hạn thật do API quyết định và báo lại bằng mã lỗi. */
const CLIENT_MAX_MB = 25;

const TRANSPOSES = Array.from({ length: SCORE_TRANSPOSE_MAX - SCORE_TRANSPOSE_MIN + 1 }, (_, i) => SCORE_TRANSPOSE_MAX - i);

function ErrorText({ error }: { error: ConvertError }) {
  const t = useTranslations('Convert.errors');
  switch (error.kind) {
    case 'daily-limit':
      return (
        <>
          {t('dailyLimit')}
          {error.retryAfterSeconds ? ` ${t('dailyLimitRetry', { hours: Math.max(1, Math.ceil(error.retryAfterSeconds / 3600)) })}` : ''}
        </>
      );
    case 'too-large':
      return <>{t('tooLarge', { max: CLIENT_MAX_MB })}</>;
    case 'unsupported':
      return <>{t('unsupported')}</>;
    case 'invalid':
      return <>{t('invalid')}</>;
    case 'disabled':
      return <>{t('disabled')}</>;
    case 'busy':
      return <>{t('busy')}</>;
    case 'unverified':
      return <>{t('unverified')}</>;
    case 'network':
      return <>{t('network')}</>;
    case 'timeout':
      return <>{t('timeout')}</>;
    default:
      return <>{t('generic')}</>;
  }
}

/** Công cụ chuyển bản nhạc sang MIDI (chỉ khách đăng nhập): form tải lên → theo dõi tiến trình → kết quả. */
export function ConvertView({ initialJobId }: { initialJobId: string | null }) {
  const t = useTranslations('Convert');
  const auth = useCustomer();
  const { state, start, reset, remove } = useScoreJob(initialJobId);
  const fileId = useId();
  const transposeId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [transpose, setTranspose] = useState(0);
  const [formError, setFormError] = useState<ConvertError | 'no-file' | null>(null);

  if (!auth || auth.status === 'loading') return <Skeleton className="h-64 w-full rounded-xl" />;

  if (auth.status === 'anonymous' || !auth.customer) {
    return (
      <section aria-labelledby="convert-login" className={`${calloutCardClass} items-start`}>
        <h2 id="convert-login" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
          <Lock aria-hidden="true" className="size-5" />
          {t('loginTitle')}
        </h2>
        <p className="text-body-md text-on-surface-variant">{t('loginBody')}</p>
        <Button onClick={() => auth.openAuth('login')}>{t('login')}</Button>
      </section>
    );
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!file) return setFormError('no-file');
    if (file.size > CLIENT_MAX_MB * 1024 * 1024) return setFormError({ kind: 'too-large' });
    setFormError(null);
    void start(file, transpose);
  };

  const another = () => {
    setFile(null);
    setFormError(null);
    if (fileRef.current) fileRef.current.value = '';
    reset();
  };

  if (state.phase === 'done') return <ConvertResult job={state.job} onAnother={another} onDelete={() => void remove().then(another)} />;

  if (state.phase === 'running' || state.phase === 'uploading') {
    return (
      <section aria-labelledby="convert-running" role="status" className={`${calloutCardClass} items-start`}>
        <h2 id="convert-running" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
          <Loader2 aria-hidden="true" className="size-5 animate-spin text-secondary" />
          {state.phase === 'uploading' ? t('uploading') : t('runningTitle')}
        </h2>
        {state.phase === 'running' ? <p className="text-body-md text-on-surface-variant">{t('runningHint')}</p> : null}
        {state.phase === 'running' && state.job.originalName ? <p className="text-caption text-on-surface-variant">{state.job.originalName}</p> : null}
        {state.phase === 'running' ? (
          <Button variant="ghost" onClick={() => void remove()}>
            {t('delete')}
          </Button>
        ) : null}
      </section>
    );
  }

  if (state.phase === 'failed' || state.phase === 'expired') {
    const unreadable = state.phase === 'failed' && state.job.error === 'SCORE_UNREADABLE';
    return (
      <section role="alert" className={`${calloutCardClass} items-start`}>
        <h2 className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
          <TriangleAlert aria-hidden="true" className="size-5 text-error" />
          {state.phase === 'expired' ? t('expiredTitle') : unreadable ? t('unreadableTitle') : t('unavailableTitle')}
        </h2>
        {state.phase === 'failed' ? <p className="text-body-md text-on-surface-variant">{unreadable ? t('unreadableBody') : t('unavailableBody')}</p> : null}
        <Button onClick={another}>{state.phase === 'expired' ? t('expiredAction') : t('retry')}</Button>
      </section>
    );
  }

  const error = state.phase === 'error' ? state.error : formError === 'no-file' ? null : formError;
  return (
    <Card className="p-5 md:p-8">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor={fileId} className="text-body-md font-semibold text-on-surface">
            {t('fileLabel')}
          </label>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-outline-variant bg-surface-container-low p-4">
            <FileMusic aria-hidden="true" className="size-8 shrink-0 text-secondary" />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="break-words text-body-md text-on-surface">{file ? file.name : t('noFile')}</span>
              <span className="text-caption text-on-surface-variant">{t('fileHint', { max: CLIENT_MAX_MB })}</span>
            </div>
            <Button variant="secondary" onClick={() => fileRef.current?.click()}>
              {t('choose')}
            </Button>
            <input
              ref={fileRef}
              id={fileId}
              type="file"
              accept={SCORE_ACCEPT}
              className="sr-only"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setFormError(null);
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label htmlFor={transposeId} className="text-body-md font-semibold text-on-surface">
            {t('transposeLabel')}
          </label>
          <select
            id={transposeId}
            value={transpose}
            onChange={(event) => setTranspose(Number(event.target.value))}
            className="min-h-11 w-full max-w-xs rounded-md border border-outline-variant bg-surface-bright px-3 py-2 text-body-md text-on-surface"
          >
            {TRANSPOSES.map((n) => (
              <option key={n} value={n}>
                {n === 0 ? t('transposeNone') : n > 0 ? t('transposeUp', { count: n }) : t('transposeDown', { count: -n })}
              </option>
            ))}
          </select>
        </div>

        <ul className="flex flex-col gap-1 text-caption text-on-surface-variant">
          <li>{t('noticeAccuracy')}</li>
          <li>{t('noticeRights')}</li>
        </ul>

        {formError === 'no-file' ? (
          <p role="alert" className="text-body-md text-error">
            {t('errors.noFile')}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-body-md text-error">
            <ErrorText error={error} />
          </p>
        ) : null}

        <div>
          <Button type="submit" size="lg">
            {t('submit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
