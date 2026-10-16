'use client';

import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';

export type LessonRef = { id: string; title: string };

type ProgressState = {
  signedIn: boolean;
  /** Đang khôi phục phiên đăng nhập: chưa biết là khách hay đã đăng nhập (không hiện lời mời đăng nhập lúc này). */
  authLoading: boolean;
  /** Đã tải xong tiến độ của khách đang đăng nhập (khách chưa đăng nhập luôn `true`). */
  ready: boolean;
  isDone: (lessonId: string) => boolean;
  doneIn: (ids: readonly string[]) => number;
  trackDone: (slug: string) => number;
  /** Đặt trạng thái; lạc quan, lỗi thì hoàn lại và trả `false`. */
  setDone: (trackSlug: string, lessonId: string, done: boolean) => Promise<boolean>;
  openLogin: () => void;
};

const ProgressContext = createContext<ProgressState | null>(null);

/** `null` ngoài provider (vd. test): các thành phần tiến độ lùi về hành vi khách (0%). */
export const useCourseProgress = () => useContext(ProgressContext);

/**
 * Tiến độ học của khách (C2), lấy ở trình duyệt để HTML công khai và cache không chứa dữ liệu người dùng. Chỉ tải khi đã đăng nhập;
 * đăng xuất hoặc đổi tài khoản thì xoá sạch ngay.
 */
