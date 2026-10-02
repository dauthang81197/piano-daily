import { createHash, timingSafeEqual } from 'node:crypto';
import { isCacheTag } from '@piano-daily/shared';
import { revalidateTag } from 'next/cache';
import { z } from 'zod';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  tags: z.array(z.string().refine(isCacheTag)).min(1).max(100),
});

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** So sánh thời gian hằng số (băm sha256 trước để hai buffer luôn cùng độ dài). */
function secretMatches(provided: string | null, expected: string | undefined): boolean {
  if (!provided || !expected) return false;
  return timingSafeEqual(sha256(provided), sha256(expected));
}

const json = (body: unknown, status: number) => Response.json(body, { status });

/**
 * API gọi route này sau khi admin đổi nội dung (AD-10, Story 2.3) để làm mới cache theo tag.
 * Sai/thiếu `X-Internal-Secret` → 401 (không lộ lý do, không revalidate gì).
 */
export async function POST(request: Request): Promise<Response> {
  if (!secretMatches(request.headers.get('x-internal-secret'), process.env.INTERNAL_API_SECRET)) {
    return json({ error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return json({ error: { code: 'VALIDATION_FAILED', message: 'Body không hợp lệ.' } }, 400);
  }
  const parsed = bodySchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: { code: 'VALIDATION_FAILED', message: 'Body không hợp lệ.' } }, 400);
  }

  const tags = [...new Set(parsed.data.tags)];
  for (const tag of tags) revalidateTag(tag, { expire: 0 });
  return json({ revalidated: tags.length }, 200);
}
