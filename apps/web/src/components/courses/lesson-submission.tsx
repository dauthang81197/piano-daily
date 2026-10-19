'use client';

import { useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import type { MySubmission } from '@piano-daily/shared';

const button =
  'inline-flex min-h-11 items-center rounded-md border border-outline-variant px-4 py-2 text-body-md font-semibold text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-60';
const link = 'text-body-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';
const field =
  'min-h-11 w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

type Load = { owner: string; lessonId: string; submission: MySubmission | null } | 'error' | null;

/** Nộp bài tập bằng link YouTube/Drive (C3). Dữ liệu theo người dùng nên lấy ở trình duyệt, không nằm trong HTML cache. */
export function LessonSubmission({ lessonId }: { lessonId: string }) {
  const t = useTranslations('Courses');
  const auth = useCustomer();
  const customerId = auth?.customer?.id ?? null;
  const getToken = auth?.getToken;
  const [load, setLoad] = useState<Load>(null);
  const [editing, setEditing] = useState(false);
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPlan, setNeedPlan] = useState(false);
  /** Khoá (khách, bài) hiện tại: kết quả lưu/xoá về muộn sau khi đổi khách hoặc bài thì bỏ qua. */
  const current = useRef('');
  current.current = `${customerId ?? ''}:${lessonId}`;

  useEffect(() => {
    setLoad(null);
    setEditing(false);
    setError(null);
    setUrl('');
    setNote('');
    if (!customerId || !getToken) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error('no token');
        const res = await customerApi.lessonSubmission(token, lessonId);
        if (!cancelled) setLoad({ owner: customerId, lessonId, submission: res.submission });
      } catch {
        if (!cancelled) setLoad('error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, getToken, lessonId]);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 429) setError(t('submissionTooMany'));
      else if (err instanceof ApiError && err.status === 402) {
        setError(t('planRequired'));
        setNeedPlan(true);
      }
      else if (err instanceof ApiError && (err.status === 404 || err.status === 401)) setError(t('submissionUnavailable'));
      else if (err instanceof ApiError && err.status === 400) {
        const first = Array.isArray(err.details) ? (err.details[0] as { path?: string } | undefined) : undefined;
        setError(first?.path === 'note' ? t('submissionInvalidNote') : t('submissionInvalidUrl'));
      } else setError(t('submissionError'));
    },
    [t],
  );

  if (!auth || auth.status === 'loading') return null;
  const title = (
    <h2 className="font-display text-headline-sm text-on-surface">{t('submissionTitle')}</h2>
  );
  if (!customerId) {
    return (
      <section aria-label={t('submissionTitle')} className="flex flex-col items-start gap-3">
        {title}
        <button type="button" className={button} onClick={() => auth.openAuth('login')}>
          {t('submissionLogin')}
        </button>
      </section>
    );
  }
  if (load === 'error') {
    return (
      <section aria-label={t('submissionTitle')} className="flex flex-col gap-3">
        {title}
        <p role="alert" className="text-body-md text-error">
          {t('submissionLoadError')}
        </p>
      </section>
    );
  }
  if (!load || load.owner !== customerId || load.lessonId !== lessonId) return null;

  const submission = load.submission;
  const showForm = !submission || editing;

  const key = `${customerId}:${lessonId}`;
  const run = async (action: (token: string) => Promise<void>) => {
    setBusy(true);
    setError(null);
    setNeedPlan(false);
    try {
      const token = await getToken?.();
      if (!token) throw new Error('no token');
      await action(token);
    } catch (err) {
      if (current.current === key) fail(err);
    } finally {
      if (current.current === key) setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run(async (token) => {
      const res = await customerApi.saveSubmission(token, lessonId, { url: url.trim(), note: note.trim() || null });
      if (current.current !== key) return;
      setLoad({ owner: customerId, lessonId, submission: res.submission });
      setEditing(false);
    });
  };
  const startEdit = () => {
    setUrl(submission?.url ?? '');
    setNote(submission?.note ?? '');
    setError(null);
    setEditing(true);
  };
  const remove = () => {
    if (!window.confirm(t('submissionDeleteConfirm'))) return;
    void run(async (token) => {
      await customerApi.deleteSubmission(token, lessonId);
      if (current.current !== key) return;
      setLoad({ owner: customerId, lessonId, submission: null });
      setEditing(false);
      setUrl('');
      setNote('');
    });
  };

  return (
    <section aria-label={t('submissionTitle')} className="flex flex-col items-start gap-3">
      {title}
      {submission && !editing ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-body-md text-on-surface-variant">{t('submissionSent')}</p>
          <a href={submission.url} target="_blank" rel="noopener noreferrer" className="break-all text-body-md font-semibold text-primary underline">
            {t('submissionOpen')}
          </a>
          {submission.note ? <p className="whitespace-pre-wrap text-body-md text-on-surface">{submission.note}</p> : null}
          {submission.isHidden ? <p className="text-body-md text-error">{t('submissionHidden')}</p> : null}
          <div className="flex flex-wrap gap-3">
            <button type="button" className={button} disabled={busy} onClick={startEdit}>
              {t('submissionEdit')}
            </button>
            <button type="button" className={button} disabled={busy} onClick={remove}>
              {t('submissionDelete')}
            </button>
          </div>
        </div>
      ) : null}
      {showForm ? (
        <form onSubmit={submit} className="flex w-full max-w-xl flex-col gap-3">
          <p className="text-body-md text-on-surface-variant">{t('submissionHint')}</p>
          <label className="flex flex-col gap-1 text-body-md text-on-surface">
            {t('submissionUrl')}
            <input type="text" inputMode="url" autoComplete="off" required maxLength={2048} value={url} onChange={(e) => setUrl(e.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-1 text-body-md text-on-surface">
            {t('submissionNote')}
            <textarea maxLength={500} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className={field} />
          </label>
          <div className="flex flex-wrap gap-3">
            <button type="submit" className={button} disabled={busy}>
              {submission ? t('submissionSave') : t('submissionSubmit')}
            </button>
            {submission ? (
              <button type="button" className={button} disabled={busy} onClick={() => setEditing(false)}>
                {t('submissionCancel')}
              </button>
            ) : null}
          </div>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      ) : null}
      {needPlan ? (
        <Link href="/pricing" className={link}>
          {t('lockedPricing')}
        </Link>
      ) : null}
    </section>
  );
}
