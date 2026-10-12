'use client';

import type { AdPosition, PublicAdItem } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { publicApiUrl } from '@/lib/public-env';

/** Ảnh không được cao hơn dải của vị trí (thanh cố định phải vừa khối đệm h-44 của STICKY_BOTTOM). */
const IMAGE_MAX_HEIGHT: Record<AdPosition, string> = {
  HEADER: 'max-h-24',
  STICKY_BOTTOM: 'max-h-20',
  IN_LIST: 'max-h-64',
  IN_CONTENT: 'max-h-64',
  SIDEBAR_LEFT: 'max-h-64',
  SIDEBAR_RIGHT: 'max-h-64',
};

/**
 * Ghi một lượt bấm (best-effort): beacon không đợi phản hồi nên không chặn việc mở link và không cần CORS.
 * Thiếu `NEXT_PUBLIC_API_URL` hoặc trình duyệt không hỗ trợ thì bỏ qua, không bao giờ ném.
 */
export function sendAdClick(itemId: string): void {
  try {
    const url = `${publicApiUrl()}/ads/items/${encodeURIComponent(itemId)}/click`;
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) return;
    void fetch(url, { method: 'POST', keepalive: true, mode: 'no-cors' }).catch(() => undefined);
  } catch {
    // Không có API để đếm: bỏ qua.
  }
}

/** Một sản phẩm quảng cáo: ảnh bọc trong link affiliate (rel sponsored), huy hiệu nền tảng và nhãn tuỳ chọn. */
export function AdItemLink({ item, position }: { item: PublicAdItem; position: AdPosition }) {
  const t = useTranslations('Ads');
  // Tên truy cập khác nhau cho từng sản phẩm (nhãn, rồi tới nền tảng) để người dùng trình đọc màn hình phân biệt được.
  const name = item.label ?? (item.platform !== 'OTHER' ? t(`platform.${item.platform}`) : null);
  return (
    <a
      href={item.link}
      rel="noopener noreferrer sponsored"
      target="_blank"
      aria-label={name ? `${t('label')}: ${name}` : t('label')}
      onClick={() => sendAdClick(item.id)}
      // Bấm giữa chuột mở tab mới không phát `click`; Ctrl/Cmd+bấm vẫn là `click`.
      onAuxClick={(e) => {
        if (e.button === 1) sendAdClick(item.id);
      }}
      className="flex min-w-0 flex-none snap-start flex-col items-center gap-1"
    >
      <img src={item.image} alt="" loading="lazy" className={`${IMAGE_MAX_HEIGHT[position]} w-auto max-w-full`} />
      {(item.platform !== 'OTHER' || item.label) && (
        <span className="flex max-w-full flex-wrap items-center justify-center gap-1 text-caption text-on-surface-variant">
          {item.platform !== 'OTHER' && (
            <span className="rounded-sm border border-outline-variant px-1">{t(`platform.${item.platform}`)}</span>
          )}
          {item.label && <span className="truncate">{item.label}</span>}
        </span>
      )}
    </a>
  );
}
