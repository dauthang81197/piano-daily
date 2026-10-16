import { HttpStatus, Injectable } from '@nestjs/common';
import { ErrorCode } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { SettingsService } from '../settings/settings.service';
import { LESSON_NOT_FOUND, VISIBLE_LESSON } from './course-helpers';

export const COURSE_PLAN_REQUIRED = 'Bài học này dành cho thành viên có gói. Vui lòng đăng ký gói để xem và tham gia.';

/**
 * Quyền xem/tham gia bài học theo thuê bao (C5). Bài KHOÁ khi cưỡng chế thuê bao BẬT và bài không xem thử. Có quyền = bài
 * không khoá, hoặc khách còn hoạt động có Subscription ACTIVE còn hạn (mọi gói mở toàn bộ khoá học; dùng thử không mở khoá).
 */
@Injectable()
export class CourseAccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  /** Cưỡng chế thuê bao đang BẬT (đọc mỗi lần để đổi cờ có hiệu lực ngay). */
  async enforcementOn(): Promise<boolean> {
    return (await this.settings.subscriptionConfig()).enabled;
  }

  async hasPlan(customerId: string): Promise<boolean> {
    const sub = await this.prisma.subscription.findFirst({
      where: { customerId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() }, customer: { isActive: true } },
      select: { id: true },
    });
    return sub !== null;
  }

  /** Bài phải công khai ở đủ bốn cấp (404). Bài khoá mà khách không có gói → 402 `PLAN_REQUIRED`. */
  async assertLessonAccess(customerId: string, lessonId: string): Promise<void> {
    const lesson = await this.prisma.courseLesson.findFirst({ where: { id: lessonId, ...VISIBLE_LESSON }, select: { isFreePreview: true } });
    if (!lesson) throw notFound(LESSON_NOT_FOUND);
    if (lesson.isFreePreview || !(await this.enforcementOn())) return;
    if (await this.hasPlan(customerId)) return;
    throw new AppException(ErrorCode.PLAN_REQUIRED, HttpStatus.PAYMENT_REQUIRED, COURSE_PLAN_REQUIRED, { reason: 'PLAN_REQUIRED' });
  }
}
