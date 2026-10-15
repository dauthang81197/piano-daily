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
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  type AdminCourseTree,
  type AdminLesson,
  type AdminTrack,
  type CourseKind,
  courseKindSchema,
  ErrorCode,
  MIDI_MAX_BYTES,
  type MoveBody,
  moveBodySchema,
  setCoursePublishedBodySchema,
} from '@piano-daily/shared';
import type { Observable } from 'rxjs';
import { PipeTransform } from '@nestjs/common';
import { AppException } from '../../common/http-exception.filter';
import { notFound, UuidParamPipe } from '../catalog/catalog.helpers';
import { BillingSuperAdminGuard } from '../billing/super-admin.guard';
import { CoursesService, parseBody } from './courses.service';
import { LessonMidiService } from './lesson-midi.service';

/** `:kind` sai → 404 (route không tồn tại), không phải 400. */
@Injectable()
class CourseKindPipe implements PipeTransform<string, CourseKind> {
  transform(value: string): CourseKind {
    const parsed = courseKindSchema.safeParse(value);
    if (!parsed.success) throw notFound('Không tìm thấy.');
    return parsed.data;
  }
}

const MulterMidiInterceptor = FileInterceptor('file', {
  limits: { fileSize: MIDI_MAX_BYTES, files: 1, fields: 5, parts: 6 },
  defParamCharset: 'utf8',
});

/** Bọc multer: vượt 2MB thành 413 `FILE_TOO_LARGE`; lỗi multipart khác thành 400 tại `file`. */
@Injectable()
class MidiUploadInterceptor implements NestInterceptor {
  private readonly multer = new MulterMidiInterceptor();

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    try {
      return await this.multer.intercept(context, next);
    } catch (err) {
      if (err instanceof PayloadTooLargeException) {
        throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, `File MIDI vượt quá ${MIDI_MAX_BYTES / (1024 * 1024)}MB.`);
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

/** Soạn khoá học cho admin. Xem: mọi admin đã đăng nhập; ghi, upload, đổi thứ tự, xoá: chỉ SUPER_ADMIN. */
@Controller('admin/courses')
export class AdminCoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly lessonMidi: LessonMidiService,
  ) {}

  @Get('tracks')
  listTracks(): Promise<AdminTrack[]> {
    return this.courses.listTracks();
  }

  @Get('tracks/:id/tree')
  tree(@Param('id', UuidParamPipe) id: string): Promise<AdminCourseTree> {
    return this.courses.tree(id);
  }

  @Post(':kind')
  @UseGuards(BillingSuperAdminGuard)
  create(@Param('kind', CourseKindPipe) kind: CourseKind, @Body() body: unknown) {
    return this.courses.create(kind, body);
  }

  /** Nhạc của bài học: khai báo trước `:kind/:id` để `lessons/:id/midi` không bị bắt nhầm. */
  @Post('lessons/:id/midi')
  @UseGuards(BillingSuperAdminGuard)
  @UseInterceptors(MidiUploadInterceptor)
  @HttpCode(HttpStatus.OK)
  async uploadMidi(
    @Param('id', UuidParamPipe) id: string,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
  ): Promise<AdminLesson> {
    if (!file) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'file', message: 'Vui lòng chọn file MIDI để tải lên.' },
      ]);
    }
    return this.lessonMidi.attach(id, { buffer: file.buffer, originalName: file.originalname });
  }

  /** File `.mid` gốc của bài cho trình gõ nốt (mọi admin xem được; không có URL private nên đi qua API). */
  @Header('Cache-Control', 'no-store')
  @Get('lessons/:id/midi/file')
  async midiFile(@Param('id', UuidParamPipe) id: string): Promise<StreamableFile> {
    const { buffer, name } = await this.lessonMidi.readOriginal(id);
    return new StreamableFile(buffer, { type: 'application/octet-stream', disposition: `attachment; filename="${name}"`, length: buffer.length });
  }

  @Delete('lessons/:id/midi')
  @UseGuards(BillingSuperAdminGuard)
  removeMidi(@Param('id', UuidParamPipe) id: string): Promise<AdminLesson> {
    return this.lessonMidi.detach(id);
  }

  @Patch(':kind/:id')
  @UseGuards(BillingSuperAdminGuard)
  update(@Param('kind', CourseKindPipe) kind: CourseKind, @Param('id', UuidParamPipe) id: string, @Body() body: unknown) {
    return this.courses.update(kind, id, body);
  }

  @Patch(':kind/:id/published')
  @UseGuards(BillingSuperAdminGuard)
  setPublished(@Param('kind', CourseKindPipe) kind: CourseKind, @Param('id', UuidParamPipe) id: string, @Body() body: unknown) {
    return this.courses.setPublished(kind, id, parseBody(setCoursePublishedBodySchema, body).isPublished);
  }

  @Post(':kind/:id/move')
  @UseGuards(BillingSuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  move(@Param('kind', CourseKindPipe) kind: CourseKind, @Param('id', UuidParamPipe) id: string, @Body() body: unknown): Promise<void> {
    return this.courses.move(kind, id, parseBody(moveBodySchema, body) as MoveBody);
  }

  @Delete(':kind/:id')
  @UseGuards(BillingSuperAdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('kind', CourseKindPipe) kind: CourseKind, @Param('id', UuidParamPipe) id: string): Promise<void> {
    return this.courses.remove(kind, id);
  }
}
