import { z } from 'zod';
import { parseYoutubeUrl, youtubeCanonicalUrl } from './sheet';

/** Giới hạn nội dung khoá học (C1); API, admin và web dùng chung. */
export const COURSE_TITLE_MAX = 120;
export const COURSE_DESCRIPTION_MAX = 500;
export const LESSON_CONTENT_MAX = 20_000;
export const LESSON_MAX_DURATION_MINUTES = 600;

/** Bốn cấp của cây khoá học (dùng trong đường dẫn `/admin/courses/:kind/...`). */
export const COURSE_KINDS = ['tracks', 'levels', 'sections', 'lessons'] as const;
export type CourseKind = (typeof COURSE_KINDS)[number];
export const courseKindSchema = z.enum(COURSE_KINDS);

// Postgres không lưu được NUL trong text (sẽ thành 500): chặn ở schema.
const NO_NUL = {
  test: (v: string) => !v.includes(String.fromCharCode(0)),
};
const NO_NUL_ERROR = 'Nội dung chứa ký tự không hợp lệ.';
const title = (label: string) =>
  z
    .string({ error: `Vui lòng nhập ${label}.` })
    .trim()
    .refine(NO_NUL.test, { error: NO_NUL_ERROR })
    .min(1, { error: `Vui lòng nhập ${label}.` })
    .max(COURSE_TITLE_MAX, { error: `${label[0]!.toUpperCase()}${label.slice(1)} tối đa ${COURSE_TITLE_MAX} ký tự.` });
const description = z
  .string({ error: `Mô tả tối đa ${COURSE_DESCRIPTION_MAX} ký tự.` })
  .trim()
  .refine(NO_NUL.test, { error: NO_NUL_ERROR })
  .max(COURSE_DESCRIPTION_MAX, { error: `Mô tả tối đa ${COURSE_DESCRIPTION_MAX} ký tự.` })
  .default('');
/** Trường tiếng Anh tuỳ chọn: rỗng/chỉ khoảng trắng/vắng → null (web tiếng Anh dùng bản tiếng Việt). */
const optionalEnglish = (max: number, label: string, { trim = true }: { trim?: boolean } = {}) =>
  z
    .string({ error: `${label} phải là chuỗi, tối đa ${max} ký tự.` })
    .refine(NO_NUL.test, { error: NO_NUL_ERROR })
    .max(max, { error: `${label} tối đa ${max} ký tự.` })
    .nullish()
    // Markdown giữ nguyên khoảng trắng đầu dòng (khối code thụt lề); chỉ nội dung toàn khoảng trắng mới thành null.
    .transform((value) => (value?.trim() ? (trim ? value.trim() : value) : null));
const titleEn = optionalEnglish(COURSE_TITLE_MAX, 'Tên tiếng Anh');
const descriptionEn = optionalEnglish(COURSE_DESCRIPTION_MAX, 'Mô tả tiếng Anh');
const published = z.boolean({ error: 'isPublished phải là true hoặc false.' });

/** Nhánh, level, section: tiêu đề + mô tả + công khai. Cha chỉ có khi tạo (không đổi cha sau này). */
export const trackBodySchema = z.object({ title: title('tên nhánh'), titleEn, description, descriptionEn, isPublished: published.default(false) });
export type TrackBody = z.infer<typeof trackBodySchema>;

/** Level chọn từ danh sách cố định (tên chuẩn vi/en) hoặc "Khác" (`preset` null, tự đặt tên). */
export const COURSE_LEVEL_PRESETS = ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'] as const;
export type CourseLevelPreset = (typeof COURSE_LEVEL_PRESETS)[number];
export const COURSE_LEVEL_PRESET_LABELS: Record<CourseLevelPreset, { vi: string; en: string }> = {
  BEGINNER: { vi: 'Sơ cấp', en: 'Beginner' },
  INTERMEDIATE: { vi: 'Trung cấp', en: 'Intermediate' },
  ADVANCED: { vi: 'Cao cấp', en: 'Advanced' },
  EXPERT: { vi: 'Chuyên gia', en: 'Expert' },
};
export const courseLevelPresetSchema = z.enum(COURSE_LEVEL_PRESETS, { error: 'Mức level không hợp lệ.' });

