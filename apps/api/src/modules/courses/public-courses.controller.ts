import { Controller, Get, Header, Param, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { PublicLesson, PublicTrackCard, PublicTrackTree } from '@piano-daily/shared';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { PublicCoursesService } from './public-courses.service';

/** Khoá học công khai (C1): nhánh, lộ trình và bài học đã công khai. Web SSR gọi kèm secret nội bộ nên không bị throttle. */
@Public()
@UseGuards(ThrottlerGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('courses')
export class PublicCoursesController {
  constructor(private readonly courses: PublicCoursesService) {}

  @Get()
  list(): Promise<PublicTrackCard[]> {
    return this.courses.listTracks();
  }

  /** Khai báo trước `:trackSlug` để `lessons` không bị bắt nhầm. */
  @Header('Cache-Control', 'no-store')
  @Get(':trackSlug/lessons/:id')
  lesson(@Param('trackSlug') trackSlug: string, @Param('id', UuidParamPipe) id: string): Promise<PublicLesson> {
    return this.courses.lesson(trackSlug, id);
  }

  @Get(':trackSlug')
  tree(@Param('trackSlug') trackSlug: string): Promise<PublicTrackTree> {
    return this.courses.tree(trackSlug);
  }
}
