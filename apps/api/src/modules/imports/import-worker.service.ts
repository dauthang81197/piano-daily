import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Midi } from '@tonejs/midi';
import { IMPORT_DEFAULT_COMPOSER_NAME, type ImportItemError, type ImportItemStep, titleFromFileName } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Env } from '../../config/env';
import { PrismaService } from '../../prisma/prisma.service';
import { ComposersService } from '../catalog/composers.service';
import { SheetsService } from '../catalog/sheets.service';
import { StorageService } from '../media/storage.service';
import { MusicscoreClient, MusicscoreError } from '../scores/musicscore.client';

/** Tổng số lần thử một dòng khi dịch vụ chuyển nhạc tạm lỗi (lần đầu + thử lại). */
export const IMPORT_MAX_ATTEMPTS = 3;

const MESSAGE: Record<ImportItemError, string> = {
  SCORE_UNREADABLE: 'Không nhận dạng được nốt nhạc trong file PDF này.',
  SCORE_UNAVAILABLE: 'Dịch vụ chuyển nhạc đang bận hoặc không phản hồi.',
  IMPORT_FILE_MISSING: 'Không còn file PDF gốc để xử lý.',
  IMPORT_FAILED: 'Không tạo được Sheet từ file này.',
};

interface Claimed {
  id: string;
  batchId: string;
  originalName: string;
  storageKey: string | null;
  sheetId: string | null;
  attempts: number;
}

class ItemFailure extends Error {
  constructor(
    readonly code: ImportItemError,
    message?: string,
  ) {
    super(message ?? MESSAGE[code]);
  }
}

/**
 * Chạy nền các dòng import: lấy dòng `PENDING` đến hạn (`FOR UPDATE SKIP LOCKED`), đổi PDF sang MIDI, tạo Sheet và đính PDF + MIDI
 * qua `SheetsService` (nên có thumbnail, trang, note-JSON như upload tay). DB là nguồn sự thật: khởi động lại thì dòng đang chạy
 * quay về `PENDING` (PDF vẫn trong kho). Không có hàng đợi ngoài; `kick()` được gọi khi có việc mới / vừa xong / đến hạn thử lại.
 */