const levelFields = z.object({
  preset: courseLevelPresetSchema.nullish().transform((value) => value ?? null),
  // Tên chỉ bắt buộc khi không chọn mức có sẵn ("Khác"); có mức thì tên do mức quyết định.
  title: z
    .string()
    .trim()
    .refine(NO_NUL.test, { error: NO_NUL_ERROR })
    .max(COURSE_TITLE_MAX, { error: `Tên level tối đa ${COURSE_TITLE_MAX} ký tự.` })
    .optional()
    .default(''),
  titleEn,
  description,
  descriptionEn,
  isPublished: published.default(false),
});
type LevelFields = z.output<typeof levelFields>;
const requireLevelTitle = (value: LevelFields, ctx: z.RefinementCtx) => {
  if (!value.preset && !value.title) ctx.addIssue({ code: 'custom', path: ['title'], message: 'Vui lòng nhập tên level.' });
};
/** Có mức → `title`/`titleEn` đặt theo nhãn chuẩn (bất kể client gửi gì). */
const applyLevelPreset = (value: LevelFields): LevelFields =>
  value.preset ? { ...value, title: COURSE_LEVEL_PRESET_LABELS[value.preset].vi, titleEn: COURSE_LEVEL_PRESET_LABELS[value.preset].en } : value;
export const levelBodySchema = levelFields.superRefine(requireLevelTitle).transform(applyLevelPreset);
export type LevelBody = z.infer<typeof levelBodySchema>;
export const createLevelBodySchema = levelFields
  .extend({ trackId: z.uuid({ error: 'Nhánh không hợp lệ.' }) })
  .superRefine(requireLevelTitle)
  .transform((value) => ({ ...applyLevelPreset(value), trackId: value.trackId }));
export type CreateLevelBody = z.infer<typeof createLevelBodySchema>;

export const sectionBodySchema = z.object({ title: title('tên section'), titleEn, description, descriptionEn, isPublished: published.default(false) });
export type SectionBody = z.infer<typeof sectionBodySchema>;
export const createSectionBodySchema = sectionBodySchema.extend({ levelId: z.uuid({ error: 'Level không hợp lệ.' }) });
export type CreateSectionBody = z.infer<typeof createSectionBodySchema>;

/** Link YouTube tuỳ chọn: rỗng/null = không có; có thì phải hợp lệ (`parseYoutubeUrl`). */
export const lessonYoutubeSchema = z
  .string()
  .trim()
  .nullish()
  .transform((value) => (value ? value : null))
  .refine((value) => value === null || parseYoutubeUrl(value) !== null, { error: 'Link phải là link YouTube hợp lệ.' });

/** Bài học: video, nhạc (upload MIDI qua route riêng) và nội dung đều tuỳ chọn; bài công khai cần ít nhất một. */
export const lessonBodySchema = z.object({
  title: title('tên bài'),
  titleEn,
  youtubeUrl: lessonYoutubeSchema,
  content: z
    .string({ error: `Nội dung tối đa ${LESSON_CONTENT_MAX} ký tự.` })
    .max(LESSON_CONTENT_MAX, { error: `Nội dung tối đa ${LESSON_CONTENT_MAX} ký tự.` })
    .refine(NO_NUL.test, { error: NO_NUL_ERROR })
    .default(''),
  contentEn: optionalEnglish(LESSON_CONTENT_MAX, 'Nội dung tiếng Anh', { trim: false }),
  durationMinutes: z
    .number({ error: `Thời lượng phải là số phút từ 1 đến ${LESSON_MAX_DURATION_MINUTES}.` })
    .int({ error: `Thời lượng phải là số phút từ 1 đến ${LESSON_MAX_DURATION_MINUTES}.` })
    .min(1, { error: `Thời lượng phải là số phút từ 1 đến ${LESSON_MAX_DURATION_MINUTES}.` })
    .max(LESSON_MAX_DURATION_MINUTES, { error: `Thời lượng phải là số phút từ 1 đến ${LESSON_MAX_DURATION_MINUTES}.` })
    .nullish()
    .transform((value) => value ?? null),
  isPublished: published.default(false),
});
export type LessonBody = z.infer<typeof lessonBodySchema>;
export const createLessonBodySchema = lessonBodySchema.extend({ sectionId: z.uuid({ error: 'Section không hợp lệ.' }) });
export type CreateLessonBody = z.infer<typeof createLessonBodySchema>;

