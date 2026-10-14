import { z } from 'zod';
import { parseYoutubeUrl } from './sheet';

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
const published = z.boolean({ error: 'isPublished phải là true hoặc false.' });

/** Nhánh, level, section: tiêu đề + mô tả + công khai. Cha chỉ có khi tạo (không đổi cha sau này). */
export const trackBodySchema = z.object({ title: title('tên nhánh'), description, isPublished: published.default(false) });
export type TrackBody = z.infer<typeof trackBodySchema>;

export const levelBodySchema = z.object({ title: title('tên level'), description, isPublished: published.default(false) });
export type LevelBody = z.infer<typeof levelBodySchema>;
export const createLevelBodySchema = levelBodySchema.extend({ trackId: z.uuid({ error: 'Nhánh không hợp lệ.' }) });
export type CreateLevelBody = z.infer<typeof createLevelBodySchema>;

export const sectionBodySchema = z.object({ title: title('tên section'), description, isPublished: published.default(false) });
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
  youtubeUrl: lessonYoutubeSchema,
  content: z
    .string({ error: `Nội dung tối đa ${LESSON_CONTENT_MAX} ký tự.` })
    .max(LESSON_CONTENT_MAX, { error: `Nội dung tối đa ${LESSON_CONTENT_MAX} ký tự.` })
    .refine(NO_NUL.test, { error: NO_NUL_ERROR })
    .default(''),
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
  youtubeUrl: z.string().nullable(),
  content: z.string(),
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
  description: z.string(),
  isPublished: z.boolean(),
  sortOrder: z.number().int(),
};
export const adminSectionSchema = z.object({ ...nodeBase, levelId: z.string(), lessons: z.array(adminLessonSchema) });
export const adminLevelSchema = z.object({ ...nodeBase, trackId: z.string(), sections: z.array(adminSectionSchema) });
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
