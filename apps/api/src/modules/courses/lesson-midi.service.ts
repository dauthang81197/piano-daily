import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type AdminLesson,
  ErrorCode,
  hasMidiMagic,
  MIDI_MAX_BYTES,
  MIDI_TOO_LARGE_MESSAGE,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { StorageService } from '../media/storage.service';
import { MidiProcessingError, type MediaUpload, SheetMediaService, StorageWriteError } from '../media/sheet-media.service';
import { CoursesService } from './courses.service';
import { assertLessonHasPart } from './course-helpers';

const WRONG_TYPE = 'File phải là MIDI (.mid) hợp lệ.';

/**
 * Nhạc của bài học (C1): upload/thay/gỡ file MIDI. Dùng lại pipeline MIDI của `media` (parse `@tonejs/midi`, file gốc private,
 * note-JSON public). Lỗi giữa chừng không để lại dòng DB trỏ vào object không tồn tại; object cũ chỉ bị xoá SAU khi DB commit.
 */
@Injectable()
export class LessonMidiService {
  private readonly logger = new Logger(LessonMidiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly media: SheetMediaService,
    private readonly courses: CoursesService,
    private readonly storage: StorageService,
  ) {}

  /** File `.mid` gốc của bài (để trình gõ nốt của admin mở lại); bài lạ hoặc chưa có nhạc → 404. */
  async readOriginal(lessonId: string): Promise<{ buffer: Buffer; name: string }> {
    const row = await this.prisma.courseLesson.findUnique({ where: { id: lessonId }, select: { midiStorageKey: true } });
    if (!row?.midiStorageKey) throw notFound('Bài học chưa có nhạc.');
    const buffer = await this.storage.getObject(row.midiStorageKey);
    if (!buffer) throw notFound('Bài học chưa có nhạc.');
    return { buffer, name: `bai-${lessonId}.mid` };
  }

  async attach(lessonId: string, upload: MediaUpload): Promise<AdminLesson> {
    const exists = await this.prisma.courseLesson.findUnique({ where: { id: lessonId }, select: { id: true } });
    if (!exists) throw (await this.lessonMissing());
    if (!hasMidiMagic(upload.buffer)) throw new AppException(ErrorCode.UNSUPPORTED_FILE_TYPE, HttpStatus.UNSUPPORTED_MEDIA_TYPE, WRONG_TYPE);
    if (upload.buffer.length > MIDI_MAX_BYTES) throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, MIDI_TOO_LARGE_MESSAGE);

    let stored;
    try {
      stored = await this.media.storeLessonMidi(lessonId, upload);
    } catch (err) {
      if (err instanceof MidiProcessingError) {
        throw new AppException(ErrorCode.FILE_PROCESSING_FAILED, HttpStatus.UNPROCESSABLE_ENTITY, err.reason, { reason: err.reason });
      }
      if (err instanceof StorageWriteError) {
        this.logger.error({ err: err.cause, lessonId }, 'Ghi nhạc bài học thất bại, xoá object vừa ghi');
        await this.discardUnreferenced(err.keys);
        throw err.cause;
      }
      throw err;
    }

    let oldKeys: string[] = [];
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        const current = await this.courses.lockLesson(tx, lessonId);
        oldKeys = [current.midiStorageKey, current.noteJsonKey].filter((k): k is string => k !== null);
        return tx.courseLesson.update({
          where: { id: lessonId },
          data: {
            midiStorageKey: stored.midi.storageKey,
            noteJsonKey: stored.json.storageKey,
            midiOriginalName: (upload.originalName ?? '').replaceAll('\u0000', '').slice(0, 200) || null,
            midiDurationSeconds: stored.midi.durationSeconds ?? null,
            midiNoteCount: stored.midi.noteCount ?? null,
          },
        });
      });
      // Object cũ (nếu khác key mới) xoá sau commit; upload lại đúng nội dung cũ cho cùng key nên không bị xoá nhầm.
      await this.courses.discardQuietly(oldKeys.filter((k) => !stored.keys.includes(k)));
      this.courses.revalidate();
      return this.courses.toLesson(row);
    } catch (err) {
      this.logger.error({ err, lessonId }, 'Commit nhạc bài học thất bại, xoá object vừa ghi');
      await this.discardUnreferenced(stored.keys);
      throw err;
    }
  }

  /** Gỡ nhạc; bài đang công khai mà nhạc là phần duy nhất thì không gỡ (400). */
  async detach(lessonId: string): Promise<AdminLesson> {
    let keys: string[] = [];
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await this.courses.lockLesson(tx, lessonId);
      if (current.noteJsonKey === null) {
        throw new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Bài học chưa có nhạc.');
      }
      assertLessonHasPart({ isPublished: current.isPublished, youtubeUrl: current.youtubeUrl, content: current.content, hasMidi: false });
      keys = [current.midiStorageKey, current.noteJsonKey].filter((k): k is string => k !== null);
      return tx.courseLesson.update({
        where: { id: lessonId },
        data: { midiStorageKey: null, noteJsonKey: null, midiOriginalName: null, midiDurationSeconds: null, midiNoteCount: null },
      });
    });
    await this.courses.discardQuietly(keys);
    this.courses.revalidate();
    return this.courses.toLesson(row);
  }

  /** Xoá object vừa ghi trừ key đang được một bài học tham chiếu (upload lại đúng nội dung cũ cho cùng key). */
  private async discardUnreferenced(keys: string[]): Promise<void> {
    try {
      const rows = await this.prisma.courseLesson.findMany({
        where: { OR: [{ midiStorageKey: { in: keys } }, { noteJsonKey: { in: keys } }] },
        select: { midiStorageKey: true, noteJsonKey: true },
      });
      const referenced = new Set(rows.flatMap((r) => [r.midiStorageKey, r.noteJsonKey]));
      await this.media.discard(keys.filter((k) => !referenced.has(k)));
    } catch (err) {
      this.logger.error({ err }, 'Không kiểm tra được key đang dùng; bỏ qua xoá object');
    }
  }

  private async lessonMissing(): Promise<AppException> {
    return new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, 'Không tìm thấy bài học.');
  }
}