/** Thông báo khi bài công khai không có phần nào. */
export const LESSON_NEEDS_CONTENT_ERROR = 'Bài công khai cần ít nhất một trong video, nhạc (MIDI) hoặc nội dung.';

export const moveBodySchema = z.object({ direction: z.enum(['up', 'down'], { error: 'Hướng phải là up hoặc down.' }) });
export type MoveBody = z.infer<typeof moveBodySchema>;

export const setCoursePublishedBodySchema = z.object({ isPublished: published });
export type SetCoursePublishedBody = z.infer<typeof setCoursePublishedBodySchema>;

/** Nhạc của bài học (từ file MIDI đã upload). `noteJsonUrl` là URL public của note-JSON, không lộ file gốc. */
export const lessonMidiSchema = z.object({
  noteJsonUrl: z.string(),
  durationSeconds: z.number().nonnegative(),
  noteCount: z.number().int().nonnegative(),
});
export type LessonMidi = z.infer<typeof lessonMidiSchema>;

// ── Admin ────────────────────────────────────────────────────────────────

export const adminLessonSchema = z.object({
  id: z.string(),
  sectionId: z.string(),
  title: z.string(),
  titleEn: z.string().nullable(),
  youtubeUrl: z.string().nullable(),
  content: z.string(),
  contentEn: z.string().nullable(),
  durationMinutes: z.number().int().nullable(),
  midi: lessonMidiSchema.extend({ originalName: z.string().nullable() }).nullable(),
  isPublished: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminLesson = z.infer<typeof adminLessonSchema>;

const nodeBase = {
  id: z.string(),
  title: z.string(),
  titleEn: z.string().nullable(),
  description: z.string(),
  descriptionEn: z.string().nullable(),
  isPublished: z.boolean(),
  sortOrder: z.number().int(),
};
export const adminSectionSchema = z.object({ ...nodeBase, levelId: z.string(), lessons: z.array(adminLessonSchema) });
export const adminLevelSchema = z.object({ ...nodeBase, preset: courseLevelPresetSchema.nullable(), trackId: z.string(), sections: z.array(adminSectionSchema) });
export const adminTrackSchema = z.object({
  ...nodeBase,
  slug: z.string(),
  /** Số bài (mọi trạng thái) và số bài đang công khai (đủ cả cha) của nhánh. */
  lessonCount: z.number().int().nonnegative(),
  publishedLessonCount: z.number().int().nonnegative(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AdminSection = z.infer<typeof adminSectionSchema>;
export type AdminLevel = z.infer<typeof adminLevelSchema>;
export type AdminTrack = z.infer<typeof adminTrackSchema>;

/** `GET /admin/courses/tracks/:id/tree`: cây đầy đủ của một nhánh (cả phần nháp). */
export const adminCourseTreeSchema = z.object({ track: adminTrackSchema, levels: z.array(adminLevelSchema) });
export type AdminCourseTree = z.infer<typeof adminCourseTreeSchema>;

// ── Công khai ────────────────────────────────────────────────────────────

/** Thẻ nhánh ở `/courses`: chỉ nhánh đã công khai, `lessonCount` = số bài công khai. */
export const publicTrackCardSchema = z.object({
  slug: z.string(),
  title: z.string(),
  description: z.string(),
  lessonCount: z.number().int().nonnegative(),
});
export type PublicTrackCard = z.infer<typeof publicTrackCardSchema>;

export const publicLessonItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  durationMinutes: z.number().int().nullable(),
  hasVideo: z.boolean(),
  hasMusic: z.boolean(),
});
export type PublicLessonItem = z.infer<typeof publicLessonItemSchema>;

/** `GET /courses/:trackSlug`: chỉ phần đã công khai. */
export const publicTrackTreeSchema = publicTrackCardSchema.extend({
  levels: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      description: z.string(),
      sections: z.array(
        z.object({ id: z.string(), title: z.string(), description: z.string(), lessons: z.array(publicLessonItemSchema) }),
      ),
    }),
  ),
});
export type PublicTrackTree = z.infer<typeof publicTrackTreeSchema>;

