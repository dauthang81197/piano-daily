'use client';

import type { PublicSheetDetail } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { usePurchase } from '@/components/payment/purchase-provider';
import { downloadButtonClass } from './download-button-class';

type DownloadType = PublicSheetDetail['downloadTypes'][number];

/**
 * Nút Download của Sheet không free (Story 3.6): mở modal thanh toán thay vì tải trực tiếp. Chỉ hiện type có trong
 * `downloadTypes` và (khi đã có báo giá) có giá; type còn lại ẩn hẳn, khối bao quanh cũng ẩn nếu không còn nút nào.
 * `paymentsEnabled=false` thì nút `aria-disabled` kèm chú thích và không mở modal. Cần `PurchaseProvider` ở trên.
 * `variant` chọn khối bao quanh, khớp với phiên bản tải trực tiếp của Sheet free: nhóm ở header, call-out MIDI/MP3,
 * nút PDF ở sidebar.
 */
export function PurchaseButtons({
  title,
  types,
  variant,
}: {
  title: string;
  types: DownloadType[];
  variant: 'group' | 'audio' | 'pdf';
}) {
  const t = useTranslations('Sheet');
  const purchase = usePurchase();
  const noteId = useId();
  if (!purchase) return null;
  const { quote, open } = purchase;

  const visible = quote ? types.filter((type) => quote.items.some((item) => item.fileType === type)) : types;
  if (visible.length === 0) return null;
  const disabled = quote !== null && !quote.paymentsEnabled;

  const buttons = (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-wrap gap-3">
        {visible.map((type) => (
          <li key={type}>
            <button
              type="button"
              className={`${downloadButtonClass} ${disabled ? 'cursor-not-allowed opacity-60 hover:opacity-60' : ''}`}
              aria-label={t('downloadLabel', { format: t(`download.${type}`), title })}
              aria-disabled={disabled ? true : undefined}
              aria-describedby={disabled ? noteId : undefined}
              aria-haspopup="dialog"
              onClick={(event) => {
                if (disabled) return;
                open(type, event.currentTarget);
              }}
            >
              {t(`download.${type}`)}
            </button>
          </li>
        ))}
      </ul>
      {disabled ? (
        <p id={noteId} className="text-caption text-on-surface-variant">
          {t('purchaseDisabledNote')}
        </p>
      ) : null}
    </div>
  );

  if (variant === 'audio') {
    return (
      <section
        aria-labelledby={`${noteId}-audio`}
        className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-container-low p-6"
      >
        <h2 id={`${noteId}-audio`} className="font-display text-headline-sm text-on-surface">
          {t('audioTitle')}
        </h2>
        <p className="text-body-md text-on-surface-variant">{t('audioHint')}</p>
        {buttons}
      </section>
    );
  }
  if (variant === 'pdf') {
    return (
      <section aria-label={t('pdfSidebarTitle')} className="flex flex-col gap-3">
        <h2 className="font-display text-headline-sm text-on-surface">{t('pdfSidebarTitle')}</h2>
        {buttons}
      </section>
    );
  }
  return <section aria-label={t('downloadGroup')}>{buttons}</section>;
}
