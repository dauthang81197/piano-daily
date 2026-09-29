import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type CreateSheetBody,
  createSheetSchema,
  type Page,
  type Sheet,
  type SheetListItem,
  type SheetListQuery,
  sheetListQuerySchema,
  type UpdateSheetBody,
  updateSheetSchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from './catalog.helpers';
import { SheetsService } from './sheets.service';

/**
 * Tạo/sửa thông tin Sheet cho admin (Story 1.5). Không có DELETE, publish/archive hay HOT ở đây (Story 1.8).
 * Route `/admin/*` được guard JWT global bảo vệ.
 */
@Controller('admin/sheets')
export class SheetsController {
  constructor(private readonly service: SheetsService) {}

  @Get()
  list(@Query({ schema: sheetListQuerySchema }) query: SheetListQuery): Promise<Page<SheetListItem>> {
    return this.service.list(query);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<Sheet> {
    return this.service.get(id);
  }

  @Post()
  create(@Body({ schema: createSheetSchema }) body: CreateSheetBody): Promise<Sheet> {
    return this.service.create(body);
  }

  @Patch(':id')
  update(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateSheetSchema }) body: UpdateSheetBody): Promise<Sheet> {
    return this.service.update(id, body);
  }
}
