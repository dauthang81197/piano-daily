import 'server-only';
import { cacheTags, type PublicAdSlot, publicAdSlotSchema } from '@piano-daily/shared';
import { z } from 'zod';
import { publicFetch } from './api';

/** Quảng cáo đang bật (tag `ads`, được API revalidate khi founder đổi). Mọi lỗi trả `[]`, không bao giờ ném. */
export async function fetchAds(): Promise<PublicAdSlot[]> {
  try {
    const res = await publicFetch('/ads', { tags: [cacheTags.ads], headers: { Accept: 'application/json' } });
    if (!res.ok) return [];
    return z.array(publicAdSlotSchema).parse(await res.json());
  } catch {
    return [];
  }
}