const neighborSchema = z.object({ id: z.string(), title: z.string() });
/** `GET /courses/:trackSlug/lessons/:id`. */
export const publicLessonSchema = z.object({
  id: z.string(),
  title: z.string(),
  youtubeUrl: z.string().nullable(),
  content: z.string(),
  durationMinutes: z.number().int().nullable(),
  midi: lessonMidiSchema.nullable(),
  track: z.object({ slug: z.string(), title: z.string() }),
  level: z.object({ id: z.string(), title: z.string() }),
  section: z.object({ id: z.string(), title: z.string() }),
  prev: neighborSchema.nullable(),
  next: neighborSchema.nullable(),
  updatedAt: z.string(),
});
export type PublicLesson = z.infer<typeof publicLessonSchema>;

/** `?locale=` của API công khai khoá học; vắng = tiếng Việt. */
export const COURSE_LOCALES = ['vi', 'en'] as const;
export type CourseLocale = (typeof COURSE_LOCALES)[number];
export const courseLocaleQuerySchema = z.object({
  // Chấp nhận hoa/thường và rỗng (= vi) để client cũ không bị 400; giá trị khác vẫn bị từ chối.
  locale: z
    .preprocess((v) => (typeof v === 'string' ? v.trim().toLowerCase() || undefined : v), z.enum(COURSE_LOCALES, { error: 'locale phải là vi hoặc en.' }).optional())
    .transform((v) => v ?? 'vi'),
});

/** `GET /customer/courses/progress` (C2): chỉ tính bài đang công khai ở đủ bốn cấp. */
export const courseProgressSchema = z.object({
  tracks: z.array(z.object({ slug: z.string(), completed: z.number().int().nonnegative() })),
  lessonIds: z.array(z.string()),
});
export type CourseProgress = z.infer<typeof courseProgressSchema>;

/** `PUT /customer/courses/lessons/:id/completion`. */
export const setLessonCompletionSchema = z.object({ completed: z.boolean({ error: 'completed phải là true hoặc false.' }) });
export type SetLessonCompletionRequest = z.infer<typeof setLessonCompletionSchema>;
export const lessonCompletionSchema = z.object({ completed: z.boolean() });
export type LessonCompletion = z.infer<typeof lessonCompletionSchema>;

// ── Nộp bài (C3) ─────────────────────────────────────────────

const DRIVE_ID = /^[A-Za-z0-9_-]{10,100}$/;

/** Lấy id file từ link Google Drive (`/file/d/ID/...`, `/open?id=ID`, `/uc?id=ID`). Thư mục, domain khác → null. */
export function parseDriveUrl(input: string): string | null {
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
  if (url.hostname.toLowerCase() !== 'drive.google.com') return null;
  let id: string | null | undefined;
  const match = /^\/file\/(?:u\/\d+\/)?d\/([^/]+)(?:\/|$)/.exec(url.pathname);
  if (match) id = match[1];
  else if (url.pathname === '/open' || url.pathname === '/uc') id = url.searchParams.get('id');
  return id && DRIVE_ID.test(id) ? id : null;
}

export const driveCanonicalUrl = (id: string) => `https://drive.google.com/file/d/${id}/view`;

export const SUBMISSION_KINDS = ['YOUTUBE', 'DRIVE'] as const;
export type SubmissionKind = (typeof SUBMISSION_KINDS)[number];
export const SUBMISSION_NOTE_MAX = 500;
export const SUBMISSION_URL_ERROR = 'Chỉ nhận link video YouTube hoặc file Google Drive.';

