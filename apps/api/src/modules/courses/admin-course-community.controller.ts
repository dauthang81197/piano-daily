import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { type AdminCommentPage, adminCommentsQuerySchema, setCommentHiddenSchema } from '@piano-daily/shared';
import { BillingSuperAdminGuard } from '../billing/super-admin.guard';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { CourseCommunityService } from './course-community.service';
import { parseBody } from './courses.service';

/**
 * Kiểm duyệt bình luận (C4). Đăng ký TRƯỚC `AdminCoursesController` để `comments/:id` không bị `:kind/:id` bắt nhầm.
 * Xem: mọi admin; ẩn/xoá: chỉ SUPER_ADMIN.
 */
@Controller('admin/courses')
export class AdminCourseCommunityController {
  constructor(private readonly community: CourseCommunityService) {}

  @Header('Cache-Control', 'no-store')
  @Get('comments')
  list(@Query() query: unknown): Promise<AdminCommentPage> {
    return this.community.adminList(parseBody(adminCommentsQuerySchema, query));
  }

  @Patch('comments/:id')
  @UseGuards(BillingSuperAdminGuard)
  setHidden(@Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<{ id: string; isHidden: boolean }> {
    return this.community.adminSetHidden(id, parseBody(setCommentHiddenSchema, body).hidden);
  }

  @Delete('comments/:id')
  @UseGuards(BillingSuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.community.adminRemove(id);
  }
}
