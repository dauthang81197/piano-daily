import { Body, Controller, Delete, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type CourseProgress,
  createCommentSchema,
  editCommentSchema,
  type LessonCompletion,
  type LessonSubmission,
  type MyComment,
  type MyCommunity,
  type MyRating,
  ratingBodySchema,
  setLessonCompletionSchema,
  upsertSubmissionSchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { CurrentCustomer } from '../customers/current-customer.decorator';
import { type AuthenticatedCustomer, CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Public } from '../identity/public.decorator';
import { CourseProgressService } from './course-progress.service';
import { CourseCommunityService } from './course-community.service';
import { CourseSubmissionsService } from './course-submissions.service';
import { parseBody } from './courses.service';

/**
 * Tiến độ khoá học của khách đã đăng nhập (C2). `@Public()` chỉ để bỏ qua guard admin; quyền do `CustomerAuthGuard`
 * quyết định. Không cache: dữ liệu theo người dùng.
 */
@Public()
@UseGuards(ThrottlerGuard, CustomerAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('customer/courses')
export class CustomerCoursesController {
  constructor(
    private readonly progress: CourseProgressService,
    private readonly submissions: CourseSubmissionsService,
    private readonly community: CourseCommunityService,
  ) {}

  @Header('Cache-Control', 'no-store')
  @Get('progress')
  get(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<CourseProgress> {
    return this.progress.get(customer.id);
  }

  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.OK)
  @Put('lessons/:id/completion')
  set(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', UuidParamPipe) id: string,
    @Body() body: unknown,
  ): Promise<LessonCompletion> {
    return this.progress.setCompleted(customer.id, id, parseBody(setLessonCompletionSchema, body).completed);
  }

  @Header('Cache-Control', 'no-store')
  @Get('lessons/:id/submission')
  getSubmission(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<LessonSubmission> {
    return this.submissions.get(customer.id, id);
  }

  /** Nộp/sửa bài (C3): ghi giới hạn 10 lần/phút. */
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Put('lessons/:id/submission')
  saveSubmission(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', UuidParamPipe) id: string,
    @Body() body: unknown,
  ): Promise<LessonSubmission> {
    return this.submissions.upsert(customer.id, id, parseBody(upsertSubmissionSchema, body));
  }

  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('lessons/:id/submission')
  removeSubmission(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.submissions.remove(customer.id, id);
  }

  // ── Cộng đồng (C4): ghi giới hạn 10 lần/phút theo IP ─────────

  @Header('Cache-Control', 'no-store')
  @Get('lessons/:id/community/mine')
  myCommunity(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<MyCommunity> {
    return this.community.mine(customer.id, id);
  }

  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Put('lessons/:id/rating')
  setRating(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<MyRating> {
    return this.community.setRating(customer.id, id, parseBody(ratingBodySchema, body).stars);
  }

  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Delete('lessons/:id/rating')
  removeRating(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<MyRating> {
    return this.community.removeRating(customer.id, id);
  }

  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('lessons/:id/comments')
  comment(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<MyComment> {
    return this.community.create(customer.id, id, parseBody(createCommentSchema, body));
  }

  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Patch('comments/:id')
  editComment(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<MyComment> {
    return this.community.edit(customer.id, id, parseBody(editCommentSchema, body).body);
  }

  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @HttpCode(HttpStatus.NO_CONTENT)
  @Delete('comments/:id')
  removeComment(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.community.remove(customer.id, id);
  }
}
