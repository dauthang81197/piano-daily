import { Injectable } from '@nestjs/common';
import {
  type AdminCourseTree,
  type AdminLesson,
  type AdminLevel,
  type AdminSection,
  type AdminTrack,
  cacheTags,
  type CourseKind,
  createLessonBodySchema,
  createLevelBodySchema,
  createSectionBodySchema,
  lessonBodySchema,
  levelBodySchema,
  type MoveBody,
  sectionBodySchema,
  trackBodySchema,
} from '@piano-daily/shared';
import type { ZodType } from 'zod';
import { validationExceptionFactory } from '../../common/validation';
import type { CourseLesson, CourseLevel, CourseSection, CourseTrack, Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from '../catalog/cache-invalidator';
import { inUse, notFound } from '../catalog/catalog.helpers';
import { isPrismaError } from '../catalog/prisma-errors';
import { baseSlug, createWithUniqueSlug } from '../catalog/unique-slug';
import { StorageService } from '../media/storage.service';
import {
  assertLessonHasPart,
  LESSON_NOT_FOUND,
  LEVEL_NOT_FOUND,
  ORDER,
  SECTION_NOT_FOUND,
  TRACK_NOT_FOUND,
  VISIBLE_LESSON,
} from './course-helpers';

type Tx = Prisma.TransactionClient;
const PARENT_NOT_FOUND: Record<CourseKind, string> = {
  tracks: TRACK_NOT_FOUND,
  levels: TRACK_NOT_FOUND,
  sections: LEVEL_NOT_FOUND,
  lessons: SECTION_NOT_FOUND,
};
const NOT_FOUND: Record<CourseKind, string> = {
  tracks: TRACK_NOT_FOUND,
  levels: LEVEL_NOT_FOUND,
  sections: SECTION_NOT_FOUND,
  lessons: LESSON_NOT_FOUND,
};
const CHILDREN_MESSAGE: Record<CourseKind, string> = {
  tracks: 'Nhánh còn level. Hãy xoá hết level trước.',
  levels: 'Level còn section. Hãy xoá hết section trước.',
  sections: 'Section còn bài học. Hãy xoá hết bài học trước.',
  lessons: '',
};

/** Parse body theo schema; sai thì 400 `VALIDATION_FAILED` kèm lỗi theo trường (như pipe validate của Nest). */
export function parseBody<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw validationExceptionFactory(result.error.issues);
  return result.data;
}

const iso = (d: Date) => d.toISOString();

/**
 * Soạn khoá học cho admin (C1): CRUD bốn cấp, đổi thứ tự, kiểm tra cha, quy tắc "bài công khai cần ít nhất một phần".
 * Nơi DUY NHẤT ghi `course_tracks/levels/sections/lessons`. Mọi thao tác ghi thành công revalidate tag web `courses`.
 */
