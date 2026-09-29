import {
  BadRequestException,
  Body,
  type CallHandler,
  Controller,
  type ExecutionContext,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  Param,
  PayloadTooLargeException,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ErrorCode,
  PDF_MAX_BYTES,
  PDF_TOO_LARGE_MESSAGE,
  type Sheet,
  uploadFileTypeSchema,
} from '@piano-daily/shared';
import type { Observable } from 'rxjs';
import { z } from 'zod';
import { AppException } from '../../common/http-exception.filter';
import { UuidParamPipe } from './catalog.helpers';
import { SheetsService } from './sheets.service';

/** Phần của `Express.Multer.File` mà route dùng (multer lưu trong bộ nhớ). */
interface MulterFile {
  buffer: Buffer;
  originalname: string;
}

/** Field text của multipart: chỉ `type` (Story 1.6: `PDF`). Field lạ bị bỏ qua. */
const uploadBodySchema = z.object({ type: uploadFileTypeSchema }, { error: 'Thiếu field type.' });
type UploadBody = z.output<typeof uploadBodySchema>;

/** Multer (bộ nhớ) cho field `file`: tối đa 20MB, một file, ít field. Tên file trong multipart đọc theo UTF-8. */
const MulterPdfInterceptor = FileInterceptor('file', {
  limits: { fileSize: PDF_MAX_BYTES, files: 1, fields: 10, parts: 12 },
  defParamCharset: 'utf8',
});

const MULTIPART_INVALID_MESSAGE =
  'Dữ liệu upload không hợp lệ: chỉ gửi đúng một file trong field "file" kèm field "type".';

/**
 * Bọc `FileInterceptor`: vượt `limits.fileSize` (413 của multer) thành 413 `FILE_TOO_LARGE`; lỗi multipart khác
 * (field file sai tên, quá nhiều file/part, multipart hỏng) thành 400 `VALIDATION_FAILED` tại `file`.
 */
@Injectable()
class PdfUploadInterceptor implements NestInterceptor {
  private readonly multer = new MulterPdfInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, PDF_TOO_LARGE_MESSAGE);
      }
      if (err instanceof BadRequestException) {
        throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
          { path: 'file', message: MULTIPART_INVALID_MESSAGE },
        ]);
      }
      throw err;
    }
  }
}

/** Upload file của Sheet (Story 1.6: PDF). Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/sheets')
export class SheetFilesController {
  constructor(private readonly sheets: SheetsService) {}

  @Post(':id/files')
  @UseInterceptors(PdfUploadInterceptor)
  upload(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: uploadBodySchema }) _body: UploadBody,
    @UploadedFile() file: MulterFile | undefined,
  ): Promise<Sheet> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'file', message: 'Vui lòng chọn file PDF để upload.' },
      ]);
    }
    return this.sheets.attachPdf(id, { buffer: file.buffer, originalName: decodeOriginalName(file.originalname) });
  }
}

/** Tên file gốc (multer đọc UTF-8): bỏ ký tự điều khiển, cắt 255 code point (không tách cặp surrogate); rỗng thành `null`. */
function decodeOriginalName(name: string | undefined): string | null {
  if (!name) return null;
  const cleaned = [...name]
    .filter((ch) => ch.charCodeAt(0) >= 0x20 && ch.charCodeAt(0) !== 0x7f)
    .join('')
    .trim();
  const truncated = [...cleaned].slice(0, 255).join('');
  return truncated || null;
}
