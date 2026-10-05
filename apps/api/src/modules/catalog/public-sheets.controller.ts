import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  type Facets,
  type Level,
  type LevelSummary,
  levelParamSchema,
  type Page,
  type PublicSheetItem,
  type PublicSheetListQuery,
  publicSheetListQuerySchema,
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

  @Get('levels/:level/summary')
  summary(@Param({ schema: levelParamSchema }) params: { level: Level }): Promise<LevelSummary> {
    return this.service.levelSummary(params.level);
  }
}
