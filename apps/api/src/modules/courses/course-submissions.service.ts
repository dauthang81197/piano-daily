import { HttpStatus, Injectable } from '@nestjs/common';
import { type AdminSubmission, ErrorCode, type LessonSubmission, type MySubmission, type UpsertSubmissionBody } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { LESSON_NOT_FOUND, VISIBLE_LESSON } from './course-helpers';

const SUBMISSION_NOT_FOUND = 'Không tìm thấy bài nộp.';

type Row = { id: string; kind: string; url: string; note: string | null; isHidden: boolean; createdAt: Date; updatedAt: Date };
const toDto = (r: Row): MySubmission => ({
  id: r.id,
  kind: r.kind as MySubmission['kind'],
  url: r.url,
  note: r.note,
  isHidden: r.isHidden,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Bài nộp của khách (C3) và kiểm duyệt của admin. Khách chỉ nộp được vào bài công khai ở đủ bốn cấp. */
@Injectable()
export class CourseSubmissionsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertVisible(lessonId: string): Promise<void> {
    const lesson = await this.prisma.courseLesson.findFirst({ where: { id: lessonId, ...VISIBLE_LESSON }, select: { id: true } });
    if (!lesson) throw notFound(LESSON_NOT_FOUND);
  }

  async get(customerId: string, lessonId: string): Promise<LessonSubmission> {
    await this.assertVisible(lessonId);
    const row = await this.prisma.courseSubmission.findUnique({ where: { customerId_lessonId: { customerId, lessonId } } });
    return { submission: row ? toDto(row) : null };
  }

  /** Nộp hoặc sửa (upsert). Sửa giữ nguyên cờ ẩn của admin. */
  async upsert(customerId: string, lessonId: string, body: UpsertSubmissionBody): Promise<LessonSubmission> {
    await this.assertVisible(lessonId);
    const data = { kind: body.url.kind, url: body.url.url, note: body.note };
    const where = { customerId_lessonId: { customerId, lessonId } };
    try {
      return { submission: toDto(await this.prisma.courseSubmission.upsert({ where, create: { customerId, lessonId, ...data }, update: data })) };
    } catch (err) {
      const code = (err as { code?: string }).code;
      // Hai lần nộp đầu tiên chạy song song cùng đụng khoá duy nhất: lần thua cập nhật dòng của lần thắng.
      if (code === 'P2002') return { submission: toDto(await this.prisma.courseSubmission.update({ where, data })) };
      // Khoá ngoại: khách đã bị xoá (token còn hạn) hoặc bài bị xoá giữa lúc kiểm tra và ghi.
      if (code !== 'P2003') throw err;
      if (!(await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) {
        throw new AppException(ErrorCode.UNAUTHORIZED, HttpStatus.UNAUTHORIZED);
      }
      throw notFound(LESSON_NOT_FOUND);
    }
  }

  /** Xoá bài nộp của chính khách (idempotent). Không cần bài còn công khai: khách luôn gỡ được bài của mình. */
  async remove(customerId: string, lessonId: string): Promise<void> {
    await this.prisma.courseSubmission.deleteMany({ where: { customerId, lessonId } });
  }

  async listForLesson(lessonId: string): Promise<AdminSubmission[]> {
    if (!(await this.prisma.courseLesson.findUnique({ where: { id: lessonId }, select: { id: true } }))) throw notFound(LESSON_NOT_FOUND);
    const rows = await this.prisma.courseSubmission.findMany({
      where: { lessonId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 200,
      include: { customer: { select: { id: true, name: true, email: true } } },
    });
    return rows.map((r) => ({ ...toDto(r), customer: r.customer }));
  }

  async setHidden(id: string, hidden: boolean): Promise<MySubmission> {
    try {
      return toDto(await this.prisma.courseSubmission.update({ where: { id }, data: { isHidden: hidden } }));
    } catch (err) {
      if ((err as { code?: string }).code === 'P2025') throw notFound(SUBMISSION_NOT_FOUND);
      throw err;
    }
  }

  async removeAny(id: string): Promise<void> {
    const { count } = await this.prisma.courseSubmission.deleteMany({ where: { id } });
    if (count === 0) throw notFound(SUBMISSION_NOT_FOUND);
  }
}