export function CourseProgressProvider({ children }: { children: ReactNode }) {
  const auth = useCustomer();
  const customerId = auth?.customer?.id ?? null;
  const getToken = auth?.getToken;
  const [loaded, setLoaded] = useState<{ owner: string; ids: Set<string>; tracks: Map<string, number> } | null>(null);
  const owner = useRef<string | null>(null);
  owner.current = customerId;
  /** Mỗi bài một hàng đợi: PUT đến server đúng thứ tự bấm; chỉ lần bấm mới nhất mới được hoàn lại khi lỗi. */
  const queue = useRef(new Map<string, { tail: Promise<unknown>; latest: number }>());

  // Đăng xuất: xoá hẳn tiến độ khỏi bộ nhớ (không chỉ che đi), để đăng nhập lại không thấy dữ liệu cũ.
  useEffect(() => {
    if (!customerId) setLoaded(null);
  }, [customerId]);

  useEffect(() => {
    if (!customerId || !getToken) return;
    let cancelled = false;
    void (async () => {
      const token = await getToken();
      if (!token) return;
      try {
        const progress = await customerApi.courseProgress(token);
        if (!cancelled) {
          setLoaded({ owner: customerId, ids: new Set(progress.lessonIds), tracks: new Map(progress.tracks.map((t) => [t.slug, t.completed])) });
        }
      } catch {
        // Tiến độ chỉ là thông tin hiển thị: lỗi thì hiện như chưa học nhưng vẫn cho đánh dấu (PUT độc lập với GET).
        if (!cancelled) setLoaded({ owner: customerId, ids: new Set(), tracks: new Map() });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId, getToken]);

  // Dữ liệu của người khác (hoặc đã đăng xuất) không bao giờ hiện cho người đang xem.
  const mine = loaded && loaded.owner === customerId ? loaded : null;
  const ids = mine?.ids;
  const tracks = mine?.tracks;

  const setDone = useCallback<ProgressState['setDone']>(
    async (trackSlug, lessonId, done) => {
      if (!customerId || !getToken) return false;
      const apply = (value: boolean) =>
        setLoaded((prev) => {
          if (!prev || prev.owner !== customerId) return prev;
          const nextIds = new Set(prev.ids);
          const nextTracks = new Map(prev.tracks);
          if (value === nextIds.has(lessonId)) return prev;
          if (value) nextIds.add(lessonId);
          else nextIds.delete(lessonId);
          nextTracks.set(trackSlug, Math.max(0, (nextTracks.get(trackSlug) ?? 0) + (value ? 1 : -1)));
          return { ...prev, ids: nextIds, tracks: nextTracks };
        });
      apply(done);
      const entry = queue.current.get(lessonId) ?? { tail: Promise.resolve(), latest: 0 };
      queue.current.set(lessonId, entry);
      const mine = (entry.latest += 1);
      const run = async (): Promise<boolean> => {
        try {
          const token = await getToken();
          if (!token) throw new Error('no token');
          await customerApi.setLessonCompletion(token, lessonId, done);
          return true;
        } catch {
          // Chỉ lần bấm mới nhất mới hoàn lại; lần cũ thất bại không được đè lên trạng thái người dùng đã đổi tiếp.
          if (owner.current === customerId && entry.latest === mine) apply(!done);
          return false;
        }
      };
      const result = entry.tail.then(run, run);
      entry.tail = result;
      return result;
    },
    [customerId, getToken],
  );

  const value = useMemo<ProgressState>(
    () => ({
      signedIn: customerId !== null,
      authLoading: auth?.status === 'loading',
      ready: customerId === null || mine !== null,
      isDone: (id) => ids?.has(id) ?? false,
      doneIn: (list) => (ids ? list.filter((id) => ids.has(id)).length : 0),
      trackDone: (slug) => tracks?.get(slug) ?? 0,
      setDone,
      openLogin: () => auth?.openAuth('login'),
    }),
    [customerId, mine, ids, tracks, setDone, auth],
  );
  return <ProgressContext.Provider value={value}>{children}</ProgressContext.Provider>;
}

/** Thẻ nhánh ở `/courses`: "x/y bài · %" và thanh tiến độ. */
export function TrackCardProgress({ slug, title, total }: { slug: string; title: string; total: number }) {
  const t = useTranslations('Courses');
  const progress = useCourseProgress();
  const done = Math.min(total, progress?.trackDone(slug) ?? 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <>
      <p className="text-body-md text-on-surface-variant">{t('progress', { done, total, percent })}</p>
      <div
        role="progressbar"
        aria-label={t('progressLabel', { title })}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container-high"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
    </>
  );
}

/** Dấu ✓ cạnh bài đã học (có chữ cho trình đọc màn hình, không chỉ dựa vào màu). */
export function LessonDoneMark({ lessonId }: { lessonId: string }) {
  const t = useTranslations('Courses');
  const progress = useCourseProgress();
  if (!progress?.isDone(lessonId)) return null;
  return (
    <span className="flex items-center gap-1 text-caption font-semibold text-primary">
      <Check aria-hidden="true" className="size-4" />
      <span className="sr-only md:not-sr-only">{t('completedMark')}</span>
    </span>
  );
}

/** "x/y bài" của một level hoặc section. */
export function ScopeProgress({ lessonIds }: { lessonIds: readonly string[] }) {
  const t = useTranslations('Courses');
  const progress = useCourseProgress();
  if (lessonIds.length === 0) return null;
  return <span className="text-caption text-on-surface-variant">{t('progressSummary', { done: progress?.doneIn(lessonIds) ?? 0, total: lessonIds.length })}</span>;
}

const button =
  'inline-flex min-h-11 items-center rounded-md border border-outline-variant px-4 py-2 text-body-md font-semibold text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/** Bài đầu tiên chưa học theo thứ tự lộ trình (`from` = vị trí bắt đầu tìm, quay vòng); `null` khi đã học hết. */
export function firstUnfinished(order: readonly LessonRef[], isDone: (id: string) => boolean, from = 0): LessonRef | null {
  for (let i = 0; i < order.length; i += 1) {
    const lesson = order[(from + i) % order.length]!;
    if (!isDone(lesson.id)) return lesson;
  }
  return null;
}

/** Nút "Bắt đầu học" / "Tiếp tục học" ở trang nhánh; ẩn khi chưa đăng nhập hay đã học hết. */
export function ContinueLearning({ order, base }: { order: readonly LessonRef[]; base: string }) {
  const t = useTranslations('Courses');
  const progress = useCourseProgress();
  if (!progress || progress.authLoading || order.length === 0) return null;
  if (!progress.signedIn) {
    return (
      <button type="button" className={`${button} self-start`} onClick={progress.openLogin}>
        {t('loginToSave')}
      </button>
    );
  }
  if (!progress.ready) return null;
  const target = firstUnfinished(order, progress.isDone);
  if (!target) return <p className="text-body-md text-primary">{t('trackDone')}</p>;
  const started = progress.doneIn(order.map((l) => l.id)) > 0;
  return (
    <Link href={`${base}/${target.id}`} className={`${button} self-start`}>
      {started ? t('continueLearning', { title: target.title }) : t('startLearning')}
    </Link>
  );
}

/** Nút đánh dấu hoàn thành ở trang bài, kèm gợi ý bài tiếp theo chưa học. Khách chưa đăng nhập được mời đăng nhập. */
export function LessonProgressPanel({ trackSlug, lessonId, order, base }: { trackSlug: string; lessonId: string; order: readonly LessonRef[]; base: string }) {
  const t = useTranslations('Courses');
  const progress = useCourseProgress();
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!progress || progress.authLoading) return null;
  if (!progress.signedIn) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={button} onClick={progress.openLogin}>
          {t('loginToSave')}
        </button>
      </div>
    );
  }
  const done = progress.isDone(lessonId);
  const at = order.findIndex((l) => l.id === lessonId);
  const next = done && at >= 0 ? firstUnfinished(order, progress.isDone, at + 1) : null;
  const toggle = async () => {
    setBusy(true);
    setError(false);
    const ok = await progress.setDone(trackSlug, lessonId, !done);
    setError(!ok);
    setBusy(false);
  };
  return (
    <div className="flex flex-col items-start gap-3">
      <button type="button" aria-pressed={done} disabled={busy || !progress.ready} className={button} onClick={() => void toggle()}>
        {done ? <Check aria-hidden="true" className="mr-2 size-4" /> : null}
        {t('markComplete')}
      </button>
      {error ? (
        <p role="alert" className="text-body-md text-error">
          {t('progressError')}
        </p>
      ) : null}
      {done && next ? (
        <Link href={`${base}/${next.id}`} className={button}>
          {t('nextUnfinished', { title: next.title })} <span aria-hidden="true">→</span>
        </Link>
      ) : null}
      {done && !next && at >= 0 ? <p className="text-body-md text-primary">{t('trackDone')}</p> : null}
    </div>
  );
}
