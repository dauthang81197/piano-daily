import type { AdPosition, PublicAdSlot } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';

/** Chiều cao iframe cố định theo vị trí: dải ngang thấp, còn lại cao hơn. */
const IFRAME_HEIGHT: Record<AdPosition, string> = {
  HEADER: 'h-24',
  STICKY_BOTTOM: 'h-20',
  IN_LIST: 'h-64',
  IN_CONTENT: 'h-64',
  SIDEBAR_LEFT: 'h-64',
  SIDEBAR_RIGHT: 'h-64',
};

/** Ảnh không được cao hơn dải của vị trí (thanh cố định phải vừa khối đệm h-36 của STICKY_BOTTOM). */
const IMAGE_MAX_HEIGHT: Record<AdPosition, string> = {
  HEADER: 'max-h-24',
  STICKY_BOTTOM: 'max-h-20',
  IN_LIST: 'max-h-64',
  IN_CONTENT: 'max-h-64',
  SIDEBAR_LEFT: 'max-h-64',
  SIDEBAR_RIGHT: 'max-h-64',
};

/** Margin nằm trong component để slot trống không để lại khoảng trống. */
const MARGIN: Record<AdPosition, string> = {
  HEADER: 'mx-margin-mobile my-4 md:mx-margin-desktop',
  STICKY_BOTTOM: '',
  IN_LIST: 'my-4',
  IN_CONTENT: 'my-4',
  SIDEBAR_LEFT: '',
  SIDEBAR_RIGHT: '',
};

/** Slot đang có nội dung hiển thị được (HTML hoặc ảnh kèm link) ở vị trí này. */
export function findAdSlot(slots: readonly PublicAdSlot[] | undefined, position: AdPosition): PublicAdSlot | null {
  const slot = slots?.find((s) => s.position === position);
  if (!slot) return null;
  return slot.htmlCode?.trim() || (slot.image && slot.link) ? slot : null;
}

/**
 * Khung quảng cáo trung tính (nền nhạt, viền dashed, không màu thương hiệu). `htmlCode` CHỈ đi qua `srcDoc` của iframe
 * sandbox không có `allow-same-origin` (opaque origin: không chạm được document/PayPal SDK của trang), không vào DOM.
 */
export function AdFrame({ slot, className = '' }: { slot: PublicAdSlot; className?: string }) {
  const t = useTranslations('Ads');
  return (
    <aside
      aria-label={t('label')}
      className={`flex min-w-0 flex-col gap-1 rounded-sm border border-dashed border-outline-variant bg-surface-container-low p-2 ${className}`}
    >
      <span className="text-caption text-on-surface-variant">{t('label')}</span>
      {slot.htmlCode?.trim() ? (
        <iframe
          title={t('frameTitle')}
          sandbox="allow-scripts allow-popups"
          srcDoc={slot.htmlCode}
          referrerPolicy="no-referrer"
          loading="lazy"
          className={`${IFRAME_HEIGHT[slot.position]} w-full border-0 bg-white`}
        />
      ) : (
        <a href={slot.link ?? undefined} rel="noopener noreferrer sponsored" target="_blank" aria-label={t('label')}>
          <img src={slot.image ?? undefined} alt="" loading="lazy" className={`mx-auto ${IMAGE_MAX_HEIGHT[slot.position]} w-auto max-w-full`} />
        </a>
      )}
    </aside>
  );
}

/** Quảng cáo của một vị trí; `null` (không wrapper, không margin) khi không có slot đang bật hoặc slot rỗng. */
export function AdSlotFrame({
  slots,
  position,
  className = '',
}: {
  slots: readonly PublicAdSlot[] | undefined;
  position: AdPosition;
  className?: string;
}) {
  const slot = findAdSlot(slots, position);
  if (!slot) return null;
  return <AdFrame slot={slot} className={`${MARGIN[position]} ${className}`.trim()} />;
}