/** Link bài nộp → `{kind, url}` dạng chuẩn; link lạ bị từ chối. */
export const submissionUrlSchema = z
  .string({ error: SUBMISSION_URL_ERROR })
  .trim()
  .max(2048, { error: SUBMISSION_URL_ERROR })
  .transform((value, ctx): { kind: SubmissionKind; url: string } => {
    const yt = parseYoutubeUrl(value);
    if (yt) return { kind: 'YOUTUBE', url: youtubeCanonicalUrl(yt) };
    const drive = parseDriveUrl(value);
    if (drive) return { kind: 'DRIVE', url: driveCanonicalUrl(drive) };
    ctx.issues.push({ code: 'custom', message: SUBMISSION_URL_ERROR, input: value });
    return z.NEVER;
  });

/** `PUT /customer/courses/lessons/:id/submission`. */
export const upsertSubmissionSchema = z
  .object({
    url: submissionUrlSchema,
    note: z
      .string({ error: `Ghi chú tối đa ${SUBMISSION_NOTE_MAX} ký tự.` })
      .trim()
      .max(SUBMISSION_NOTE_MAX, { error: `Ghi chú tối đa ${SUBMISSION_NOTE_MAX} ký tự.` })
      .refine((v) => !v.includes('\u0000'), { error: 'Ghi chú chứa ký tự không hợp lệ.' })
      .nullish()
      .transform((v) => v || null),
  })
  .strict();
export type UpsertSubmissionBody = z.infer<typeof upsertSubmissionSchema>;

export const setSubmissionHiddenSchema = z.object({ hidden: z.boolean({ error: 'hidden phải là true hoặc false.' }) }).strict();

const submissionBase = {
  id: z.string(),
  kind: z.enum(SUBMISSION_KINDS),
  url: z.string(),
  note: z.string().nullable(),
  isHidden: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
};
/** `GET/PUT /customer/courses/lessons/:id/submission`: bài nộp của chính khách (hoặc null). */
export const lessonSubmissionSchema = z.object({ submission: z.object(submissionBase).nullable() });
export type LessonSubmission = z.infer<typeof lessonSubmissionSchema>;
export type MySubmission = NonNullable<LessonSubmission['submission']>;

