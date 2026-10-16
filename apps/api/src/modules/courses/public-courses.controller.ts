import { Controller, Get, Header, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { courseLocaleQuerySchema, type PublicCommunity, type PublicLesson, type PublicTrackCard, type PublicTrackTree } from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { CourseCommunityService } from './course-community.service';
import { PublicCoursesService } from './public-courses.service';
import { parseBody } from './courses.service';

/** `?locale=vi|en` (vắng = vi); giá trị khác → 400. */
const localeOf = (query: unknown) => parseBody(courseLocaleQuerySchema, query).locale;

/** Khoá học công khai (C1): nhánh, lộ trình và bài học đã công khai. Web SSR gọi kèm secret nội bộ nên không bị throttle. */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('courses')
export class PublicCoursesController {
  constructor(
    private readonly courses: PublicCoursesService,
    private readonly community: CourseCommunityService,
  ) {}

  @Get()
  list(@Query() query: unknown): Promise<PublicTrackCard[]> {
    return this.courses.listTracks(localeOf(query));
  }

  /** Đánh giá + bình luận công khai của bài (C4). Không cache: tải ở trình duyệt, bình luận đổi liên tục. */
  @Header('Cache-Control', 'no-store')
  @Get('lessons/:id/community')
  communityOf(@Param('id', UuidParamPipe) id: string, @Query('cursor') cursor?: string): Promise<PublicCommunity> {
    return this.community.publicView(id, typeof cursor === 'string' ? cursor : undefined);
  }

  /** Khai báo trước `:trackSlug` để `lessons` không bị bắt nhầm. */
  @Header('Cache-Control', 'no-store')
  @Get(':trackSlug/lessons/:id')
  lesson(
    @Param('trackSlug') trackSlug: string,
    @Param('id', UuidParamPipe) id: string,
    @Query() query: unknown,
  ): Promise<PublicLesson> {
    return this.courses.lesson(trackSlug, id, localeOf(query));
  }

  @Get(':trackSlug')
  tree(@Param('trackSlug') trackSlug: string, @Query() query: unknown): Promise<PublicTrackTree> {
    return this.courses.tree(trackSlug, localeOf(query));
  }
}
