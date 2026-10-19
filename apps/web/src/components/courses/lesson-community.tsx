'use client';

import type { MyComment, MyCommunity, PublicCommunity, PublicThread } from '@piano-daily/shared';
import { Star } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { ApiError, fetchCommunity } from '@/lib/public-api';

const button =
  'inline-flex min-h-11 items-center rounded-md border border-outline-variant px-4 py-2 text-body-md font-semibold text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-60';
const link = 'text-body-md font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-60';
const field =
  'w-full rounded-md border border-outline-variant bg-surface px-3 py-2 text-body-md text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

type Shown = { id: string; parentId: string | null; body: string; authorName: string; createdAt: string; edited: boolean };

/** Đánh giá sao + bình luận của bài (C4). Dữ liệu tải ở trình duyệt nên HTML công khai/cache không chứa nội dung người dùng. */
export function LessonCommunity({ lessonId }: { lessonId: string }) {
  const t = useTranslations('Courses');
  const locale = useLocale();
  const auth = useCustomer();
  const customerId = auth?.customer?.id ?? null;
  const getToken = auth?.getToken;
  const [pub, setPub] = useState<PublicCommunity | null>(null);
  const [mine, setMine] = useState<{ owner: string; lessonId: string; data: MyCommunity } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState(false);
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needPlan, setNeedPlan] = useState(false);
  /** Khoá (khách, bài) hiện tại: kết quả về muộn sau khi đổi khách/bài thì bỏ qua. */
  const current = useRef('');
  current.current = `${customerId ?? ''}:${lessonId}`;

  const loadPublic = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await fetchCommunity(lessonId, null, signal);
        if (!signal?.aborted) {
          setPub(data);
          setLoadError(false);
        }
      } catch {
        if (!signal?.aborted) setLoadError(true);
      }
    },
    [lessonId],
  );
  const loadMine = useCallback(async () => {
    if (!customerId || !getToken) return;
    const key = `${customerId}:${lessonId}`;
    try {
      const token = await getToken();
      if (!token) return;
      const data = await customerApi.myCommunity(token, lessonId);
      if (current.current === key) setMine({ owner: customerId, lessonId, data });
    } catch {
      /* khối "của tôi" lỗi thì chỉ mất nút sửa/xoá; phần công khai vẫn dùng được */
    }
  }, [customerId, getToken, lessonId]);

  useEffect(() => {
    setPub(null);
    setLoadError(false);
    setMoreError(false);
    const controller = new AbortController();
    void loadPublic(controller.signal);
    return () => controller.abort();
  }, [loadPublic]);
  useEffect(() => {
    setMine(null);
    setDraft('');
    setReplyTo(null);
    setEditing(null);
    setError(null);
    void loadMine();
  }, [loadMine]);

  const fail = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 429) setError(t('communityTooMany'));
      else if (err instanceof ApiError && err.status === 402) {
        setError(t('planRequired'));
        setNeedPlan(true);
      }
      else if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') setError(t('communityVerifyEmail'));
      else if (err instanceof ApiError && err.status === 409) setError(t('communityDuplicate'));
      else if (err instanceof ApiError && err.status === 400) setError(t('communityInvalid'));
      else if (err instanceof ApiError && (err.status === 404 || err.status === 401)) setError(t('communityUnavailable'));
      else setError(t('communityError'));
    },
    [t],
  );

  if (!auth || auth.status === 'loading') return null;
  const key = `${customerId ?? ''}:${lessonId}`;
  const own = mine && mine.owner === customerId && mine.lessonId === lessonId ? mine.data : null;
  const ownIds = new Set(own?.comments.map((c) => c.id));

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
  const refresh = async () => {
    await Promise.all([loadPublic(), loadMine()]);
  };
  const rate = (stars: number) =>
    void run(async (token) => {
      const res = await customerApi.setRating(token, lessonId, stars);
      if (current.current !== key) return;
      setPub((p) => (p ? { ...p, rating: res.rating } : p));
      setMine((m) => (m ? { ...m, data: { ...m.data, myRating: res.myRating } } : m));
    });
  const unrate = () =>
    void run(async (token) => {
      const res = await customerApi.removeRating(token, lessonId);
      if (current.current !== key) return;
      setPub((p) => (p ? { ...p, rating: res.rating } : p));
      setMine((m) => (m ? { ...m, data: { ...m.data, myRating: null } } : m));
    });
  const send = (e: FormEvent, parentId: string | null) => {
    e.preventDefault();
    const text = parentId ? replyDraft : draft;
    void run(async (token) => {
      await customerApi.createComment(token, lessonId, { body: text, parentId });
      if (current.current !== key) return;
      if (parentId) {
        setReplyTo(null);
        setReplyDraft('');
      } else setDraft('');
      await refresh();
    });
  };
  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const { id, text } = editing;
    void run(async (token) => {
      await customerApi.editComment(token, id, text);
      if (current.current !== key) return;
      setEditing(null);
      await refresh();
    });
  };
  const remove = (id: string) => {
    if (!window.confirm(t('communityDeleteConfirm'))) return;
    void run(async (token) => {
      await customerApi.deleteComment(token, id);
      if (current.current !== key) return;
      await refresh();
    });
  };
  const more = async () => {
    if (!pub?.nextCursor) return;
    const cursor = pub.nextCursor;
    setMoreBusy(true);
    setMoreError(false);
    try {
      const next = await fetchCommunity(lessonId, cursor);
      // Kết quả về muộn sau khi đổi bài, hoặc danh sách đã tải lại từ trang đầu: bỏ qua.
      if (current.current !== key) return;
      setPub((p) => (p && p.nextCursor === cursor ? { ...next, comments: [...p.comments, ...next.comments] } : p));
    } catch {
      if (current.current === key) setMoreError(true);
    } finally {
      if (current.current === key) setMoreBusy(false);
    }
  };

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale);
  const textArea = (value: string, onChange: (v: string) => void, label: string) => (
    <label className="flex flex-col gap-1 text-body-md text-on-surface">
      {label}
      <textarea required maxLength={1000} rows={3} value={value} onChange={(e) => onChange(e.target.value)} className={field} />
    </label>
  );

  const item = (c: Shown, canReply: boolean) => {
    const mineHere = ownIds.has(c.id);
    return (
      <li key={c.id} className="flex flex-col gap-1">
        <p className="text-caption text-on-surface-variant">
          <span className="font-semibold text-on-surface">{c.authorName}</span> · {date(c.createdAt)}
          {c.edited ? ` · ${t('communityEdited')}` : ''}
        </p>
        {editing?.id === c.id ? (
          <form onSubmit={save} className="flex flex-col gap-2">
            {textArea(editing.text, (text) => setEditing({ id: c.id, text }), t('communityCommentLabel'))}
            <div className="flex flex-wrap gap-3">
              <button type="submit" className={button} disabled={busy}>
                {t('communitySave')}
              </button>
              <button type="button" className={button} disabled={busy} onClick={() => setEditing(null)}>
                {t('communityCancel')}
              </button>
            </div>
          </form>
        ) : (
          <p className="whitespace-pre-wrap break-words text-body-md text-on-surface">{c.body}</p>
        )}
        {customerId && editing?.id !== c.id ? (
          <div className="flex flex-wrap gap-4">
            {canReply ? (
              <button type="button" className={link} disabled={busy} onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft(''); }}>
                {t('communityReply')}
              </button>
            ) : null}
            {mineHere ? (
              <>
                <button type="button" className={link} disabled={busy} onClick={() => setEditing({ id: c.id, text: c.body })}>
                  {t('communityEdit')}
                </button>
                <button type="button" className={link} disabled={busy} onClick={() => remove(c.id)}>
                  {t('communityDelete')}
                </button>
              </>
            ) : null}
          </div>
        ) : null}
        {replyTo === c.id ? (
          <form onSubmit={(e) => send(e, c.id)} className="flex flex-col gap-2">
            {textArea(replyDraft, setReplyDraft, t('communityReplyLabel'))}
            <button type="submit" className={`${button} self-start`} disabled={busy}>
              {t('communityPost')}
            </button>
          </form>
        ) : null}
      </li>
    );
  };
  const thread = (c: PublicThread) => (
    <div key={c.id} className="flex flex-col gap-3 border-b border-outline-variant pb-4">
      <ul className="flex flex-col gap-3">{item(c, true)}</ul>
      {c.replies.length > 0 ? (
        <ul className="ml-4 flex flex-col gap-3 border-l border-outline-variant pl-4">{c.replies.map((r) => item(r, false))}</ul>
      ) : null}
    </div>
  );
  const hiddenMine = own?.comments.filter((c: MyComment) => c.isHidden) ?? [];

  return (
    <section aria-label={t('communityTitle')} className="flex flex-col gap-4">
      <h2 className="font-display text-headline-sm text-on-surface">{t('communityTitle')}</h2>
      {loadError ? (
        <p role="alert" className="text-body-md text-error">
          {t('communityLoadError')}
        </p>
      ) : null}
      {pub ? (
        <p className="text-body-md text-on-surface-variant">
          {pub.rating.count > 0 && pub.rating.average !== null
            ? t('communitySummary', { average: pub.rating.average.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }), count: pub.rating.count })
            : t('communityNoRating')}
        </p>
      ) : null}

      {customerId ? (
        <div role="group" aria-label={t('communityYourRating')} className="flex flex-wrap items-center gap-1">
          <span className="mr-2 text-body-md text-on-surface">{t('communityYourRating')}</span>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={t('communityStar', { n })}
              aria-pressed={(own?.myRating ?? 0) >= n}
              disabled={busy}
              onClick={() => rate(n)}
              className="inline-flex size-11 items-center justify-center rounded-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary disabled:opacity-60"
            >
              <Star aria-hidden="true" className={`size-6 ${(own?.myRating ?? 0) >= n ? 'fill-secondary text-secondary' : 'text-outline'}`} />
            </button>
          ))}
          {own?.myRating ? (
            <button type="button" className={`${link} ml-2`} disabled={busy} onClick={unrate}>
              {t('communityRemoveRating')}
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" className={`${button} self-start`} onClick={() => auth.openAuth('login')}>
          {t('communityLoginToRate')}
        </button>
      )}

      {customerId ? (
        <form onSubmit={(e) => send(e, null)} className="flex max-w-xl flex-col gap-2">
          {textArea(draft, setDraft, t('communityCommentLabel'))}
          <button type="submit" className={`${button} self-start`} disabled={busy}>
            {t('communityPost')}
          </button>
        </form>
      ) : (
        <button type="button" className={`${button} self-start`} onClick={() => auth.openAuth('login')}>
          {t('communityLoginToComment')}
        </button>
      )}
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

      {hiddenMine.length > 0 ? (
        <div className="flex flex-col gap-2 rounded-md border border-outline-variant p-3">
          <p className="text-body-md font-semibold text-error">{t('communityYourHidden')}</p>
          <p className="text-caption text-on-surface-variant">{t('communityHidden')}</p>
          <ul className="flex flex-col gap-3">{hiddenMine.map((c) => item(c, false))}</ul>
        </div>
      ) : null}

      {pub && pub.comments.length === 0 && !loadError ? <p className="text-body-md text-on-surface-variant">{t('communityEmpty')}</p> : null}
      {pub ? pub.comments.map(thread) : null}
      {pub?.nextCursor ? (
        <button type="button" className={`${button} self-start`} disabled={moreBusy} onClick={() => void more()}>
          {t('communityMore')}
        </button>
      ) : null}
      {moreError ? (
        <p role="alert" className="text-body-md text-error">
          {t('communityLoadError')}
        </p>
      ) : null}
    </section>
  );
}