/** `GET /admin/courses/lessons/:id/submissions`. */
export const adminSubmissionSchema = z.object({
  ...submissionBase,
  customer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type AdminSubmission = z.infer<typeof adminSubmissionSchema>;

// ── Cộng đồng: đánh giá và bình luận (C4) ────────────────────

export const COMMENT_MAX = 1000;
export const COMMENT_MAX_LINKS = 2;
export const COMMENT_PAGE_SIZE = 20;
export const ADMIN_COMMENT_PAGE_SIZE = 30;

/** Số link (`http(s)://` hoặc `www.`) trong một đoạn văn bản. */
export function countLinks(text: string): number {
  return text.match(/(?:https?:\/\/|www\.)/gi)?.length ?? 0;
}

const COMMENT_ERROR = `Bình luận từ 1 đến ${COMMENT_MAX} ký tự, tối đa ${COMMENT_MAX_LINKS} link.`;
/** Bình luận văn bản thuần: chuẩn hoá xuống dòng, gộp ≥3 dòng trống liên tiếp, giới hạn độ dài và số link. */
export const commentTextSchema = z
  .string({ error: COMMENT_ERROR })
  .transform((v) => v.replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim())
  .pipe(
    z
      .string()
      .min(1, { error: COMMENT_ERROR })
      .max(COMMENT_MAX, { error: COMMENT_ERROR })
      .refine((v) => !v.includes('\u0000'), { error: COMMENT_ERROR })
      // Chỉ toàn ký tự vô hình (zero-width…) trông như bình luận trống.
      .refine((v) => v.replace(/[\s\u200B-\u200D\u2060\uFEFF]/g, '') !== '', { error: COMMENT_ERROR })
      .refine((v) => countLinks(v) <= COMMENT_MAX_LINKS, { error: COMMENT_ERROR }),
  );

/** `PUT /customer/courses/lessons/:id/rating`. */
export const ratingBodySchema = z
  .object({ stars: z.number({ error: 'Số sao phải từ 1 đến 5.' }).int({ error: 'Số sao phải từ 1 đến 5.' }).min(1, { error: 'Số sao phải từ 1 đến 5.' }).max(5, { error: 'Số sao phải từ 1 đến 5.' }) })
  .strict();
export type RatingBody = z.infer<typeof ratingBodySchema>;

/** `POST /customer/courses/lessons/:id/comments` (`parentId` = trả lời một bình luận gốc). */
export const createCommentSchema = z.object({ body: commentTextSchema, parentId: z.uuid({ error: 'Bình luận gốc không hợp lệ.' }).transform((v) => v.toLowerCase()).nullish().transform((v) => v ?? null) }).strict();
export type CreateCommentBody = z.infer<typeof createCommentSchema>;
/** `PATCH /customer/courses/comments/:id`. */
export const editCommentSchema = z.object({ body: commentTextSchema }).strict();
export const setCommentHiddenSchema = z.object({ hidden: z.boolean({ error: 'hidden phải là true hoặc false.' }) }).strict();

const commentBase = {
  id: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  authorName: z.string(),
  createdAt: z.string(),
  edited: z.boolean(),
};
export const publicCommentSchema = z.object(commentBase);
export type PublicComment = z.infer<typeof publicCommentSchema>;
export const publicThreadSchema = z.object({ ...commentBase, replies: z.array(publicCommentSchema) });
export type PublicThread = z.infer<typeof publicThreadSchema>;

/** `GET /courses/lessons/:id/community`: trung bình sao + bình luận công khai (gốc mới nhất trước, trả lời cũ trước). */
export const publicCommunitySchema = z.object({
  rating: z.object({ average: z.number().nullable(), count: z.number().int().nonnegative() }),
  comments: z.array(publicThreadSchema),
  nextCursor: z.string().nullable(),
});
export type PublicCommunity = z.infer<typeof publicCommunitySchema>;

/** Bình luận của chính khách (kể cả đang bị ẩn). */
export const myCommentSchema = z.object({ ...commentBase, isHidden: z.boolean() });
export type MyComment = z.infer<typeof myCommentSchema>;
/** `GET /customer/courses/lessons/:id/community/mine`. */
export const myCommunitySchema = z.object({ myRating: z.number().int().nullable(), comments: z.array(myCommentSchema) });
export type MyCommunity = z.infer<typeof myCommunitySchema>;
export const myRatingSchema = z.object({ myRating: z.number().int().nullable(), rating: publicCommunitySchema.shape.rating });
export type MyRating = z.infer<typeof myRatingSchema>;

/** `GET /admin/courses/comments?lessonId=&hidden=&cursor=&limit=`. */
export const adminCommentsQuerySchema = z.object({
  lessonId: z.uuid({ error: 'Bài học không hợp lệ.' }).transform((v) => v.toLowerCase()).optional(),
  hidden: z.enum(['true', 'false'], { error: 'hidden phải là true hoặc false.' }).transform((v) => v === 'true').optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(ADMIN_COMMENT_PAGE_SIZE),
});
export const adminCommentSchema = z.object({
  id: z.string(),
  lessonId: z.string(),
  lessonTitle: z.string(),
  parentId: z.string().nullable(),
  body: z.string(),
  isHidden: z.boolean(),
  /** Trả lời nằm dưới bình luận gốc đang bị ẩn (không hiện công khai dù chính nó không bị ẩn). */
  parentHidden: z.boolean(),
  edited: z.boolean(),
  createdAt: z.string(),
  customer: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type AdminComment = z.infer<typeof adminCommentSchema>;
export const adminCommentPageSchema = z.object({ items: z.array(adminCommentSchema), nextCursor: z.string().nullable() });
export type AdminCommentPage = z.infer<typeof adminCommentPageSchema>;