@Injectable()
export class CoursesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidator,
    private readonly storage: StorageService,
  ) {}

  // ── Đọc (admin) ────────────────────────────────────────────────────────

  /** Mọi nhánh (cả nháp) kèm số bài. */
  async listTracks(): Promise<AdminTrack[]> {
    const tracks = await this.prisma.courseTrack.findMany({ orderBy: ORDER });
    return Promise.all(tracks.map((t) => this.toTrack(t)));
  }

  /** Cây đầy đủ của một nhánh (cả phần nháp), đúng thứ tự. */
  async tree(trackId: string): Promise<AdminCourseTree> {
    const track = await this.prisma.courseTrack.findUnique({
      where: { id: trackId },
      include: {
        levels: { orderBy: ORDER, include: { sections: { orderBy: ORDER, include: { lessons: { orderBy: ORDER } } } } },
      },
    });
    if (!track) throw notFound(TRACK_NOT_FOUND);
    return {
      track: await this.toTrack(track),
      levels: track.levels.map(
        (level): AdminLevel => ({
          ...node(level),
          trackId: level.trackId,
          sections: level.sections.map(
            (section): AdminSection => ({
              ...node(section),
              levelId: section.levelId,
              lessons: section.lessons.map((lesson) => this.toLesson(lesson)),
            }),
          ),
        }),
      ),
    };
  }

  // ── Tạo ────────────────────────────────────────────────────────────────

  async create(kind: CourseKind, raw: unknown): Promise<AdminTrack | AdminLevel | AdminSection | AdminLesson> {
    try {
      const result = await this.createRow(kind, raw);
      this.revalidate();
      return result;
    } catch (err) {
      // Cha bị xoá giữa lúc kiểm tra và lúc chèn: FK RESTRICT báo P2003 -> 404 như cha không tồn tại.
      if (isPrismaError(err, 'P2003')) throw notFound(PARENT_NOT_FOUND[kind]);
      throw err;
    }
  }

  private async createRow(kind: CourseKind, raw: unknown): Promise<AdminTrack | AdminLevel | AdminSection | AdminLesson> {
    if (kind === 'tracks') {
      const body = parseBody(trackBodySchema, raw);
      const sortOrder = ((await this.prisma.courseTrack.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
      const row = await createWithUniqueSlug(
        async (c) => (await this.prisma.courseTrack.findMany({ where: { slug: { in: c } }, select: { slug: true } })).map((r) => r.slug),
        baseSlug(body.title, 'khoa-hoc'),
        (slug) => this.prisma.courseTrack.create({ data: { ...body, slug, sortOrder } }),
      );
      return this.toTrack(row);
    }
    if (kind === 'levels') {
      const { trackId, ...body } = parseBody(createLevelBodySchema, raw);
      await this.requireParent(this.prisma.courseTrack.findUnique({ where: { id: trackId }, select: { id: true } }), TRACK_NOT_FOUND);
      const sortOrder = ((await this.prisma.courseLevel.aggregate({ where: { trackId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
      const row = await this.prisma.courseLevel.create({ data: { ...body, trackId, sortOrder } });
      return { ...node(row), trackId, sections: [] };
    }
    if (kind === 'sections') {
      const { levelId, ...body } = parseBody(createSectionBodySchema, raw);
      await this.requireParent(this.prisma.courseLevel.findUnique({ where: { id: levelId }, select: { id: true } }), LEVEL_NOT_FOUND);
      const sortOrder = ((await this.prisma.courseSection.aggregate({ where: { levelId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
      const row = await this.prisma.courseSection.create({ data: { ...body, levelId, sortOrder } });
      return { ...node(row), levelId, lessons: [] };
    }
    const { sectionId, ...body } = parseBody(createLessonBodySchema, raw);
    await this.requireParent(this.prisma.courseSection.findUnique({ where: { id: sectionId }, select: { id: true } }), SECTION_NOT_FOUND);
    assertLessonHasPart({ isPublished: body.isPublished, youtubeUrl: body.youtubeUrl, content: body.content, hasMidi: false });
    const sortOrder = ((await this.prisma.courseLesson.aggregate({ where: { sectionId }, _max: { sortOrder: true } }))._max.sortOrder ?? -1) + 1;
    return this.toLesson(await this.prisma.courseLesson.create({ data: { ...body, sectionId, sortOrder } }));
  }

  // ── Sửa / công khai ────────────────────────────────────────────────────

  async update(kind: CourseKind, id: string, raw: unknown): Promise<AdminTrack | AdminLevel | AdminSection | AdminLesson> {
    try {
      const result = await this.updateRow(kind, id, raw);
      this.revalidate();
      return result;
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND[kind]);
      throw err;
    }
  }

  private async updateRow(kind: CourseKind, id: string, raw: unknown): Promise<AdminTrack | AdminLevel | AdminSection | AdminLesson> {
    if (kind === 'tracks') return this.toTrack(await this.prisma.courseTrack.update({ where: { id }, data: parseBody(trackBodySchema, raw) }));
    if (kind === 'levels') {
      const row = await this.prisma.courseLevel.update({ where: { id }, data: parseBody(levelBodySchema, raw) });
      return { ...node(row), trackId: row.trackId, sections: [] };
    }
    if (kind === 'sections') {
      const row = await this.prisma.courseSection.update({ where: { id }, data: parseBody(sectionBodySchema, raw) });
      return { ...node(row), levelId: row.levelId, lessons: [] };
    }
    const body = parseBody(lessonBodySchema, raw);
    return this.prisma.$transaction(async (tx) => {
      const current = await this.lockLesson(tx, id);
      assertLessonHasPart({ isPublished: body.isPublished, youtubeUrl: body.youtubeUrl, content: body.content, hasMidi: current.noteJsonKey !== null });
      return this.toLesson(await tx.courseLesson.update({ where: { id }, data: body }));
    });
  }

  /** Bật/tắt công khai riêng một nút (bài: vẫn phải có ít nhất một phần). */
  async setPublished(kind: CourseKind, id: string, isPublished: boolean): Promise<AdminTrack | AdminLevel | AdminSection | AdminLesson> {
    try {
      let result: AdminTrack | AdminLevel | AdminSection | AdminLesson;
      if (kind === 'tracks') result = await this.toTrack(await this.prisma.courseTrack.update({ where: { id }, data: { isPublished } }));
      else if (kind === 'levels') {
        const row = await this.prisma.courseLevel.update({ where: { id }, data: { isPublished } });
        result = { ...node(row), trackId: row.trackId, sections: [] };
      } else if (kind === 'sections') {
        const row = await this.prisma.courseSection.update({ where: { id }, data: { isPublished } });
        result = { ...node(row), levelId: row.levelId, lessons: [] };
      } else {
        result = await this.prisma.$transaction(async (tx) => {
          const current = await this.lockLesson(tx, id);
          assertLessonHasPart({ isPublished, youtubeUrl: current.youtubeUrl, content: current.content, hasMidi: current.noteJsonKey !== null });
          return this.toLesson(await tx.courseLesson.update({ where: { id }, data: { isPublished } }));
        });
      }
      this.revalidate();
      return result;
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND[kind]);
      throw err;
    }
  }

  // ── Đổi thứ tự / xoá ───────────────────────────────────────────────────

  /**
   * Hoán đổi với anh em liền kề trong cùng cha. Chuẩn hoá `sort_order` của cả nhóm về 0..n-1 (xử lý trùng/khuyết số) rồi
   * đổi chỗ, trong một transaction có khoá advisory theo cha để hai admin không đua nhau. Mục đầu/cuối: không đổi.
   */
  async move(kind: CourseKind, id: string, { direction }: MoveBody): Promise<void> {
    const parent = await this.parentOf(kind, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`course:${kind}:${parent ?? 'root'}`}))`;
      const siblings = await this.siblings(tx, kind, parent);
      const from = siblings.findIndex((s) => s.id === id);
      if (from < 0) throw notFound(NOT_FOUND[kind]);
      const to = direction === 'up' ? from - 1 : from + 1;
      if (to >= 0 && to < siblings.length) [siblings[from], siblings[to]] = [siblings[to]!, siblings[from]!];
      for (const [index, sibling] of siblings.entries()) {
        if (sibling.sortOrder !== index) await this.setSortOrder(tx, kind, sibling.id, index);
      }
    });
    this.revalidate();
  }

  /** Xoá một nút. Còn con → 409; bài học xoá kèm object nhạc (best-effort sau commit). */
  async remove(kind: CourseKind, id: string): Promise<void> {
    let keys: string[] = [];
    try {
      if (kind === 'tracks') await this.prisma.courseTrack.delete({ where: { id } });
      else if (kind === 'levels') await this.prisma.courseLevel.delete({ where: { id } });
      else if (kind === 'sections') await this.prisma.courseSection.delete({ where: { id } });
      else {
        const row = await this.prisma.courseLesson.delete({ where: { id } });
        keys = [row.midiStorageKey, row.noteJsonKey].filter((k): k is string => k !== null);
      }
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND[kind]);
      if (isPrismaError(err, 'P2003')) throw inUse(CHILDREN_MESSAGE[kind]);
      throw err;
    }
    this.revalidate();
    await this.discardQuietly(keys);
  }

  // ── Dùng chung với `LessonMidiService` ─────────────────────────────────

  toLesson(row: CourseLesson): AdminLesson {
    return {
      id: row.id,
      sectionId: row.sectionId,
      title: row.title,
      youtubeUrl: row.youtubeUrl,
      content: row.content,
      durationMinutes: row.durationMinutes,
      midi: row.noteJsonKey
        ? {
            noteJsonUrl: this.storage.publicUrl(row.noteJsonKey),
            durationSeconds: row.midiDurationSeconds ?? 0,
            noteCount: row.midiNoteCount ?? 0,
            originalName: row.midiOriginalName,
          }
        : null,
      isPublished: row.isPublished,
      sortOrder: row.sortOrder,
      createdAt: iso(row.createdAt),
      updatedAt: iso(row.updatedAt),
    };
  }

  /** Khoá dòng bài (SELECT … FOR UPDATE) rồi đọc lại; không có → 404. */
  async lockLesson(tx: Tx, id: string): Promise<CourseLesson> {
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM course_lessons WHERE id = ${id}::uuid FOR UPDATE`;
    if (!locked.length) throw notFound(LESSON_NOT_FOUND);
    return tx.courseLesson.findUniqueOrThrow({ where: { id } });
  }

  /** Best-effort sau commit; `notify` không bao giờ ném. */
  revalidate(): void {
    void this.cache.notify([cacheTags.courses, cacheTags.sitemap]);
  }

  async discardQuietly(keys: string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.storage.deleteObjects(keys);
    } catch {
      /* object mồ côi: chỉ tốn chỗ chứa, không ảnh hưởng dữ liệu */
    }
  }

  // ── Nội bộ ─────────────────────────────────────────────────────────────

  private async requireParent(lookup: Promise<{ id: string } | null>, message: string): Promise<void> {
    if (!(await lookup)) throw notFound(message);
  }

  private async toTrack(row: CourseTrack): Promise<AdminTrack> {
    const [lessonCount, publishedLessonCount] = await Promise.all([
      this.prisma.courseLesson.count({ where: { section: { level: { trackId: row.id } } } }),
      this.prisma.courseLesson.count({
        where: { ...VISIBLE_LESSON, section: { ...VISIBLE_LESSON.section, level: { ...VISIBLE_LESSON.section.level, trackId: row.id } } },
      }),
    ]);
    return { ...node(row), slug: row.slug, lessonCount, publishedLessonCount, createdAt: iso(row.createdAt), updatedAt: iso(row.updatedAt) };
  }

  /** Id cha của một nút (null cho nhánh); không có nút → 404. */
  private async parentOf(kind: CourseKind, id: string): Promise<string | null> {
    const row =
      kind === 'tracks'
        ? await this.prisma.courseTrack.findUnique({ where: { id }, select: { id: true } })
        : kind === 'levels'
          ? await this.prisma.courseLevel.findUnique({ where: { id }, select: { trackId: true } })
          : kind === 'sections'
            ? await this.prisma.courseSection.findUnique({ where: { id }, select: { levelId: true } })
            : await this.prisma.courseLesson.findUnique({ where: { id }, select: { sectionId: true } });
    if (!row) throw notFound(NOT_FOUND[kind]);
    return 'trackId' in row ? row.trackId : 'levelId' in row ? row.levelId : 'sectionId' in row ? row.sectionId : null;
  }

  private siblings(tx: Tx, kind: CourseKind, parent: string | null): Promise<{ id: string; sortOrder: number }[]> {
    const select = { id: true, sortOrder: true };
    if (kind === 'tracks') return tx.courseTrack.findMany({ orderBy: ORDER, select });
    if (kind === 'levels') return tx.courseLevel.findMany({ where: { trackId: parent! }, orderBy: ORDER, select });
    if (kind === 'sections') return tx.courseSection.findMany({ where: { levelId: parent! }, orderBy: ORDER, select });
    return tx.courseLesson.findMany({ where: { sectionId: parent! }, orderBy: ORDER, select });
  }

  private async setSortOrder(tx: Tx, kind: CourseKind, id: string, sortOrder: number): Promise<void> {
    const data = { sortOrder };
    if (kind === 'tracks') await tx.courseTrack.update({ where: { id }, data });
    else if (kind === 'levels') await tx.courseLevel.update({ where: { id }, data });
    else if (kind === 'sections') await tx.courseSection.update({ where: { id }, data });
    else await tx.courseLesson.update({ where: { id }, data });
  }
}

function node(row: CourseTrack | CourseLevel | CourseSection) {
  return { id: row.id, title: row.title, description: row.description, isPublished: row.isPublished, sortOrder: row.sortOrder };
}
