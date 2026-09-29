import { SLUG_MAX_LENGTH, slugify } from '@piano-daily/shared';
import { isPrismaError } from './prisma-errors';

/** Số slug ứng viên kiểm tra trong một truy vấn. */
const BATCH_SIZE = 20;
/** Số lần thử lại khi một request đồng thời chiếm mất slug (P2002). */
const MAX_CREATE_ATTEMPTS = 5;

/** Trả về các slug trong `candidates` đã có trong bảng. */
export type TakenSlugs = (candidates: string[]) => Promise<string[]>;

/** Slug ứng viên thứ `n`: `base`, rồi `base-2`, `base-3`… (cắt `base` để tổng độ dài ≤ 80). */
export function slugCandidate(base: string, n: number): string {
  if (n <= 1) return base;
  const suffix = `-${n}`;
  const head = base.slice(0, SLUG_MAX_LENGTH - suffix.length).replace(/-+$/, '');
  return `${head}${suffix}`;
}

/** Slug gốc từ tên; tên không sinh được slug (vd. `"!!!"`) thì dùng `fallback`. */
export function baseSlug(name: string, fallback: string): string {
  return slugify(name) || fallback;
}

/** Slug chưa dùng đầu tiên trong dãy `base`, `base-2`, `base-3`… của một bảng. */
export async function uniqueSlug(takenSlugs: TakenSlugs, base: string): Promise<string> {
  for (let start = 1; ; start += BATCH_SIZE) {
    const candidates = Array.from({ length: BATCH_SIZE }, (_, i) => slugCandidate(base, start + i));
    const taken = new Set(await takenSlugs(candidates));
    const free = candidates.find((candidate) => !taken.has(candidate));
    if (free) return free;
  }
}

/**
 * Tạo bản ghi với slug unique: chọn slug trống rồi `create`. Nếu request đồng thời chiếm slug trước
 * (P2002 trên cột unique `slug` — cột unique duy nhất ngoài id của các bảng này), chọn lại và thử lại.
 */
export async function createWithUniqueSlug<T>(
  takenSlugs: TakenSlugs,
  base: string,
  create: (slug: string) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    const slug = await uniqueSlug(takenSlugs, base);
    try {
      return await create(slug);
    } catch (err) {
      if (!isPrismaError(err, 'P2002') || attempt >= MAX_CREATE_ATTEMPTS) throw err;
    }
  }
}
