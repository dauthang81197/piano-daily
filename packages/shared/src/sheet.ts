import { z } from 'zod';
import { PAGE_SIZE_DEFAULT, PAGE_SIZE_MAX } from './catalog';

/**
 * Hợp đồng API Sheet (module `catalog`), Story 1.5: tạo và sửa thông tin Sheet ở trạng thái Draft.
 * DTO chỉ nhận các trường founder soạn; trường dẫn xuất (`has*`, `pageCount`, thumbnail…) do
 * `recomputeDerived()` phía server ghi, còn `status`/`slug`/`isHot`/`viewCount` có luồng riêng.
 * DTO dùng `z.strictObject` nên key lạ bị từ chối (400), không bị bỏ qua âm thầm.
 */

// ── Enum ─────────────────────────────────────────────────────

/** Cấp độ Sheet; phải trùng enum `Level` của Prisma (có test kiểm tra). */
export const Level = {
  BEGINNER: 'BEGINNER',
  INTERMEDIATE: 'INTERMEDIATE',
  ADVANCED: 'ADVANCED',
  EXPERT: 'EXPERT',
} as const;
export type Level = (typeof Level)[keyof typeof Level];
export const levelSchema = z.enum(Level, { error: 'Vui lòng chọn cấp độ.' });

/** Trạng thái Sheet; phải trùng enum `SheetStatus` của Prisma (có test kiểm tra). */
export const SheetStatus = {
  DRAFT: 'DRAFT',
  PUBLISHED: 'PUBLISHED',
  ARCHIVED: 'ARCHIVED',
} as const;
export type SheetStatus = (typeof SheetStatus)[keyof typeof SheetStatus];
export const sheetStatusSchema = z.enum(SheetStatus, { error: 'Trạng thái không hợp lệ.' });

/** Nhãn tiếng Việt cho giao diện. */
export const LEVEL_LABELS: Record<Level, string> = {
  BEGINNER: 'Cơ bản',
  INTERMEDIATE: 'Trung cấp',
  ADVANCED: 'Nâng cao',
  EXPERT: 'Chuyên sâu',
};

export const SHEET_STATUS_LABELS: Record<SheetStatus, string> = {
  DRAFT: 'Draft',
  PUBLISHED: 'Đã publish',
  ARCHIVED: 'Đã lưu trữ',
};

// ── YouTube ──────────────────────────────────────────────────

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const YOUTUBE_PATH_PREFIXES = ['/embed/', '/shorts/'];

/**
 * ID video (11 ký tự `[A-Za-z0-9_-]`) từ link YouTube, hoặc `null` nếu link không hợp lệ.
 * Chấp nhận `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`, `youtube.com/shorts/ID`
 * (http/https — thiếu scheme thì coi như https; có hoặc không `www.`/`m.`).
 */
export function parseYoutubeUrl(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null | undefined;
  if (host === 'youtu.be') {
    id = url.pathname.slice(1).replace(/\/$/, '');
  } else if (YOUTUBE_HOSTS.has(host)) {
    if (url.pathname === '/watch' || url.pathname === '/watch/') {
      id = url.searchParams.get('v');
    } else {
      const prefix = YOUTUBE_PATH_PREFIXES.find((p) => url.pathname.startsWith(p));
      if (prefix) id = url.pathname.slice(prefix.length).replace(/\/$/, '');
    }
  }
  return id && YOUTUBE_ID.test(id) ? id : null;
}

/** Dạng chuẩn được lưu trong DB. */
export function youtubeCanonicalUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** URL nhúng dùng cho preview (không cookie). */
export function youtubeEmbedUrl(id: string): string {
  return `https://www.youtube-nocookie.com/embed/${id}`;
}

export const YOUTUBE_URL_ERROR =
  'Link YouTube không hợp lệ. Hãy dán link dạng youtube.com/watch?v=…, youtu.be/…, youtube.com/embed/… hoặc youtube.com/shorts/….';

// ── DTO ──────────────────────────────────────────────────────

export const SHEET_TITLE_MAX_LENGTH = 200;
export const SHEET_SUBTITLE_MAX_LENGTH = 200;
export const SHEET_DIFFICULTY_NOTE_MAX_LENGTH = 500;
export const SHEET_DESCRIPTION_MAX_LENGTH = 5000;
export const SHEET_LYRICS_MAX_LENGTH = 50_000;
export const SHEET_GENRES_MAX = 20;
export const DIFFICULTY_MIN = 0;
export const DIFFICULTY_MAX = 100;

