import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  type Facets,
  type Level,
  type LevelSummary,
  levelParamSchema,
  type Page,
  type PublicComposer,
  type PublicGenre,
  type PublicSheetDetail,
  type PublicSheetItem,
  type PublicSheetListQuery,
  publicSheetListQuerySchema,
  sheetIdParamSchema,
  slugParamSchema,
} from '@piano-daily/shared';
import { getClientIp } from '../../common/http/client-ip';
import { Public } from '../identity/public.decorator';
import { PublicSheetsService } from './public-sheets.service';
import { SheetViewsService } from './sheet-views.service';

/** Endpoint công khai cho site (Story 2.2): chỉ Sheet PUBLISHED. */
@Public()
@Controller()
export class PublicSheetsController {
  constructor(
    private readonly service: PublicSheetsService,
    private readonly views: SheetViewsService,
  ) {}

  @Get('sheets')
  list(@Query({ schema: publicSheetListQuerySchema }) query: PublicSheetListQuery): Promise<Page<PublicSheetItem>> {
    return this.service.list(query);
  }

  @Get('sheets/facets')
  facets(): Promise<Facets> {
    return this.service.facets();
  }

  // Phải đứng SAU `sheets/facets` để `facets` không bị coi là slug.
  @Get('sheets/:slug')
  detail(@Param({ schema: slugParamSchema }) params: { slug: string }): Promise<PublicSheetDetail> {
    return this.service.detailBySlug(params.slug);
  }

  /**
   * Beacon lượt xem (AD-11) gửi từ trình duyệt. Luôn `204` với mọi UUID hợp lệ: Sheet lạ, Draft/Archived, đã đếm
   * trong giờ hay vừa đếm cho phản hồi giống hệt (status, body, header; độ trễ có thể khác nhau chút ít). Throttle 30 request/60 giây theo `getClientIp()`.
   */
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post('sheets/:id/view')
  @HttpCode(HttpStatus.NO_CONTENT)
  async view(
    @Param({ schema: sheetIdParamSchema }) params: { id: string },
    @Req() req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ): Promise<void> {
    const ua = req.headers['user-agent'];
    await this.views.record(params.id, getClientIp(req), Array.isArray(ua) ? ua[0] : ua);
  }

  @Get('composers/:slug')
  composer(@Param({ schema: slugParamSchema }) params: { slug: string }): Promise<PublicComposer> {
    return this.service.composerBySlug(params.slug);
  }

  @Get('genres/:slug')
  genre(@Param({ schema: slugParamSchema }) params: { slug: string }): Promise<PublicGenre> {
    return this.service.genreBySlug(params.slug);
  }

  @Get('levels/:level/summary')
  summary(@Param({ schema: levelParamSchema }) params: { level: Level }): Promise<LevelSummary> {
    return this.service.levelSummary(params.level);
  }
}
