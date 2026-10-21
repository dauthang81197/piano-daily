import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  createMemberSheetSchema,
  ErrorCode,
  type MemberSheetListItem,
  type Sheet,
  updateMemberSheetSchema,
  type UploadableFileType,
} from '@piano-daily/shared';
import type { ZodType } from 'zod';
import { AppException } from '../../common/http-exception.filter';
import { validationExceptionFactory } from '../../common/validation';
import { CurrentCustomer } from '../customers/current-customer.decorator';
import { type AuthenticatedCustomer, CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Public } from '../identity/public.decorator';
import { UuidParamPipe } from './catalog.helpers';
import { MemberSheetsService } from './member-sheets.service';
import {
  decodeOriginalName,
  type MulterFile,
  RemoveFileTypeParamPipe,
  SheetFileUploadInterceptor,
  uploadBodySchema,
  type UploadBody,
} from './sheet-files.controller';

function parse<T>(schema: ZodType<T>, raw: unknown): T {
  const result = schema.safeParse(raw);
  if (!result.success) throw validationExceptionFactory(result.error.issues);
  return result.data;
}

/**
 * Bản nhạc do khách đăng. `@Public()` chỉ để bỏ qua guard admin; quyền do `CustomerAuthGuard` quyết định và mọi thao tác
 * kiểm tra quyền sở hữu trong service. Throttle theo IP (bảo vệ kỹ thuật tối thiểu, không phải hạn mức nghiệp vụ).
 */
@Public()
@UseGuards(ThrottlerGuard, CustomerAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('customer/sheets')
export class MemberSheetsController {
  constructor(private readonly sheets: MemberSheetsService) {}

  @Header('Cache-Control', 'no-store')
  @Get()
  list(@CurrentCustomer() customer: AuthenticatedCustomer): Promise<MemberSheetListItem[]> {
    return this.sheets.list(customer.id);
  }

  @Header('Cache-Control', 'no-store')
  @Get(':id')
  get(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<Sheet> {
    return this.sheets.get(customer.id, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post()
  create(@CurrentCustomer() customer: AuthenticatedCustomer, @Body() body: unknown): Promise<Sheet> {
    return this.sheets.create(customer.id, parse(createMemberSheetSchema, body));
  }

  @Patch(':id')
  update(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<Sheet> {
    return this.sheets.update(customer.id, id, parse(updateMemberSheetSchema, body));
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Post(':id/files')
  @UseInterceptors(SheetFileUploadInterceptor)
  upload(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', UuidParamPipe) id: string,
    @Body() rawBody: unknown,
    @UploadedFile() file: MulterFile | undefined,
  ): Promise<Sheet> {
    const body: UploadBody = parse(uploadBodySchema, rawBody);
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'file', message: 'Vui lòng chọn file để upload.' },
      ]);
    }
    return this.sheets.attachFile(customer.id, id, body.type, { buffer: file.buffer, originalName: decodeOriginalName(file.originalname) });
  }

  @Delete(':id/files/:type')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFile(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('id', UuidParamPipe) id: string,
    @Param('type', RemoveFileTypeParamPipe) type: UploadableFileType,
  ): Promise<void> {
    await this.sheets.removeFile(customer.id, id, type);
  }

  @Post(':id/publish')
  @HttpCode(HttpStatus.OK)
  publish(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<Sheet> {
    return this.sheets.publish(customer.id, id);
  }

  @Post(':id/unpublish')
  @HttpCode(HttpStatus.OK)
  unpublish(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<Sheet> {
    return this.sheets.unpublish(customer.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<void> {
    await this.sheets.remove(customer.id, id);
  }
}