/** Chuỗi tuỳ chọn: trim, rỗng thành `null`. */
function optionalText(max: number, label: string) {
  return z
    .string({ error: `${label} phải là chuỗi.` })
    .trim()
    .max(max, { error: `${label} tối đa ${max} ký tự.` })
    .nullable()
    .transform((value) => (value ? value : null));
}

const titleSchema = z
  .string({ error: 'Vui lòng nhập tiêu đề.' })
  .trim()
  .min(1, { error: 'Vui lòng nhập tiêu đề.' })
  .max(SHEET_TITLE_MAX_LENGTH, { error: `Tiêu đề tối đa ${SHEET_TITLE_MAX_LENGTH} ký tự.` });

/** Lyrics & chords (markdown): giữ nguyên khoảng trắng (thụt lề có nghĩa), chỉ khoảng trắng thì thành `null`. */
const lyricsChordsSchema = z
  .string({ error: 'Lyrics & chords phải là chuỗi.' })
  .max(SHEET_LYRICS_MAX_LENGTH, { error: `Lyrics & chords tối đa ${SHEET_LYRICS_MAX_LENGTH} ký tự.` })
  .nullable()
  .transform((value) => (value && value.trim() ? value : null));

/** Link YouTube: rỗng thành `null`; hợp lệ thì chuẩn hoá về `https://www.youtube.com/watch?v=ID`. */
export const youtubeUrlSchema = z
  .string({ error: YOUTUBE_URL_ERROR })
  .trim()
  .max(500, { error: YOUTUBE_URL_ERROR })
  .nullable()
  .transform((value, ctx) => {
    if (!value) return null;
    const id = parseYoutubeUrl(value);
    if (!id) {
      ctx.issues.push({ code: 'custom', message: YOUTUBE_URL_ERROR, input: value });
      return z.NEVER;
    }
    return youtubeCanonicalUrl(id);
  });

const difficultyScoreSchema = z
  .number({ error: `Độ khó phải là số nguyên từ ${DIFFICULTY_MIN} đến ${DIFFICULTY_MAX}.` })
  .int({ error: `Độ khó phải là số nguyên từ ${DIFFICULTY_MIN} đến ${DIFFICULTY_MAX}.` })
  .min(DIFFICULTY_MIN, { error: `Độ khó phải là số nguyên từ ${DIFFICULTY_MIN} đến ${DIFFICULTY_MAX}.` })
  .max(DIFFICULTY_MAX, { error: `Độ khó phải là số nguyên từ ${DIFFICULTY_MIN} đến ${DIFFICULTY_MAX}.` })
  .nullable();

/** UUID chuẩn hoá chữ thường (Postgres trả uuid chữ thường; so sánh id phía server dựa vào điều này). */
const lowerCase = (id: string) => id.toLowerCase();

/** Danh sách Genre: uuid, bỏ trùng, tối đa 20. */
const genreIdsSchema = z
  .array(z.uuid({ error: 'Genre không hợp lệ.' }), { error: 'Danh sách Genre không hợp lệ.' })
  .max(SHEET_GENRES_MAX, { error: `Tối đa ${SHEET_GENRES_MAX} Genre.` })
  .transform((ids) => [...new Set(ids.map(lowerCase))]);

const sheetFields = {
  title: titleSchema,
  subtitle: optionalText(SHEET_SUBTITLE_MAX_LENGTH, 'Tiêu đề phụ').optional(),
  composerId: z.uuid({ error: 'Vui lòng chọn Composer.' }).transform(lowerCase),
  seriesId: z.uuid({ error: 'Series không hợp lệ.' }).transform(lowerCase).nullable().optional(),
  level: levelSchema,
  difficultyScore: difficultyScoreSchema.optional(),
  difficultyNote: optionalText(SHEET_DIFFICULTY_NOTE_MAX_LENGTH, 'Ghi chú độ khó').optional(),
  description: optionalText(SHEET_DESCRIPTION_MAX_LENGTH, 'Mô tả').optional(),
  lyricsChords: lyricsChordsSchema.optional(),
  youtubeUrl: youtubeUrlSchema.optional(),
  genreIds: genreIdsSchema.optional(),
};

const UNKNOWN_KEY_ERROR = 'Trường này không được phép gửi lên.';

/** `POST /admin/sheets` — luôn tạo ở trạng thái DRAFT. Bắt buộc: `title`, `composerId`, `level`. */
export const createSheetSchema = z.strictObject(sheetFields, { error: UNKNOWN_KEY_ERROR });
export type CreateSheetRequest = z.input<typeof createSheetSchema>;
export type CreateSheetBody = z.output<typeof createSheetSchema>;

