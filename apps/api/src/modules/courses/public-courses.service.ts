import { Injectable } from '@nestjs/common';
import type {
  CourseLocale,
  LessonFull,
  PublicLesson,
  PublicTrackCard,
  PublicTrackTree,
} from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { StorageService } from '../media/storage.service';
import { CourseAccessService } from './course-access.service';
import { LESSON_NOT_FOUND, ORDER, TRACK_NOT_FOUND, VISIBLE_LESSON } from './course-helpers';

/** Bản tiếng Anh nếu có (và locale là en), không thì tiếng Việt: chọn từng trường một. */
const pick = (locale: CourseLocale, vi: string, en: string | null): string => (locale === 'en' && en ? en : vi);

/** Đọc công khai khoá học: chỉ phần đã công khai ở đủ bốn cấp. Không bao giờ lộ khoá private hay tên file gốc. */
@Injectable()
export class PublicCoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly access: CourseAccessService,
  ) {}

  /** Các nhánh đã công khai kèm số bài công khai (thẻ ở `/courses`). */
  async listTracks(locale: CourseLocale = 'vi'): Promise<PublicTrackCard[]> {
    const tracks = await this.prisma.courseTrack.findMany({ where: { isPublished: true }, orderBy: ORDER });
    return Promise.all(
      tracks.map(async (t) => ({
        slug: t.slug,
        title: pick(locale, t.title, t.titleEn),
        description: pick(locale, t.description, t.descriptionEn),
        lessonCount: await this.countVisible(t.id),
      })),
    );
  }

  async tree(slug: string, locale: CourseLocale = 'vi'): Promise<PublicTrackTree> {
    const track = await this.prisma.courseTrack.findFirst({ where: { slug, isPublished: true } });
    if (!track) throw notFound(TRACK_NOT_FOUND);
    const levels = await this.visibleLevels(track.id);
    const enforced = await this.access.enforcementOn();
    return {
      slug: track.slug,
      title: pick(locale, track.title, track.titleEn),
      description: pick(locale, track.description, track.descriptionEn),
      lessonCount: levels.reduce((n, l) => n + l.sections.reduce((m, s) => m + s.lessons.length, 0), 0),
      levels: levels.map((level) => ({
        id: level.id,
        title: pick(locale, level.title, level.titleEn),
        description: pick(locale, level.description, level.descriptionEn),
        sections: level.sections.map((section) => ({
          id: section.id,
          title: pick(locale, section.title, section.titleEn),
          description: pick(locale, section.description, section.descriptionEn),
          lessons: section.lessons.map((lesson) => ({
            id: lesson.id,
            title: pick(locale, lesson.title, lesson.titleEn),
            durationMinutes: lesson.durationMinutes,
            hasVideo: lesson.youtubeUrl !== null,
            hasMusic: lesson.noteJsonKey !== null,
            locked: enforced && !lesson.isFreePreview,
          })),
        })),
      })),
    };
  }

  /** Chi tiết một bài công khai; bài ẩn (bất kỳ cấp nào), bài không thuộc `trackSlug` hoặc id sai dạng → 404. */
  async lesson(trackSlug: string, id: string, locale: CourseLocale = 'vi'): Promise<PublicLesson> {
    const row = await this.prisma.courseLesson.findFirst({
      where: { id, ...VISIBLE_LESSON, section: { ...VISIBLE_LESSON.section, level: { ...VISIBLE_LESSON.section.level, track: { isPublished: true, slug: trackSlug } } } },
      include: { section: { include: { level: { include: { track: true } } } } },
    });
    if (!row) throw notFound(LESSON_NOT_FOUND);
    const { section } = row;
    const { level } = section;
    const flat = (await this.visibleLevels(level.track.id)).flatMap((l) => l.sections.flatMap((s) => s.lessons));
    const at = flat.findIndex((l) => l.id === row.id);
    const neighbor = (i: number) => (flat[i] ? { id: flat[i]!.id, title: pick(locale, flat[i]!.title, flat[i]!.titleEn) } : null);
    const locked = (await this.access.enforcementOn()) && !row.isFreePreview;
    return {
      id: row.id,
      title: pick(locale, row.title, row.titleEn),
      // Bài khoá: che video/nhạc/nội dung (HTML công khai được cache dùng chung); bản đầy đủ chỉ qua `full()` cho khách có gói.
      ...(locked ? { youtubeUrl: null, content: '', midi: null } : this.body(row, locale)),
      durationMinutes: row.durationMinutes,
      locked,
      track: { slug: level.track.slug, title: pick(locale, level.track.title, level.track.titleEn) },
      level: { id: level.id, title: pick(locale, level.title, level.titleEn) },
      section: { id: section.id, title: pick(locale, section.title, section.titleEn) },
      prev: at > 0 ? neighbor(at - 1) : null,
      next: at >= 0 ? neighbor(at + 1) : null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  /** Nội dung đầy đủ của bài (video, nhạc, nội dung theo locale) cho khách đã qua kiểm tra quyền; bài ẩn → 404. */
  async full(id: string, locale: CourseLocale = 'vi'): Promise<LessonFull> {
    const row = await this.prisma.courseLesson.findFirst({ where: { id, ...VISIBLE_LESSON } });
    if (!row) throw notFound(LESSON_NOT_FOUND);
    return this.body(row, locale);
  }

  private body(
    row: { youtubeUrl: string | null; content: string; contentEn: string | null; noteJsonKey: string | null; midiDurationSeconds: number | null; midiNoteCount: number | null },
    locale: CourseLocale,
  ): LessonFull {
    return {
      youtubeUrl: row.youtubeUrl,
      content: pick(locale, row.content, row.contentEn),
      midi: row.noteJsonKey
        ? { noteJsonUrl: this.storage.publicUrl(row.noteJsonKey), durationSeconds: row.midiDurationSeconds ?? 0, noteCount: row.midiNoteCount ?? 0 }
        : null,
    };
  }

  /** Dữ liệu cho `sitemap.xml`: nhánh công khai và bài công khai (đủ cả cha). */
  async sitemap(): Promise<{
    courseTracks: { slug: string; updatedAt: string }[];
    courseLessons: { id: string; trackSlug: string; updatedAt: string }[];
  }> {
    const [tracks, lessons] = await Promise.all([
      this.prisma.courseTrack.findMany({ where: { isPublished: true }, orderBy: ORDER, select: { slug: true, updatedAt: true } }),
      this.prisma.courseLesson.findMany({
        where: VISIBLE_LESSON,
        select: { id: true, updatedAt: true, section: { select: { level: { select: { track: { select: { slug: true } } } } } } },
        orderBy: [{ id: 'asc' }],
      }),
    ]);
    return {
      courseTracks: tracks.map((t) => ({ slug: t.slug, updatedAt: t.updatedAt.toISOString() })),
      courseLessons: lessons.map((l) => ({ id: l.id, trackSlug: l.section.level.track.slug, updatedAt: l.updatedAt.toISOString() })),
    };
  }

  private countVisible(trackId: string): Promise<number> {
    return this.prisma.courseLesson.count({
      where: { isPublished: true, section: { isPublished: true, level: { isPublished: true, trackId, track: { isPublished: true } } } },
    });
  }

  /** Level → section → bài đã công khai của một nhánh, đúng thứ tự `sort_order`. */
  private visibleLevels(trackId: string) {
    return this.prisma.courseLevel.findMany({
      where: { trackId, isPublished: true },
      orderBy: ORDER,
      include: {
        sections: {
          where: { isPublished: true },
          orderBy: ORDER,
          include: {
            // Không kéo `content` (tới 20.000 ký tự/bài): cây và prev/next chỉ cần tiêu đề và cờ.
            lessons: {
              where: { isPublished: true },
              orderBy: ORDER,
              select: { id: true, title: true, titleEn: true, durationMinutes: true, youtubeUrl: true, noteJsonKey: true, isFreePreview: true },
            },
          },
        },
      },
    });
  }
}
