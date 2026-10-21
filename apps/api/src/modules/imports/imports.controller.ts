import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  type CreateSheetImportBody,
  createSheetImportSchema,
  ErrorCode,
  type Page,
  type SheetImportBatch,
  type SheetImportDetail,
  type SheetImportItem,
  type SheetImportListQuery,
  sheetImportListQuerySchema,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { decodeOriginalName, type MulterFile, SheetFileUploadInterceptor } from '../catalog/sheet-files.controller';
import { ImportsService } from './imports.service';

/** Import Sheet hàng loạt (admin). Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/sheet-imports')
export class ImportsController {
  constructor(private readonly service: ImportsService) {}

  @Get()
  list(@Query({ schema: sheetImportListQuerySchema }) query: SheetImportListQuery): Promise<Page<SheetImportBatch>> {
    return this.service.list(query);
  }

  @Post()
  create(@Body({ schema: createSheetImportSchema }) body: CreateSheetImportBody): Promise<SheetImportDetail> {
    return this.service.create(body);
  }

  @Get(':id')
  get(@Param('id', UuidParamPipe) id: string): Promise<SheetImportDetail> {
    return this.service.get(id);
  }

  /** Thêm một PDF vào đợt (multipart, field `file`). Client gửi từng file một để có tiến trình và lỗi theo từng file. */
  @Post(':id/files')
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @UseInterceptors(SheetFileUploadInterceptor)
  addFile(@Param('id', UuidParamPipe) id: string, @UploadedFile() file: MulterFile | undefined): Promise<SheetImportItem> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path: 'file', message: 'Vui lòng chọn file PDF.' }]);
    }
    return this.service.addFile(id, { buffer: file.buffer, originalName: decodeOriginalName(file.originalname) });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  cancel(@Param('id', UuidParamPipe) id: string): Promise<SheetImportDetail> {
    return this.service.cancel(id);
  }

  @Post(':id/items/:itemId/cancel')
  @HttpCode(HttpStatus.OK)
  cancelItem(@Param('id', UuidParamPipe) id: string, @Param('itemId', UuidParamPipe) itemId: string): Promise<SheetImportDetail> {
    return this.service.cancelItem(id, itemId);
  }

  @Post(':id/items/:itemId/retry')
  @HttpCode(HttpStatus.OK)
  retryItem(@Param('id', UuidParamPipe) id: string, @Param('itemId', UuidParamPipe) itemId: string): Promise<SheetImportDetail> {
    return this.service.retryItem(id, itemId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.service.remove(id);
  }
}
