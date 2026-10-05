import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type Facets,
  type Level,
  type LevelSummary,
  levelParamSchema,
  type Page,
  type PublicComposer,
  type PublicGenre,
  type PublicSheetItem,
  type PublicSheetListQuery,
  publicSheetListQuerySchema,
  slugParamSchema,
} from '@piano-daily/shared';
import { Public } from '../identity/public.decorator';
import { PublicSheetsService } from './public-sheets.service';

/** Endpoint công khai cho site (Story 2.2): chỉ Sheet PUBLISHED. */
@Public()
@Controller()
export class PublicSheetsController {
  constructor(private readonly service: PublicSheetsService) {}

  @Get('sheets')
  list(@Query({ schema: publicSheetListQuerySchema }) query: PublicSheetListQuery): Promise<Page<PublicSheetItem>> {
    return this.service.list(query);
  }

  @Get('sheets/facets')
  facets(): Promise<Facets> {
    return this.service.facets();
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
