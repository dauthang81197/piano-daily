import {
  BadRequestException,
  Body,
  CallHandler,
  Controller,
  Delete,
  ExecutionContext,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Injectable,
  NestInterceptor,
  Param,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { ErrorCode, type ScoreConversion } from '@piano-daily/shared';
import type { Observable } from 'rxjs';
import { AppException } from '../../common/http-exception.filter';
import { UuidParamPipe } from '../catalog/catalog.helpers';
import { CurrentCustomer } from '../customers/current-customer.decorator';
import { type AuthenticatedCustomer, CustomerAuthGuard } from '../customers/customer-auth.guard';
import { Public } from '../identity/public.decorator';
import { ScoresService } from './scores.service';

/** Trần cứng của multer (bằng giới hạn của `musicscore`); giới hạn cấu hình `SCORE_MAX_UPLOAD_MB` kiểm tra ở service. */
const HARD_MAX_BYTES = 25 * 1024 * 1024;

const MulterScoreInterceptor = FileInterceptor('file', {
  limits: { fileSize: HARD_MAX_BYTES, files: 1, fields: 5, parts: 6 },
  defParamCharset: 'utf8',
});

/** Bọc multer: vượt trần thành 413 `FILE_TOO_LARGE`; lỗi multipart khác thành 400 tại `file`. */
@Injectable()
class ScoreUploadInterceptor implements NestInterceptor {
  private readonly multer = new MulterScoreInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, `File vượt quá ${HARD_MAX_BYTES / (1024 * 1024)}MB.`);
      }
      if (err instanceof BadRequestException) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
          { path: 'file', message: 'Dữ liệu upload không hợp lệ: chỉ gửi đúng một file trong field "file".' },
        ]);
      }
      throw err;
    }
  }
}

/**
 * Chuyển bản nhạc sang MIDI của khách đã đăng nhập. `@Public()` chỉ để bỏ qua guard admin; quyền do `CustomerAuthGuard`
 * quyết định. Không cache: dữ liệu theo người dùng.
 */
@Public()
@UseGuards(ThrottlerGuard, CustomerAuthGuard)
@Throttle({ default: { limit: 60, ttl: 60_000 } })
@Controller('customer/scores')
export class CustomerScoresController {
  constructor(private readonly scores: ScoresService) {}

  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseInterceptors(ScoreUploadInterceptor)
  @HttpCode(HttpStatus.ACCEPTED)
  create(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Body() body: { transpose?: unknown } | undefined,
  ): Promise<ScoreConversion> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'file', message: 'Vui lòng chọn file bản nhạc để tải lên.' },
      ]);
    }
    return this.scores.create(customer.id, { buffer: file.buffer, originalName: file.originalname }, body?.transpose);
  }

  @Header('Cache-Control', 'no-store')
  @Get(':id')
  get(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<ScoreConversion> {
    return this.scores.get(customer.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentCustomer() customer: AuthenticatedCustomer, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.scores.remove(customer.id, id);
  }
}
