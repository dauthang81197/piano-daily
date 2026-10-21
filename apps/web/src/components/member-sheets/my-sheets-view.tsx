'use client';

import type { MemberSheetListItem } from '@piano-daily/shared';
import { FileMusic, Lock, Music2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { EmptyState } from '@/components/catalog/empty-state';
import { calloutCardClass } from '@/components/sheet/download-button-class';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClasses } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Link } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { ApiError } from '@/lib/public-api';
import { errorKey } from './describe-error';

/** Danh sách "Bản nhạc của tôi": trạng thái, xem/sửa, gỡ về nháp hoặc đăng, xoá (có xác nhận). */
export function MySheetsView() {
  const t = useTranslations('MySheets');
  const nav = useTranslations('Nav');
  const auth = useCustomer();
  const customerId = auth?.customer?.id ?? null;
  const getToken = auth?.getToken;
  const [items, setItems] = useState<MemberSheetListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const token = useCallback(async () => {
    const value = getToken ? await getToken() : null;
    if (!value) throw new ApiError(401, 'UNAUTHORIZED', 'no token');
    return value;
  }, [getToken]);

  const load = useCallback(async () => {
    try {
      setItems(await customerApi.listMySheets(await token()));
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
      setItems([]);
    }
  }, [token, t]);

  useEffect(() => {
    if (!customerId) {
      setItems(null);
      return;
    }
    void load();
  }, [customerId, load]);

  if (!auth || auth.status === 'loading') return <Skeleton className="h-64 w-full rounded-xl" />;
  if (auth.status === 'anonymous' || !auth.customer) {
    return (
      <section aria-labelledby="mysheets-login" className={`${calloutCardClass} items-start`}>
        <h2 id="mysheets-login" className="flex items-center gap-2 font-display text-headline-sm text-on-surface">
          <Lock aria-hidden="true" className="size-5" />
          {t('loginTitle')}
        </h2>
        <p className="text-body-md text-on-surface-variant">{t('loginBody')}</p>
        <Button onClick={() => auth.openAuth('login')}>{t('login')}</Button>
      </section>
    );
  }
  if (items === null) return <Skeleton className="h-64 w-full rounded-xl" />;

  const act = async (id: string, run: () => Promise<unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      await run();
      await load();
    } catch (err) {
      setError(t(`errors.${errorKey(err)}`));
    } finally {
      setBusyId(null);
      setConfirming(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      {error ? (
        <p role="alert" className="text-body-md text-error">
          {error}
        </p>
      ) : null}
      {items.length === 0 ? (
        <EmptyState icon={FileMusic} title={t('emptyTitle')} hint={t('emptyHint')}>
          <Link href="/my-sheets/new" className={buttonClasses()}>
            {t('newCta')}
          </Link>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((sheet) => (
            <li key={sheet.id}>
              <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-outline-variant bg-surface-container-low">
                  {sheet.thumbnailUrl ? <img src={sheet.thumbnailUrl} alt="" loading="lazy" className="h-full w-full object-cover object-top" /> : <Music2 aria-hidden="true" className="size-8 text-outline" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="break-words font-display text-headline-sm text-on-surface">{sheet.title}</h2>
                    <Badge tone={sheet.status === 'PUBLISHED' ? 'beginner' : sheet.status === 'ARCHIVED' ? 'hot' : 'neutral'}>{t(`status.${sheet.status}`)}</Badge>
                  </div>
                  <p className="text-caption text-on-surface-variant">
                    {sheet.composer.name} · {nav(`levels.${sheet.level.toLowerCase() as 'beginner'}`)} · {t('pages', { count: sheet.pageCount })} · {t('views', { count: sheet.viewCount })}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {sheet.status === 'PUBLISHED' ? (
                    <Link href={`/sheet/${sheet.slug}`} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'min-h-11' })}>
                      {t('view')}
                    </Link>
                  ) : null}
                  <Link href={`/my-sheets/${sheet.id}`} className={buttonClasses({ variant: 'secondary', size: 'sm', className: 'min-h-11' })}>
                    {t('edit')}
                  </Link>
                  {sheet.status === 'PUBLISHED' ? (
                    <Button variant="ghost" size="sm" className="min-h-11" disabled={busyId === sheet.id} onClick={() => void act(sheet.id, async () => customerApi.unpublishMySheet(await token(), sheet.id))}>
                      {t('unpublish')}
                    </Button>
                  ) : sheet.status === 'DRAFT' ? (
                    <Button variant="ghost" size="sm" className="min-h-11" disabled={busyId === sheet.id} onClick={() => void act(sheet.id, async () => customerApi.publishMySheet(await token(), sheet.id))}>
                      {t('publish')}
                    </Button>
                  ) : null}
                  {confirming === sheet.id ? (
                    <span className="flex flex-wrap items-center gap-2" role="alert">
                      <span className="text-body-md text-on-surface">{t('deleteConfirm')}</span>
                      <Button size="sm" className="min-h-11" disabled={busyId === sheet.id} onClick={() => void act(sheet.id, async () => customerApi.deleteMySheet(await token(), sheet.id))}>
                        {t('deleteYes')}
                      </Button>
                      <Button variant="ghost" size="sm" className="min-h-11" onClick={() => setConfirming(null)}>
                        {t('cancel')}
                      </Button>
                    </span>
                  ) : (
                    <Button variant="ghost" size="sm" className="min-h-11" disabled={busyId === sheet.id} onClick={() => setConfirming(sheet.id)}>
                      {t('delete')}
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