@Injectable()
export class ImportWorkerService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(ImportWorkerService.name);
  private readonly concurrency: number;
  private readonly retryDelayMs: number;
  private active = 0;
  private pumping = false;
  /** Có `kick()` đến khi vòng đang chạy: chạy thêm một vòng để không mất tín hiệu. */
  private again = false;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly client: MusicscoreClient,
    private readonly sheets: SheetsService,
    private readonly composers: ComposersService,
    config: ConfigService<Env, true>,
  ) {
    this.concurrency = config.get('IMPORT_CONCURRENCY', { infer: true });
    this.retryDelayMs = config.get('IMPORT_RETRY_DELAY_MS', { infer: true });
  }

  async onApplicationBootstrap(): Promise<void> {
    try {
      const recovered = await this.prisma.sheetImportItem.updateMany({
        where: { status: 'PROCESSING' },
        data: { status: 'PENDING', step: null },
      });
      if (recovered.count > 0) this.logger.warn({ recovered: recovered.count }, 'Đưa dòng import dở dang sau khi khởi động về PENDING');
    } catch (err) {
      this.logger.error({ err }, 'Không khôi phục được dòng import dở dang');
    }
    this.kick();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
  }

  /** Chạy tiếp các dòng đến hạn (không chờ). An toàn khi gọi nhiều lần. */
  kick(): void {
    if (this.stopped || !this.client.enabled()) return;
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (this.pumping) {
      this.again = true;
      return;
    }
    this.pumping = true;
    try {
      do {
        this.again = false;
        while (!this.stopped && this.active < this.concurrency) {
          const item = await this.claim();
          if (!item) break;
          this.active += 1;
          void this.process(item).finally(() => {
            this.active -= 1;
            this.kick();
          });
        }
        await this.scheduleNext();
      } while (this.again && !this.stopped);
    } catch (err) {
      this.logger.error({ err }, 'Vòng chạy import gặp lỗi');
    } finally {
      this.pumping = false;
    }
  }

  /** Hẹn chạy lại đúng lúc dòng chờ thử lại đến hạn. */
  private async scheduleNext(): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.stopped) return;
    const next = await this.prisma.sheetImportItem.findFirst({ where: { status: 'PENDING' }, orderBy: { runAfter: 'asc' }, select: { runAfter: true } });
    if (!next) return;
    const wait = Math.max(0, next.runAfter.getTime() - Date.now());
    if (wait === 0) return; // đã đến hạn: sẽ được claim khi một việc đang chạy xong
    this.timer = setTimeout(() => this.kick(), Math.min(wait + 50, 2 ** 31 - 1));
    this.timer.unref();
  }

  private async claim(): Promise<Claimed | null> {
    const rows = await this.prisma.$queryRaw<Claimed[]>`
      UPDATE sheet_import_items
         SET status = 'PROCESSING', step = 'CONVERTING', attempts = attempts + 1,
             started_at = COALESCE(started_at, now()), error_code = NULL, error_message = NULL
       WHERE id = (SELECT i.id FROM sheet_import_items i
                    WHERE i.status = 'PENDING' AND i.run_after <= now()
                    ORDER BY i.created_at, i.id
                    FOR UPDATE SKIP LOCKED
                    LIMIT 1)
   RETURNING id, batch_id AS "batchId", original_name AS "originalName", storage_key AS "storageKey", sheet_id AS "sheetId", attempts`;
    return rows[0] ?? null;
  }

  private async setStep(id: string, step: ImportItemStep, sheetId?: string): Promise<void> {
    await this.prisma.sheetImportItem.updateMany({ where: { id, status: 'PROCESSING' }, data: { step, ...(sheetId ? { sheetId } : {}) } });
  }

  private async process(item: Claimed): Promise<void> {
    let sheetId = item.sheetId;
    try {
      // Còn Sheet dở từ lần chạy trước (API chết giữa chừng): xoá đi, làm lại từ đầu để không trùng.
      if (sheetId) sheetId = await this.discardSheet(item.id, sheetId);
      const batch = await this.prisma.sheetImportBatch.findUnique({ where: { id: item.batchId } });
      if (!batch) throw new ItemFailure('IMPORT_FAILED');
      const pdf = item.storageKey ? await this.storage.getObject(item.storageKey) : null;
      if (!pdf) throw new ItemFailure('IMPORT_FILE_MISSING');

      const midi = await this.convert(pdf);
      const title = titleFromFileName(item.originalName);
      await this.setStep(item.id, 'CREATING');
      const composerId = batch.composerId ?? (await this.defaultComposerId());
      // Đăng luôn thì phải miễn phí: Sheet công khai bắt buộc miễn phí hoặc có giá, mà import không đặt giá.
      const sheet = await this.sheets.create({ title, composerId, level: batch.level, genreIds: batch.genreIds, isFree: batch.publish });
      sheetId = sheet.id;
      await this.setStep(item.id, 'ATTACHING', sheet.id);
      await this.sheets.attachFile(sheet.id, 'PDF', { buffer: pdf, originalName: item.originalName });
      await this.sheets.attachFile(sheet.id, 'MIDI', { buffer: midi, originalName: `${title}.mid` });
      if (batch.publish) await this.sheets.setStatus(sheet.id, 'PUBLISHED');

      await this.prisma.sheetImportItem.updateMany({
        where: { id: item.id, status: 'PROCESSING' },
        data: { status: 'DONE', step: null, storageKey: null, errorCode: null, errorMessage: null, finishedAt: new Date() },
      });
      await this.discardObject(item.storageKey);
    } catch (err) {
      await this.fail(item, sheetId, err);
    }
  }

  private async convert(pdf: Buffer): Promise<Buffer> {
    const buffer = await this.client.toMidi(pdf, 'pdf', 0);
    let midi: Midi;
    try {
      midi = new Midi(buffer);
    } catch {
      throw new MusicscoreError('unreadable', 'MIDI trả về không đọc được');
    }
    if (midi.tracks.reduce((sum, track) => sum + track.notes.length, 0) === 0) {
      throw new MusicscoreError('unreadable', 'Không nhận dạng được nốt nào');
    }
    return buffer;
  }

  /** Composer mặc định "Chưa rõ": dùng lại nếu có (không phân biệt hoa thường), không thì tạo. */
  async defaultComposerId(): Promise<string> {
    const existing = await this.prisma.composer.findFirst({
      where: { name: { equals: IMPORT_DEFAULT_COMPOSER_NAME, mode: 'insensitive' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    return (await this.composers.create({ name: IMPORT_DEFAULT_COMPOSER_NAME })).id;
  }

  private async fail(item: Claimed, sheetId: string | null, err: unknown): Promise<void> {
    const reason = err instanceof Error ? err.message : String(err);
    try {
      if (sheetId) await this.discardSheet(item.id, sheetId);
      let code: ImportItemError;
      let message: string;
      if (err instanceof ItemFailure) {
        code = err.code;
        message = err.message;
      } else if (err instanceof MusicscoreError) {
        code = err.kind === 'unreadable' ? 'SCORE_UNREADABLE' : 'SCORE_UNAVAILABLE';
        message = MESSAGE[code];
      } else if (err instanceof AppException) {
        code = 'IMPORT_FAILED';
        message = err.message || MESSAGE.IMPORT_FAILED;
      } else {
        code = 'IMPORT_FAILED';
        message = MESSAGE.IMPORT_FAILED;
      }
      const retry = code === 'SCORE_UNAVAILABLE' && item.attempts < IMPORT_MAX_ATTEMPTS;
      this.logger.warn({ id: item.id, code, attempts: item.attempts, retry, reason }, 'Import một dòng thất bại');
      await this.prisma.sheetImportItem.updateMany({
        where: { id: item.id, status: 'PROCESSING' },
        data: retry
          ? { status: 'PENDING', step: null, errorCode: code, errorMessage: message, runAfter: new Date(Date.now() + this.retryDelayMs * item.attempts) }
          : { status: 'FAILED', step: null, errorCode: code, errorMessage: message, finishedAt: new Date() },
      });
    } catch (dbErr) {
      // Dòng còn PROCESSING: khởi động lại sẽ đưa về PENDING.
      this.logger.error({ id: item.id, err: dbErr }, 'Không ghi được kết quả của dòng import');
    }
  }

  /** Xoá Sheet vừa tạo dở (xoá hẳn vì chưa có đơn) và bỏ liên kết ở dòng. Luôn trả `null`. */
  private async discardSheet(itemId: string, sheetId: string): Promise<null> {
    try {
      await this.sheets.remove(sheetId);
    } catch (err) {
      this.logger.warn({ itemId, sheetId, err }, 'Không xoá được Sheet dở dang của dòng import');
    }
    await this.prisma.sheetImportItem.updateMany({ where: { id: itemId }, data: { sheetId: null } });
    return null;
  }

  private async discardObject(key: string | null): Promise<void> {
    if (!key) return;
    try {
      await this.storage.deleteObjects([key]);
    } catch (err) {
      this.logger.warn({ key, err }, 'Không xoá được PDF tạm của import');
    }
  }
}
