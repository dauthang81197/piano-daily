'use client';

import type { PublicSheetDetail } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useCustomer } from '@/components/auth/auth-provider';
import { publicApiUrl } from '@/lib/public-env';
import { downloadButtonClass } from './download-button-class';
import { PurchaseButtons } from './purchase-buttons';

type DownloadType = PublicSheetDetail['downloadTypes'][number];

const PATH: Record<DownloadType, string> = { PDF: 'pdf', MIDI: 'midi', MP3: 'mp3' };

/** Base URL API cho trình duyệt; thiếu cấu hình thì không có nút (không ném, như `ViewBeacon`). */
export function apiBase(): string | null {
  try {
    return publicApiUrl();
  } catch {
    return null;
  }
}

/** Định dạng có thật của Sheet theo thứ tự PDF → MIDI → MP3 (tải ngay nếu free, mua qua modal nếu không); rỗng khi đang preview. */
export function availableDownloads(sheet: PublicSheetDetail, enabled: boolean): DownloadType[] {
  return enabled ? sheet.downloadTypes : [];
}

/**
 * Nút tải Sheet miễn phí (FR7, S1 thuê bao): phải đăng nhập. Bấm nút → `POST /customer/downloads/...` (Bearer) trả signed URL
 * rồi điều hướng tới file (attachment). Chưa đăng nhập thì mở modal đăng nhập thay vì tải. Chỉ render định dạng có thật;
 * định dạng không có thì ẩn hẳn (UX-DR14).
 */
export function DownloadButtons({
  sheetId,
  title,
  types,
  className = 'flex flex-wrap gap-3',
}: {
  sheetId: string;
  title: string;
  types: DownloadType[];
  className?: string;
}) {
  const t = useTranslations('Sheet');
  const ta = useTranslations('Auth');
  const auth = useCustomer();
  const [busy, setBusy] = useState<DownloadType | null>(null);
  const [failed, setFailed] = useState(false);
  if (!apiBase() || types.length === 0) return null;

  const onClick = async (type: DownloadType) => {
    if (busy) return;
    setFailed(false);
    if (!auth) return;
    setBusy(type);
    try {
      const result = await auth.download(sheetId, PATH[type]);
      if (result === 'error') setFailed(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <ul className={className}>
        {types.map((type) => (
          <li key={type}>
            <button
              type="button"
              onClick={() => void onClick(type)}
              disabled={busy !== null}
              className={downloadButtonClass}
              aria-label={t('downloadLabel', { format: t(`download.${type}`), title })}
            >
              {t(`download.${type}`)}
            </button>
          </li>
        ))}
      </ul>
      {failed ? (
        <p role="alert" className="text-body-md text-error">
          {ta('errors.downloadFailed')}
        </p>
      ) : null}
    </>
  );
}

/**
 * Khối call-out riêng cho MIDI/MP3 (UX-DR22). Không có định dạng nào trong hai loại này thì không hiện.
 * `purchase` (Sheet không free, Story 3.6): nút mở modal thanh toán, cần `PurchaseProvider`.
 */
export function AudioDownloadCallout({
  sheetId,
  title,
  types,
  purchase = false,
}: {
  sheetId: string;
  title: string;
  types: DownloadType[];
  purchase?: boolean;
}) {
  const t = useTranslations('Sheet');
  const audio = types.filter((type) => type === 'MIDI' || type === 'MP3');
  if (audio.length === 0 || !apiBase()) return null;
  if (purchase) return <PurchaseButtons variant="audio" title={title} types={audio} />;
  return (
    <section
      aria-labelledby="sheet-audio-downloads"
      className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-container-low p-6"
    >
      <h2 id="sheet-audio-downloads" className="font-display text-headline-sm text-on-surface">
        {t('audioTitle')}
      </h2>
      <p className="text-body-md text-on-surface-variant">{t('audioHint')}</p>
      <DownloadButtons sheetId={sheetId} title={title} types={audio} />
    </section>
  );
}
