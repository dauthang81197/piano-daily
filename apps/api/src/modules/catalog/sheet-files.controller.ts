import {
  BadRequestException,
  Body,
  type CallHandler,
  Controller,
  Delete,
  type ExecutionContext,
  HttpCode,
  HttpStatus,
  Injectable,
  type NestInterceptor,
  Param,
  PayloadTooLargeException,
  type PipeTransform,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ErrorCode,
  PDF_MAX_BYTES,
  removeFileTypeSchema,
  type Sheet,
  UPLOAD_HARD_LIMIT_MESSAGE,
  uploadFileTypeSchema,
  type UploadableFileType,
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

/** Field text của multipart: `type` (Story 1.7: `PDF`, `MIDI` hoặc `MP3`). Field lạ bị bỏ qua. */
const uploadBodySchema = z.object({ type: uploadFileTypeSchema }, { error: 'Thiếu field type.' });
type UploadBody = z.output<typeof uploadBodySchema>;

/**
 * Multer (bộ nhớ) cho field `file`: trần cứng dùng chung `PDF_MAX_BYTES` (20MB) cho MỌI type — DoS guard
 * trước khi biết `type` (busboy có thể đọc field `file` trước field `type` trong multipart), tránh phụ
 * thuộc thứ tự field. `SheetsService` kiểm dung lượng chính xác theo `type` sau khi đã nhận đủ file
 * (vd. MIDI > 2MB → 413 với thông điệp riêng).
 */
const MulterSheetFileInterceptor = FileInterceptor('file', {
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
class SheetFileUploadInterceptor implements NestInterceptor {
  private readonly multer = new MulterSheetFileInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, UPLOAD_HARD_LIMIT_MESSAGE);
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

/**
 * `:type` của `DELETE /admin/sheets/:id/files/:type` — chữ thường, không phân biệt hoa thường
 * (`removeFileTypeSchema`); sai thì 400 `VALIDATION_FAILED` tại `type`.
 */
@Injectable()
class RemoveFileTypeParamPipe implements PipeTransform<string, UploadableFileType> {
  transform(value: string): UploadableFileType {
    const result = removeFileTypeSchema.safeParse(value.toLowerCase());
    if (!result.success) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'type', message: result.error.issues[0]?.message ?? 'Loại file không hợp lệ.' },
      ]);
    }
    return result.data.toUpperCase() as UploadableFileType;
  }
}

/** Upload/gỡ file của Sheet (Story 1.6: PDF; Story 1.7: MIDI, MP3). Route `/admin/*` được guard JWT global bảo vệ. */
@Controller('admin/sheets')
export class SheetFilesController {
  constructor(private readonly sheets: SheetsService) {}

  @Post(':id/files')
  @UseInterceptors(SheetFileUploadInterceptor)
  upload(
    @Param('id', UuidParamPipe) id: string,
    @Body({ schema: uploadBodySchema }) body: UploadBody,
    @UploadedFile() file: MulterFile | undefined,
  ): Promise<Sheet> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'file', message: 'Vui lòng chọn file để upload.' },
      ]);
    }
    return this.sheets.attachFile(id, body.type, {
      buffer: file.buffer,
      originalName: decodeOriginalName(file.originalname),
    });
  }

  @Delete(':id/files/:type')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @Param('type', RemoveFileTypeParamPipe) type: UploadableFileType,
  ): Promise<void> {
    await this.sheets.removeFile(id, type);
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
