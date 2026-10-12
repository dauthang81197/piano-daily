import {
  BadRequestException,
  Body,
  type CallHandler,
  Controller,
  Delete,
  type ExecutionContext,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  Param,
  Patch,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import {
  AD_IMAGE_MAX_BYTES,
  type AdImageResponse,
  type AdSlot,
  type CreateAdSlotBody,
  createAdSlotBodySchema,
  ErrorCode,
  type PublicAdSlot,
  type SetAdSlotActiveBody,
  setAdSlotActiveBodySchema,
  type UpdateAdSlotBody,
  updateAdSlotBodySchema,
} from '@piano-daily/shared';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { AppException } from '../../common/http-exception.filter';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { AdImageRejectedError, AdImageService } from '../media/ad-image.service';
import { AdsService } from './ads.service';
import { SuperAdminGuard } from './super-admin.guard';

const IMAGE_TOO_LARGE = 'Ảnh vượt quá 2 MB.';
const IMAGE_UNSUPPORTED = 'Ảnh phải là PNG, JPEG hoặc WebP.';
const IMAGE_UNREADABLE = 'Không đọc được ảnh. Hãy kiểm tra file rồi thử lại.';
const IMAGE_MISSING = 'Vui lòng chọn ảnh để tải lên.';

const validation = (message: string) =>
  new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path: 'file', message }]);

const MulterImageInterceptor = FileInterceptor('file', {
  limits: { fileSize: AD_IMAGE_MAX_BYTES, files: 1, fields: 5, parts: 6 },
});

/** Bọc multer: vượt 2 MB thành 413 `FILE_TOO_LARGE`; lỗi multipart khác thành 400 tại `file`. */
@Injectable()
class AdImageUploadInterceptor implements NestInterceptor {
  private readonly multer = new MulterImageInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, IMAGE_TOO_LARGE);
      }
      if (err instanceof BadRequestException) {
        throw validation('Dữ liệu tải lên không hợp lệ: chỉ gửi đúng một file trong field "file".');
      }
      throw err;
    }
  }
}

/** Quảng cáo cho admin. Xem: mọi admin đã đăng nhập; ghi và tải ảnh: chỉ SUPER_ADMIN (kể cả `html_code`). */
@Controller('admin/ads')
export class AdminAdsController {
  constructor(
    private readonly ads: AdsService,
    private readonly images: AdImageService,
  ) {}

  @Get()
  list(): Promise<AdSlot[]> {
    return this.ads.list();
  }

  @Post()
  @UseGuards(SuperAdminGuard)
  create(@Body({ schema: createAdSlotBodySchema }) body: CreateAdSlotBody): Promise<AdSlot> {
    return this.ads.create(body);
  }

  /** Tải ảnh quảng cáo lên vùng public của R2, trả URL để điền vào sản phẩm. Khai báo trước `:id` để không bị bắt nhầm. */
  @Post('images')
  @UseGuards(SuperAdminGuard)
  @UseInterceptors(AdImageUploadInterceptor)
  async uploadImage(@UploadedFile() file: { buffer: Buffer } | undefined): Promise<AdImageResponse> {
    if (!file) throw validation(IMAGE_MISSING);
    try {
      return { url: await this.images.store(file.buffer) };
    } catch (err) {
      if (err instanceof AdImageRejectedError) {
        if (err.reason === 'TOO_LARGE') {
          throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, IMAGE_TOO_LARGE);
        }
        throw validation(err.reason === 'UNSUPPORTED' ? IMAGE_UNSUPPORTED : IMAGE_UNREADABLE);
      }
      throw err;
    }
  }

  @Patch(':id')
  @UseGuards(SuperAdminGuard)
  update(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: updateAdSlotBodySchema }) body: UpdateAdSlotBody,
  ): Promise<AdSlot> {
    return this.ads.update(id, body);
  }

  @Patch(':id/active')
  @UseGuards(SuperAdminGuard)
  setActive(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: setAdSlotActiveBodySchema }) body: SetAdSlotActiveBody,
  ): Promise<AdSlot> {
    return this.ads.setActive(id, body.isActive);
  }

  @Delete(':id')
  @UseGuards(SuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.ads.remove(id);
  }
}

/** Quảng cáo công khai: chỉ slot đang bật; ghi lượt bấm (beacon) không cần đăng nhập. */
@Public()
@Controller('ads')
export class PublicAdsController {
  constructor(private readonly ads: AdsService) {}

  @Get()
  list(): Promise<PublicAdSlot[]> {
    return this.ads.listPublic();
  }

  /**
   * Beacon lượt bấm. Luôn 204 để không lộ sản phẩm nào tồn tại; id sai dạng hoặc lạ thì không ghi. Rate limit 60 request/phút
   * theo `getClientIp()`. Không lưu IP, UA hay cookie.
   */
  @Post('items/:id/click')
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @HttpCode(HttpStatus.NO_CONTENT)
  async click(@Param('id') id: string): Promise<void> {
    if (!z.uuid().safeParse(id).success) return;
    await this.ads.registerClick(id);
  }
}
