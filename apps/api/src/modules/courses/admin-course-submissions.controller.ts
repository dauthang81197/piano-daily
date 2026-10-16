import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, UseGuards } from '@nestjs/common';
import { type AdminSubmission, type MySubmission, setSubmissionHiddenSchema } from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { BillingSuperAdminGuard } from '../billing/super-admin.guard';
import { CourseSubmissionsService } from './course-submissions.service';
import { parseBody } from './courses.service';

/**
 * Kiểm duyệt bài nộp (C3). Đăng ký TRƯỚC `AdminCoursesController` để `submissions/:id` không bị `:kind/:id` bắt nhầm.
 * Xem: mọi admin; ẩn/xoá: chỉ SUPER_ADMIN.
 */
@Controller('admin/courses')
export class AdminCourseSubmissionsController {
  constructor(private readonly submissions: CourseSubmissionsService) {}

  @Header('Cache-Control', 'no-store')
  @Get('lessons/:id/submissions')
  list(@Param('id', UuidParamPipe) id: string): Promise<AdminSubmission[]> {
    return this.submissions.listForLesson(id);
  }

  @Patch('submissions/:id')
  @UseGuards(BillingSuperAdminGuard)
  setHidden(@Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<MySubmission> {
    return this.submissions.setHidden(id, parseBody(setSubmissionHiddenSchema, body).hidden);
  }

  @Delete('submissions/:id')
  @UseGuards(BillingSuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.submissions.removeAny(id);
  }
}
