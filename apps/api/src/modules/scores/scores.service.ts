import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Midi } from '@tonejs/midi';
import { createHash } from 'node:crypto';
import {
  detectScoreFileKind,
  ErrorCode,
  type ScoreConversion,
  type ScoreFileKind,
  type ScoreJobError,
  scoreTransposeSchema,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { CustomerAccessService } from '../customers/customer-access.service';
import { StorageService } from '../media/storage.service';
import { MusicscoreClient, MusicscoreError } from './musicscore.client';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Link tải MIDI ký sẵn: đủ để bấm tải, ngắn để không chia sẻ lâu dài. */
const MIDI_URL_TTL_SECONDS = 15 * 60;
const MIDI_DOWNLOAD_NAME = 'piano-daily-score.mid';
const NOT_FOUND = 'Không tìm thấy bản chuyển đổi (có thể đã hết hạn).';

type Row = {
  id: string;
  status: string;
  originalName: string | null;
  transpose: number;
  errorCode: string | null;
  midiKey: string | null;
  noteJsonKey: string | null;
  durationSeconds: number | null;
  noteCount: number | null;
  createdAt: Date;
  expiresAt: Date;
};

/**
 * Chuyển PDF/ảnh/MusicXML bản nhạc sang MIDI cho khách (kết quả tạm). File gốc chỉ nằm trong bộ nhớ tới khi xử lý xong;
 * chỉ MIDI (private) và note-JSON (public, khoá không đoán được) được lưu và bị xoá khi hết hạn. Dòng DB là nguồn sự thật
 * của trạng thái nên khởi động lại không để việc kẹt (xem `ScoreGcService`).
 */
@Injectable()
export class ScoresService {
  private readonly logger = new Logger(ScoresService.name);
  private running = 0;
  private readonly maxBytes: number;
  private readonly dailyLimit: number;
  private readonly ttlMs: number;
  private readonly maxConcurrent: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly client: MusicscoreClient,
    private readonly access: CustomerAccessService,
    config: ConfigService<Env, true>,
  ) {
    this.maxBytes = config.get('SCORE_MAX_UPLOAD_MB', { infer: true }) * 1024 * 1024;
    this.dailyLimit = config.get('SCORE_DAILY_LIMIT', { infer: true });
    this.ttlMs = config.get('SCORE_RESULT_TTL_HOURS', { infer: true }) * HOUR_MS;
    this.maxConcurrent = config.get('SCORE_MAX_CONCURRENT', { infer: true });
  }

  /** Tạo việc và chạy nền; trả ngay bản ghi `PENDING`. */
  async create(customerId: string, file: { buffer: Buffer; originalName?: string }, transposeInput: unknown): Promise<ScoreConversion> {
    if (!this.client.enabled()) {
      throw new AppException(ErrorCode.FEATURE_DISABLED, HttpStatus.SERVICE_UNAVAILABLE, 'Tính năng chuyển PDF sang MIDI chưa được mở.');
    }
    // Cùng điều kiện với tải file: tài khoản còn hoạt động và đã xác minh email.
    await this.access.requireDownloadAccess(customerId);
    const transpose = scoreTransposeSchema.safeParse(transposeInput ?? 0);
    if (!transpose.success) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
        { path: 'transpose', message: 'Dịch giọng phải là số nguyên từ -12 đến 12 nửa cung.' },
      ]);
    }
    if (file.buffer.length === 0) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path: 'file', message: 'File rỗng.' }]);
    }
    if (file.buffer.length > this.maxBytes) {
      throw new AppException(ErrorCode.FILE_TOO_LARGE, HttpStatus.PAYLOAD_TOO_LARGE, `File vượt quá ${this.maxBytes / (1024 * 1024)}MB.`);
    }
    const kind = detectScoreFileKind(file.buffer);
    if (!kind) {
      throw new AppException(
        ErrorCode.UNSUPPORTED_FILE_TYPE,
        HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        'Chỉ nhận PDF, ảnh (PNG, JPEG, TIFF) hoặc MusicXML.',
      );
    }
    // Từ chối sớm khi API đang chạy đủ số việc: không tạo dòng nào, khách thử lại sau.
    if (this.running >= this.maxConcurrent) {
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE, 'Hệ thống đang bận chuyển nhạc, vui lòng thử lại sau ít phút.');
    }

    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      // Khoá theo khách để hai request song song không cùng lọt qua kiểm tra "một việc đang chạy" / hạn mức.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${customerId}))`;
      const active = await tx.scoreConversion.findFirst({
        where: { customerId, status: { in: ['PENDING', 'PROCESSING'] }, expiresAt: { gt: now } },
        select: { id: true },
      });
      if (active) {
        throw new AppException(ErrorCode.SCORE_ACTIVE_JOB, HttpStatus.TOO_MANY_REQUESTS, 'Bạn đang có một bản nhạc được chuyển, hãy đợi nó xong.', { id: active.id });
      }
      const counted = await tx.scoreConversion.findMany({
        where: { customerId, createdAt: { gte: new Date(now.getTime() - DAY_MS) }, NOT: { status: 'FAILED', errorCode: 'SCORE_UNAVAILABLE' } },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      if (counted.length >= this.dailyLimit) {
        const slot = counted[counted.length - this.dailyLimit]!;
        const retryAfterSeconds = Math.max(1, Math.ceil((slot.createdAt.getTime() + DAY_MS - now.getTime()) / 1000));
        throw new AppException(ErrorCode.SCORE_DAILY_LIMIT, HttpStatus.TOO_MANY_REQUESTS, 'Bạn đã dùng hết lượt chuyển nhạc hôm nay.', { retryAfterSeconds });
      }
      return tx.scoreConversion.create({
        data: {
          customerId,
          originalName: (file.originalName ?? '').replaceAll('\u0000', '').slice(0, 200) || null,
          transpose: transpose.data,
          expiresAt: new Date(now.getTime() + this.ttlMs),
        },
      });
    });

    this.running += 1;
    void this.run(row.id, file.buffer, kind, transpose.data).finally(() => {
      this.running -= 1;
    });
    return this.toDto(row);
  }

  /** Chạy nền: gọi `musicscore`, tạo note-JSON, lưu object, cập nhật dòng. Không bao giờ ném. */
  private async run(id: string, buffer: Buffer, kind: ScoreFileKind, transpose: number): Promise<void> {
    const written: string[] = [];
    try {
      const started = await this.prisma.scoreConversion.updateMany({ where: { id, status: 'PENDING' }, data: { status: 'PROCESSING' } });
      if (started.count === 0) return; // đã bị xoá/hết hạn trước khi bắt đầu
      const midiBuffer = await this.client.toMidi(buffer, kind, transpose);
      let midi: Midi;
      try {
        midi = new Midi(midiBuffer);
      } catch {
        throw new MusicscoreError('unreadable', 'MIDI trả về không đọc được');
      }
      const noteCount = midi.tracks.reduce((sum, track) => sum + track.notes.length, 0);
      if (noteCount === 0) throw new MusicscoreError('unreadable', 'Không nhận dạng được nốt nào');
      const jsonBuffer = Buffer.from(JSON.stringify(midi.toJSON()), 'utf8');
      const midiKey = `private/conversions/${id}/${sha256(midiBuffer)}.mid`;
      const noteJsonKey = `public/conversions/${id}/${sha256(jsonBuffer)}.json`;
      await this.storage.putPrivate(midiKey, midiBuffer, 'audio/midi');
      written.push(midiKey);
      await this.storage.putPublic(noteJsonKey, jsonBuffer, 'application/json');
      written.push(noteJsonKey);
      const done = await this.prisma.scoreConversion.updateMany({
        where: { id, status: 'PROCESSING' },
        data: { status: 'DONE', midiKey, noteJsonKey, durationSeconds: midi.duration, noteCount, finishedAt: new Date() },
      });
      // Khách xoá (hoặc dọn hết hạn) giữa chừng: dòng không còn, không để object mồ côi.
      if (done.count === 0) await this.discardQuietly(written);
    } catch (err) {
      const code: ScoreJobError = err instanceof MusicscoreError && err.kind === 'unreadable' ? 'SCORE_UNREADABLE' : 'SCORE_UNAVAILABLE';
      this.logger.warn({ id, code, reason: err instanceof Error ? err.message : String(err) }, 'Chuyển nhạc thất bại');
      await this.discardQuietly(written);
      try {
        await this.prisma.scoreConversion.updateMany({
          where: { id, status: { in: ['PENDING', 'PROCESSING'] } },
          data: { status: 'FAILED', errorCode: code, finishedAt: new Date() },
        });
      } catch (dbErr) {
        this.logger.error({ id, err: dbErr }, 'Không ghi được trạng thái FAILED; GC sẽ dọn');
      }
    }
  }

  async get(customerId: string, id: string): Promise<ScoreConversion> {
    const row = await this.prisma.scoreConversion.findFirst({ where: { id, customerId, expiresAt: { gt: new Date() } } });
    if (!row) throw notFound(NOT_FOUND);
    return this.toDto(row, true);
  }

  async remove(customerId: string, id: string): Promise<void> {
    const row = await this.prisma.scoreConversion.findFirst({ where: { id, customerId }, select: { midiKey: true, noteJsonKey: true } });
    if (!row) throw notFound(NOT_FOUND);
    await this.prisma.scoreConversion.deleteMany({ where: { id, customerId } });
    await this.discardQuietly([row.midiKey, row.noteJsonKey].filter((k): k is string => k !== null));
  }

  /** GC: xoá việc hết hạn (dòng rồi object). Trả số dòng đã xoá. */
  async deleteExpired(now = new Date()): Promise<number> {
    const rows = await this.prisma.scoreConversion.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true, midiKey: true, noteJsonKey: true },
      take: 200,
    });
    if (rows.length === 0) return 0;
    await this.prisma.scoreConversion.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    await this.discardQuietly(rows.flatMap((r) => [r.midiKey, r.noteJsonKey]).filter((k): k is string => k !== null));
    return rows.length;
  }

  /**
   * Đưa việc kẹt sang FAILED. `all=true` (lúc khởi động) coi mọi việc dang dở là kẹt vì tiến trình chạy chúng đã mất;
   * ngược lại chỉ việc quá thời gian chờ tối đa.
   */
  async failStuck(all: boolean, now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - (this.client.timeoutMs() + 2 * 60_000));
    const res = await this.prisma.scoreConversion.updateMany({
      where: { status: { in: ['PENDING', 'PROCESSING'] }, ...(all ? {} : { createdAt: { lt: cutoff } }) },
      data: { status: 'FAILED', errorCode: 'SCORE_UNAVAILABLE', finishedAt: now },
    });
    return res.count;
  }

  private async discardQuietly(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.storage.deleteObjects(keys);
    } catch (err) {
      // Object mồ côi chỉ tốn dung lượng; không để lỗi dọn dẹp làm hỏng luồng chính.
      this.logger.error({ err, keys: keys.length }, 'Không xoá được object tạm của bản chuyển nhạc');
    }
  }

  private async toDto(row: Row, withResult = false): Promise<ScoreConversion> {
    const done = withResult && row.status === 'DONE' && row.midiKey && row.noteJsonKey;
    return {
      id: row.id,
      status: row.status as ScoreConversion['status'],
      originalName: row.originalName,
      transpose: row.transpose,
      createdAt: row.createdAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      result: done
        ? {
            noteJsonUrl: this.storage.publicUrl(row.noteJsonKey!),
            midiUrl: await this.storage.presignPrivateUrl(row.midiKey!, MIDI_URL_TTL_SECONDS, MIDI_DOWNLOAD_NAME),
            durationSeconds: row.durationSeconds,
            noteCount: row.noteCount,
          }
        : null,
      error: row.status === 'FAILED' ? ((row.errorCode as ScoreJobError | null) ?? 'SCORE_UNAVAILABLE') : null,
    };
  }
}

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}
