import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
import {
  type BulkPriceApplyBody,
  bulkPriceApplySchema,
  type BulkPriceApplyResponse,
  type BulkPricePreviewBody,
  bulkPricePreviewSchema,
  type BulkPricePreviewResponse,
  type CreateSheetBody,
  createSheetSchema,
  type Page,
  type Sheet,
  type SheetListItem,
  type SheetListQuery,
  sheetListQuerySchema,
  type UpdateSheetBody,
  updateSheetSchema,
  type UpdateSheetHotBody,
  updateSheetHotSchema,
  type UpdateSheetStatusBody,
  updateSheetStatusSchema,
} from '@piano-daily/shared';
import { UuidParamPipe } from './catalog.helpers';
import { SheetsService } from './sheets.service';

/**
 * Quản lý nội dung và lifecycle Sheet cho admin.
 * Route `/admin/*` được guard JWT global bảo vệ.
 */
@Controller('admin/sheets')
export class SheetsController {
  constructor(private readonly service: SheetsService) {}

  @Get()
  list(@Query({ schema: sheetListQuerySchema }) query: SheetListQuery): Promise<Page<SheetListItem>> {
    return this.service.list(query);
  }

  @Post('bulk-pricing/preview')
  @HttpCode(HttpStatus.OK)
  previewBulkPricing(@Body({ schema: bulkPricePreviewSchema }) body: BulkPricePreviewBody): Promise<BulkPricePreviewResponse> {
    return this.service.previewBulkPricing(body.filter);
  }

  @Post('bulk-pricing/apply')
  @HttpCode(HttpStatus.OK)
  applyBulkPricing(@Body({ schema: bulkPriceApplySchema }) body: BulkPriceApplyBody): Promise<BulkPriceApplyResponse> {
    return this.service.applyBulkPricing(body);
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

  @Patch(':id/status')
  setStatus(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateSheetStatusSchema }) body: UpdateSheetStatusBody): Promise<Sheet> {
    return this.service.setStatus(id, body.status);
  }

  @Patch(':id/hot')
  setHot(@Param('id', UuidParamPipe) id: string, @Body({ schema: updateSheetHotSchema }) body: UpdateSheetHotBody): Promise<Sheet> {
    return this.service.setHot(id, body.isHot);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  remove(@Param('id', UuidParamPipe) id: string): Promise<Sheet | { deleted: true }> {
    return this.service.remove(id);
  }
}
