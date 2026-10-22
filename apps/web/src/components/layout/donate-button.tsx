'use client';

import type { PublicDonor } from '@piano-daily/shared';
import { Heart, X } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { fetchDonors } from '@/lib/public-api';
import { cn } from '@/lib/cn';

/** Ảnh QR tĩnh do chủ dự án cung cấp (thay file này để đổi mã). */
export const DONATE_QR_SRC = '/donate-qr.svg';

type Load = { state: 'idle' | 'loading' | 'error' } | { state: 'ready'; donors: PublicDonor[] };

/** Nút "Ủng hộ" trên header: mở hộp thoại có mã QR và danh sách người ủng hộ (tải khi mở). */
export function DonateButton({ className }: { className?: string }) {
  const t = useTranslations('Donate');
  const nav = useTranslations('Nav');
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<Load>({ state: 'idle' });
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  const fetchList = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      setLoad({ state: 'ready', donors: await fetchDonors() });
    } catch {
      setLoad({ state: 'error' });
    }
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
    if (!open && dialog.open) {
      if (typeof dialog.close === 'function') dialog.close();
      else dialog.removeAttribute('open');
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  useEffect(() => {
    if (open && load.state === 'idle') void fetchList();
  }, [open, load.state, fetchList]);

  const date = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' });
  const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn(
          'inline-flex min-h-11 items-center gap-2 rounded-md border border-outline-variant px-3 text-body-md text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary',
          className,
        )}
      >
        <Heart aria-hidden="true" className="size-4 text-secondary" />
        {nav('donate')}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={() => setOpen(false)}
        onClick={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}
        className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto overscroll-contain rounded-xl border border-outline-variant bg-surface p-0 text-on-surface shadow-md backdrop:bg-black/40"
      >
        {open ? (
          <div className="flex flex-col gap-5 p-5 md:p-6">
            <div className="flex items-start justify-between gap-4">
              <h2 id={titleId} className="font-display text-headline-sm text-primary">
                {t('title')}
              </h2>
              <button
                type="button"
                aria-label={t('close')}
                onClick={() => setOpen(false)}
                className="flex size-11 shrink-0 items-center justify-center rounded-md hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <p className="text-body-md text-on-surface-variant">{t('intro')}</p>
            <img src={DONATE_QR_SRC} alt={t('qrAlt')} className="mx-auto aspect-square w-full max-w-60 rounded-md border border-outline-variant bg-white object-contain p-2" />
            <section aria-labelledby={`${titleId}-list`} className="flex flex-col gap-3">
              <h3 id={`${titleId}-list`} className="text-label-caps uppercase text-secondary">
                {t('supportersTitle')}
              </h3>
              {load.state === 'loading' || load.state === 'idle' ? (
                <p role="status" className="text-body-md text-on-surface-variant">
                  {t('loading')}
                </p>
              ) : null}
              {load.state === 'error' ? (
                <div role="alert" className="flex flex-wrap items-center gap-3 text-body-md text-error">
                  <span>{t('error')}</span>
                  <button type="button" onClick={() => void fetchList()} className="rounded-md border border-outline-variant px-3 py-1.5 text-on-surface hover:bg-surface-container-low">
                    {t('retry')}
                  </button>
                </div>
              ) : null}
              {load.state === 'ready' && load.donors.length === 0 ? <p className="text-body-md text-on-surface-variant">{t('empty')}</p> : null}
              {load.state === 'ready' && load.donors.length > 0 ? (
                <ul className="flex max-h-64 flex-col divide-y divide-outline-variant overflow-y-auto rounded-md border border-outline-variant">
                  {load.donors.map((donor) => (
                    <li key={donor.id} className="flex flex-col gap-0.5 px-3 py-2">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                        <span className="break-words font-medium">{donor.name}</span>
                        <span className="text-caption text-on-surface-variant">
                          {donor.amount === null ? null : `${money.format(donor.amount)} · `}
                          {date.format(new Date(`${donor.donatedAt}T00:00:00Z`))}
                        </span>
                      </div>
                      {donor.message ? <p className="break-words text-body-md text-on-surface-variant">{donor.message}</p> : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
