import {
  BadRequestException,
  Body,
  type CallHandler,
  Controller,
  type ExecutionContext,
  Get,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AdminSettings,
  ErrorCode,
  LOGO_MAX_BYTES,
  type PublicSiteSettings,
  type UpdateSettingsBody,
  updateSettingsBodySchema,
} from '@piano-daily/shared';
import type { Observable } from 'rxjs';
import { AppException } from '../../common/http-exception.filter';
import { Public } from '../identity/public.decorator';
import { LogoRejectedError } from '../media/site-logo.service';
import { SettingsService } from './settings.service';

const LOGO_TOO_LARGE = 'Logo vượt quá 2 MB.';
const LOGO_UNSUPPORTED = 'Logo phải là ảnh PNG, JPEG hoặc WebP.';
const LOGO_UNREADABLE = 'Không đọc được ảnh logo. Hãy kiểm tra file rồi thử lại.';
const LOGO_MISSING = 'Vui lòng chọn ảnh logo để upload.';

const validation = (message: string) =>
  new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path: 'file', message }]);

const MulterLogoInterceptor = FileInterceptor('file', {
  limits: { fileSize: LOGO_MAX_BYTES, files: 1, fields: 5, parts: 6 },
});

/** Bọc multer: vượt 2 MB thành 413 `FILE_TOO_LARGE`; lỗi multipart khác thành 400 tại `file`. */
@Injectable()
class LogoUploadInterceptor implements NestInterceptor {
  private readonly multer = new MulterLogoInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, LOGO_TOO_LARGE);
      }
      if (err instanceof BadRequestException) {
        throw validation('Dữ liệu upload không hợp lệ: chỉ gửi đúng một file trong field "file".');
      }
      throw err;
    }
  }
}

/** Cài đặt site cho admin. Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(): Promise<AdminSettings> {
    return this.settings.getAdmin();
  }

  @Put()
  update(@Body({ schema: updateSettingsBodySchema }) body: UpdateSettingsBody): Promise<AdminSettings> {
    return this.settings.updateAll(body);
  }

  @Post('logo')
  @UseInterceptors(LogoUploadInterceptor)
  async uploadLogo(@UploadedFile() file: { buffer: Buffer } | undefined): Promise<AdminSettings> {
    if (!file) throw validation(LOGO_MISSING);
    try {
      return await this.settings.setLogo(file.buffer);
    } catch (err) {
      if (err instanceof LogoRejectedError) {
        if (err.reason === 'TOO_LARGE') {
          throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, LOGO_TOO_LARGE);
        }
        throw validation(err.reason === 'UNSUPPORTED' ? LOGO_UNSUPPORTED : LOGO_UNREADABLE);
      }
      throw err;
    }
  }
}

/** Cài đặt công khai, chỉ đọc: web dùng cho header/footer/meta. */
@Public()
@Controller('settings')
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('site')
  site(): Promise<PublicSiteSettings> {
    return this.settings.getSite();
  }
}
