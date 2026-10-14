import 'server-only';
import { cacheTags, type PublicPlansResponse, publicPlansResponseSchema } from '@piano-daily/shared';
import { publicFetch } from './api';

const EMPTY: PublicPlansResponse = { subscriptionsEnabled: false, vietqrEnabled: false, plans: [] };

/** Gói thuê bao đang bật (tag `plans`, được API revalidate khi admin đổi gói hoặc cài đặt). Mọi lỗi trả rỗng, không bao giờ ném. */
export async function fetchPlans(): Promise<PublicPlansResponse> {
  try {
    const res = await publicFetch('/plans', { tags: [cacheTags.plans], headers: { Accept: 'application/json' } });
    if (!res.ok) return EMPTY;
    return publicPlansResponseSchema.parse(await res.json());
  } catch {
    return EMPTY;
  }
}
