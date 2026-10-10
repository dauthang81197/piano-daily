'use client';

import type { PublicAdSlot } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AdFrame, findAdSlot } from './ad-slot-frame';

/**
 * Thanh quảng cáo cố định đáy (có nút đóng 44 px). `z-40` thấp hơn modal thanh toán (`z-50`); khối đệm
 * trong luồng giữ cho footer không bị che. Đóng xong thì cả thanh lẫn đệm biến mất.
 */
export function StickyBottomAd({ slots }: { slots: readonly PublicAdSlot[] | undefined }) {
  const t = useTranslations('Ads');
  const [dismissed, setDismissed] = useState(false);
  const slot = findAdSlot(slots, 'STICKY_BOTTOM');
  if (!slot || dismissed) return null;
  return (
    <>
      <div aria-hidden="true" className="h-36" />
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-start justify-center gap-2 bg-surface px-margin-mobile pb-2 pt-1 md:px-margin-desktop">
        <AdFrame slot={slot} className="w-full max-w-4xl" />
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label={t('dismiss')}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-sm border border-outline-variant bg-surface text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </>
  );
}
