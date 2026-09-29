import { z } from 'zod';

/**
 * Hợp đồng API phân loại thư viện (module `catalog`): Composer, Genre, Series.
 * Slug do server sinh từ tên lúc tạo và không đổi khi đổi tên: DTO không nhận `slug`.
 */

export const TAXONOMY_NAME_MAX_LENGTH = 120;
export const COMPOSER_BIO_MAX_LENGTH = 2000;
export const PAGE_SIZE_DEFAULT = 20;
export const PAGE_SIZE_MAX = 100;

/** Icon Genre: tên icon lucide (kebab-case) chọn từ danh sách cố định này. */
export const GENRE_ICONS = [
  'music',
  'piano',
  'guitar',
  'drum',
  'mic-vocal',
  'headphones',
  'disc-3',
  'heart',
  'star',
  'sparkles',
  'crown',
  'film',
  'gamepad-2',
  'church',
  'baby',
  'sun',
  'moon',
  'coffee',
  'leaf',
  'flame',
  'snowflake',
  'party-popper',
  'gift',
  'book-open',
] as const;

export type GenreIcon = (typeof GENRE_ICONS)[number];

export const genreIconSchema = z.enum(GENRE_ICONS, { error: 'Icon không nằm trong danh sách cho phép.' });

const nameSchema = z
  .string({ error: 'Vui lòng nhập tên.' })
  .trim()
  .min(1, { error: 'Vui lòng nhập tên.' })
  .max(TAXONOMY_NAME_MAX_LENGTH, { error: `Tên tối đa ${TAXONOMY_NAME_MAX_LENGTH} ký tự.` });

/** Tiểu sử: chuỗi rỗng (sau trim) được lưu là `null`. */
const bioSchema = z
  .string()
  .trim()
  .max(COMPOSER_BIO_MAX_LENGTH, { error: `Tiểu sử tối đa ${COMPOSER_BIO_MAX_LENGTH} ký tự.` })
  .nullable()
  .transform((value) => (value ? value : null));

const composerIdSchema = z.uuid({ error: 'Vui lòng chọn Composer.' });

// ── Composer ─────────────────────────────────────────────────

/** `POST /admin/composers` */
export const createComposerSchema = z.object({
  name: nameSchema,
  bio: bioSchema.optional(),
});
export type CreateComposerRequest = z.input<typeof createComposerSchema>;

/** `PATCH /admin/composers/:id` */
export const updateComposerSchema = createComposerSchema.partial();
export type UpdateComposerRequest = z.input<typeof updateComposerSchema>;

export const composerSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  bio: z.string().nullable(),
  /** Ảnh đại diện: chưa có form upload (module `media`, Story 1.6). */
  avatar: z.string().nullable(),
  seriesCount: z.number().int().nonnegative(),
});
export type Composer = z.infer<typeof composerSchema>;

// ── Genre ────────────────────────────────────────────────────

/** `POST /admin/genres` */
export const createGenreSchema = z.object({
  name: nameSchema,
  icon: genreIconSchema.nullable().optional(),
});
export type CreateGenreRequest = z.input<typeof createGenreSchema>;

/** `PATCH /admin/genres/:id` */
export const updateGenreSchema = createGenreSchema.partial();
export type UpdateGenreRequest = z.input<typeof updateGenreSchema>;

export const genreSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  icon: genreIconSchema.nullable(),
});
export type Genre = z.infer<typeof genreSchema>;

// ── Series ───────────────────────────────────────────────────

/** `POST /admin/series` — Composer phải tồn tại (kiểm phía server). */
export const createSeriesSchema = z.object({
  name: nameSchema,
  composerId: composerIdSchema,
});
export type CreateSeriesRequest = z.input<typeof createSeriesSchema>;

/** `PATCH /admin/series/:id` */
export const updateSeriesSchema = createSeriesSchema.partial();
export type UpdateSeriesRequest = z.input<typeof updateSeriesSchema>;

export const seriesSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  composer: z.object({ id: z.string(), name: z.string() }),
});
export type Series = z.infer<typeof seriesSchema>;

// ── List ─────────────────────────────────────────────────────

/**
 * Query của các endpoint list: `q` tìm theo tên (không phân biệt hoa thường và dấu),
 * `page` từ 1, `pageSize` mặc định 20 (tối đa 100), `composerId` chỉ dùng cho Series.
 */
export const listQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(TAXONOMY_NAME_MAX_LENGTH, { error: `Từ khoá tối đa ${TAXONOMY_NAME_MAX_LENGTH} ký tự.` })
    .optional()
    .transform((value) => value || undefined),
  page: z.coerce
    .number({ error: 'Trang phải là số nguyên từ 1.' })
    .int({ error: 'Trang phải là số nguyên từ 1.' })
    .min(1, { error: 'Trang phải là số nguyên từ 1.' })
    .max(1_000_000, { error: 'Trang quá lớn.' })
    .default(1),
  pageSize: z.coerce
    .number({ error: `Kích thước trang phải từ 1 đến ${PAGE_SIZE_MAX}.` })
    .int({ error: `Kích thước trang phải từ 1 đến ${PAGE_SIZE_MAX}.` })
    .min(1, { error: `Kích thước trang phải từ 1 đến ${PAGE_SIZE_MAX}.` })
    .max(PAGE_SIZE_MAX, { error: `Kích thước trang phải từ 1 đến ${PAGE_SIZE_MAX}.` })
    .default(PAGE_SIZE_DEFAULT),
  composerId: z.uuid({ error: 'composerId không hợp lệ.' }).optional(),
});
export type ListQueryInput = z.input<typeof listQuerySchema>;
export type ListQuery = z.output<typeof listQuerySchema>;

/** Response list chuẩn: `{items, page, pageSize, total}`. */
export function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    page: z.number().int().min(1),
    pageSize: z.number().int().min(1),
    total: z.number().int().nonnegative(),
  });
}

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