/** `PATCH /admin/sheets/:id` — mọi trường tuỳ chọn; `null` xoá giá trị của trường tuỳ chọn. */
export const updateSheetSchema = z.strictObject(
  {
    ...sheetFields,
    title: titleSchema.optional(),
    composerId: sheetFields.composerId.optional(),
    level: levelSchema.optional(),
  },
  { error: UNKNOWN_KEY_ERROR },
);
export type UpdateSheetRequest = z.input<typeof updateSheetSchema>;
export type UpdateSheetBody = z.output<typeof updateSheetSchema>;

// ── List ─────────────────────────────────────────────────────

const pageMessage = 'Trang phải là số nguyên từ 1.';
const pageSizeMessage = `Kích thước trang phải từ 1 đến ${PAGE_SIZE_MAX}.`;

/** Query `GET /admin/sheets`: `q` tìm theo tiêu đề (không phân biệt hoa thường và dấu), lọc Level/Status/Composer. */
export const sheetListQuerySchema = z.object({
  q: z
    .string()
    .trim()
    .max(SHEET_TITLE_MAX_LENGTH, { error: `Từ khoá tối đa ${SHEET_TITLE_MAX_LENGTH} ký tự.` })
    .optional()
    .transform((value) => value || undefined),
  level: levelSchema.optional(),
  status: sheetStatusSchema.optional(),
  composerId: z.uuid({ error: 'composerId không hợp lệ.' }).optional(),
  page: z.coerce
    .number({ error: pageMessage })
    .int({ error: pageMessage })
    .min(1, { error: pageMessage })
    .max(1_000_000, { error: 'Trang quá lớn.' })
    .default(1),
  pageSize: z.coerce
    .number({ error: pageSizeMessage })
    .int({ error: pageSizeMessage })
    .min(1, { error: pageSizeMessage })
    .max(PAGE_SIZE_MAX, { error: pageSizeMessage })
    .default(PAGE_SIZE_DEFAULT),
});
export type SheetListQueryInput = z.input<typeof sheetListQuerySchema>;
export type SheetListQuery = z.output<typeof sheetListQuerySchema>;

// ── Response ─────────────────────────────────────────────────

const refSchema = z.object({ id: z.string(), name: z.string() });

/** Ảnh một trang của PDF hiện hành (URL public đã resolve). */
export const sheetPageSchema = z.object({ pageNumber: z.number().int().positive(), url: z.string() });
export type SheetPage = z.infer<typeof sheetPageSchema>;

/** Thông tin PDF hiện hành. Không bao giờ chứa key hay URL của vùng private. */
export const sheetPdfSchema = z.object({
  originalName: z.string().nullable(),
  size: z.number().int().nonnegative(),
  uploadedAt: z.string(),
});
export type SheetPdf = z.infer<typeof sheetPdfSchema>;

export const sheetSchema = z.object({
  id: z.string(),
  publicId: z.number().int().positive(),
  slug: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  composer: refSchema,
  series: refSchema.nullable(),
  level: levelSchema,
  difficultyScore: z.number().int().min(DIFFICULTY_MIN).max(DIFFICULTY_MAX).nullable(),
  difficultyNote: z.string().nullable(),
  description: z.string().nullable(),
  lyricsChords: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  genres: z.array(refSchema),
  hasSheet: z.boolean(),
  hasChords: z.boolean(),
  hasMidi: z.boolean(),
  hasMp3: z.boolean(),
  hasVideo: z.boolean(),
  pageCount: z.number().int().nonnegative(),
  /** Thumbnail (trang 1) của PDF hiện hành, URL public; `null` khi chưa có PDF. */
  thumbnailUrl: z.string().nullable(),
  /** Ảnh từng trang của PDF hiện hành, theo thứ tự trang. */
  pages: z.array(sheetPageSchema),
  pdf: sheetPdfSchema.nullable(),
  viewCount: z.number().int().nonnegative(),
  isHot: z.boolean(),
  status: sheetStatusSchema,
  firstPublishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Sheet = z.infer<typeof sheetSchema>;

export const sheetListItemSchema = z.object({
  id: z.string(),
  publicId: z.number().int().positive(),
  title: z.string(),
  slug: z.string(),
  level: levelSchema,
  status: sheetStatusSchema,
  composer: refSchema,
  isHot: z.boolean(),
  updatedAt: z.string(),
});
export type SheetListItem = z.infer<typeof sheetListItemSchema>;
