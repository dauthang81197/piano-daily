import { Injectable } from '@nestjs/common';
import type { CourseProgress } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { LESSON_NOT_FOUND, VISIBLE_LESSON } from './course-helpers';

/** Tiến độ học của khách (C2). Chỉ tính bài đang công khai ở đủ bốn cấp, nên ẩn/xoá bài thì số đếm tự điều chỉnh. */
@Injectable()
export class CourseProgressService {
  constructor(private readonly prisma: PrismaService) {}

  async get(customerId: string): Promise<CourseProgress> {
    const rows = await this.prisma.courseLessonProgress.findMany({
      where: { customerId, lesson: VISIBLE_LESSON },
      select: { lessonId: true, lesson: { select: { section: { select: { level: { select: { track: { select: { slug: true } } } } } } } } },
    });
    const byTrack = new Map<string, number>();
    for (const row of rows) {
      const slug = row.lesson.section.level.track.slug;
      byTrack.set(slug, (byTrack.get(slug) ?? 0) + 1);
    }
    return {
      tracks: [...byTrack].map(([slug, completed]) => ({ slug, completed })),
      lessonIds: rows.map((r) => r.lessonId),
    };
  }

  /** Đặt trạng thái hoàn thành (idempotent). Bài không công khai hoặc không tồn tại → 404, không ghi gì. */
  async setCompleted(customerId: string, lessonId: string, completed: boolean): Promise<{ completed: boolean }> {
    const lesson = await this.prisma.courseLesson.findFirst({ where: { id: lessonId, ...VISIBLE_LESSON }, select: { id: true } });
    if (!lesson) throw notFound(LESSON_NOT_FOUND);
    if (completed) {
      await this.prisma.courseLessonProgress.upsert({
        where: { customerId_lessonId: { customerId, lessonId } },
        create: { customerId, lessonId },
        update: {},
      });
    } else {
      await this.prisma.courseLessonProgress.deleteMany({ where: { customerId, lessonId } });
    }
    return { completed };
  }
}
