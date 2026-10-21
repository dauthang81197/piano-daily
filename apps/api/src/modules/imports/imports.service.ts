import { HttpStatus, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  type CreateSheetImportBody,
  detectScoreFileKind,
  ErrorCode,
  IMPORT_MAX_FILES,
  type ImportItemError,
  type ImportItemStatus,
  type ImportItemStep,
  type Level,
  type Page,
  type SheetImportBatch,
  type SheetImportCounts,
  type SheetImportDetail,
  type SheetImportItem,
  type SheetImportListQuery,
  sheetImportBatchStatus,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from '../catalog/catalog.helpers';
import { StorageService } from '../media/storage.service';
import { MusicscoreClient } from '../scores/musicscore.client';
import { ImportWorkerService } from './import-worker.service';

const NOT_FOUND = 'Không tìm thấy đợt import.';
const ITEM_NOT_FOUND = 'Không tìm thấy file trong đợt import.';

const BATCH_SELECT = {
  id: true,
  level: true,
  composerId: true,
  genreIds: true,
  publish: true,
  cancelledAt: true,
  createdAt: true,
  composer: { select: { name: true } },
} as const;

type BatchRow = {
  id: string;
  level: string;
  composerId: string | null;
  genreIds: string[];
  publish: boolean;
  cancelledAt: Date | null;
  createdAt: Date;
  composer: { name: string } | null;
};

const emptyCounts = (): SheetImportCounts => ({ total: 0, pending: 0, processing: 0, done: 0, failed: 0, cancelled: 0 });
const COUNT_KEY: Record<ImportItemStatus, Exclude<keyof SheetImportCounts, 'total'>> = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  DONE: 'done',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

function toBatch(row: BatchRow, counts: SheetImportCounts): SheetImportBatch {
  return {
    id: row.id,
    status: sheetImportBatchStatus(counts, row.cancelledAt !== null),
    level: row.level as Level,
    composerId: row.composerId,
    composerName: row.composer?.name ?? null,
    genreIds: row.genreIds,
    publish: row.publish,
    counts,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Đợt import Sheet hàng loạt của admin: tạo đợt (cấu hình mặc định), tải từng PDF lên (mỗi file một dòng, lưu private), xem tiến độ,
 * huỷ / thử lại / xoá. Việc chạy nền nằm ở `ImportWorkerService`; DB là nguồn sự thật của trạng thái.
 */
@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly client: MusicscoreClient,
    private readonly worker: ImportWorkerService,
  ) {}

  async create(body: CreateSheetImportBody): Promise<SheetImportDetail> {
    this.requireEnabled();
    const genreIds = body.genreIds ?? [];
    if (body.composerId) {
      const composer = await this.prisma.composer.findUnique({ where: { id: body.composerId }, select: { id: true } });
      if (!composer) throw this.invalid('composerId', 'Không tìm thấy Composer.');
    }
    if (genreIds.length > 0) {
      const found = await this.prisma.genre.count({ where: { id: { in: genreIds } } });
      if (found !== genreIds.length) throw this.invalid('genreIds', 'Có Genre không tồn tại.');
    }
    // Không chọn Composer thì dùng "Chưa rõ" (tìm hoặc tạo) ngay từ lúc tạo đợt để bảng hiển thị đúng tên.
    const composerId = body.composerId ?? (await this.worker.defaultComposerId());
    const row = await this.prisma.sheetImportBatch.create({
      data: { level: body.level, composerId, genreIds, publish: body.publish },
      select: BATCH_SELECT,
    });
    return { ...toBatch(row, emptyCounts()), items: [] };
  }

  /** Thêm một PDF vào đợt (một dòng `PENDING`) và đánh thức worker. */
  async addFile(batchId: string, file: { buffer: Buffer; originalName: string | null }): Promise<SheetImportItem> {
    this.requireEnabled();
    if (file.buffer.length === 0) throw this.invalid('file', 'File rỗng.');
    if (detectScoreFileKind(file.buffer) !== 'pdf') {
      throw new AppException(ErrorCode.UNSUPPORTED_FILE_TYPE, HttpStatus.UNSUPPORTED_MEDIA_TYPE, 'Chỉ nhận file PDF.');
    }
    const batch = await this.prisma.sheetImportBatch.findUnique({ where: { id: batchId }, select: { cancelledAt: true } });
    if (!batch) throw notFound(NOT_FOUND);
    if (batch.cancelledAt) throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.CONFLICT, 'Đợt import đã bị huỷ, không thêm file được.');

    const id = randomUUID();
    const storageKey = `private/imports/${batchId}/${id}.pdf`;
    await this.storage.putPrivate(storageKey, file.buffer, 'application/pdf');
    try {
      const row = await this.prisma.$transaction(async (tx) => {
        // Khoá theo đợt để các file tải song song không cùng lọt qua giới hạn số file.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${batchId}))`;
        const current = await tx.sheetImportItem.count({ where: { batchId } });
        if (current >= IMPORT_MAX_FILES) throw this.invalid('file', `Mỗi đợt tối đa ${IMPORT_MAX_FILES} file.`);
        return tx.sheetImportItem.create({
          data: { id, batchId, originalName: file.originalName?.slice(0, 255) || 'Chưa đặt tên.pdf', storageKey },
          include: { sheet: { select: { title: true } } },
        });
      });
      this.worker.kick();
      return toItem(row);
    } catch (err) {
      await this.discardObjects([storageKey]);
      throw err;
    }
  }

  async list(query: SheetImportListQuery): Promise<Page<SheetImportBatch>> {
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.sheetImportBatch.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: BATCH_SELECT,
      }),
      this.prisma.sheetImportBatch.count(),
    ]);
    const counts = await this.countsFor(rows.map((r) => r.id));
    return { items: rows.map((r) => toBatch(r, counts.get(r.id) ?? emptyCounts())), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<SheetImportDetail> {
    const row = await this.prisma.sheetImportBatch.findUnique({ where: { id }, select: BATCH_SELECT });
    if (!row) throw notFound(NOT_FOUND);
    const items = await this.prisma.sheetImportItem.findMany({
      where: { batchId: id },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      include: { sheet: { select: { title: true } } },
    });
    const counts = emptyCounts();
    for (const item of items) {
      counts.total += 1;
      counts[COUNT_KEY[item.status as ImportItemStatus]] += 1;
    }
    return { ...toBatch(row, counts), items: items.map(toItem) };
  }

  /** Huỷ cả đợt: dòng chưa chạy thành `CANCELLED` (xoá PDF); dòng đang chạy chạy nốt. */
  async cancel(id: string): Promise<SheetImportDetail> {
    const keys = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.sheetImportBatch.updateMany({ where: { id }, data: { cancelledAt: new Date() } });
      if (batch.count === 0) throw notFound(NOT_FOUND);
      const pending = await tx.sheetImportItem.findMany({ where: { batchId: id, status: 'PENDING' }, select: { id: true, storageKey: true } });
      await tx.sheetImportItem.updateMany({
        where: { id: { in: pending.map((p) => p.id) }, status: 'PENDING' },
        data: { status: 'CANCELLED', step: null, storageKey: null, finishedAt: new Date() },
      });
      return pending.map((p) => p.storageKey).filter((k): k is string => k !== null);
    });
    await this.discardObjects(keys);
    return this.get(id);
  }

  async cancelItem(batchId: string, itemId: string): Promise<SheetImportDetail> {
    const item = await this.findItem(batchId, itemId);
    const updated = await this.prisma.sheetImportItem.updateMany({
      where: { id: itemId, status: 'PENDING' },
      data: { status: 'CANCELLED', step: null, storageKey: null, finishedAt: new Date() },
    });
    if (updated.count === 0) throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.CONFLICT, 'Chỉ huỷ được file đang chờ chạy.');
    await this.discardObjects(item.storageKey ? [item.storageKey] : []);
    return this.get(batchId);
  }

  /** Thử lại một dòng `FAILED` (còn PDF gốc). */
  async retryItem(batchId: string, itemId: string): Promise<SheetImportDetail> {
    this.requireEnabled();
    await this.findItem(batchId, itemId);
    const updated = await this.prisma.sheetImportItem.updateMany({
      where: { id: itemId, status: 'FAILED', storageKey: { not: null } },
      data: { status: 'PENDING', step: null, attempts: 0, errorCode: null, errorMessage: null, runAfter: new Date(), startedAt: null, finishedAt: null },
    });
    if (updated.count === 0) throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.CONFLICT, 'Chỉ thử lại được file bị lỗi còn file gốc.');
    await this.prisma.sheetImportBatch.updateMany({ where: { id: batchId }, data: { cancelledAt: null } });
    this.worker.kick();
    return this.get(batchId);
  }

  /** Xoá đợt đã xong (và PDF còn lại); không xoá các Sheet đã tạo. */
  async remove(id: string): Promise<void> {
    const exists = await this.prisma.sheetImportBatch.findUnique({ where: { id }, select: { id: true } });
    if (!exists) throw notFound(NOT_FOUND);
    const keys = await this.prisma.$transaction(async (tx) => {
      const active = await tx.sheetImportItem.count({ where: { batchId: id, status: { in: ['PENDING', 'PROCESSING'] } } });
      if (active > 0) throw new AppException(ErrorCode.RESOURCE_IN_USE, HttpStatus.CONFLICT, 'Đợt còn file đang chờ hoặc đang chạy. Hãy huỷ đợt trước khi xoá.');
      const items = await tx.sheetImportItem.findMany({ where: { batchId: id, storageKey: { not: null } }, select: { storageKey: true } });
      await tx.sheetImportBatch.delete({ where: { id } });
      return items.map((i) => i.storageKey).filter((k): k is string => k !== null);
    });
    await this.discardObjects(keys);
  }

  private async findItem(batchId: string, itemId: string): Promise<{ storageKey: string | null }> {
    const item = await this.prisma.sheetImportItem.findFirst({ where: { id: itemId, batchId }, select: { storageKey: true } });
    if (!item) throw notFound(ITEM_NOT_FOUND);
    return item;
  }

  private async countsFor(batchIds: string[]): Promise<Map<string, SheetImportCounts>> {
    const map = new Map<string, SheetImportCounts>();
    if (batchIds.length === 0) return map;
    const groups = await this.prisma.sheetImportItem.groupBy({ by: ['batchId', 'status'], where: { batchId: { in: batchIds } }, _count: { _all: true } });
    for (const g of groups) {
      const counts = map.get(g.batchId) ?? emptyCounts();
      counts.total += g._count._all;
      counts[COUNT_KEY[g.status as ImportItemStatus]] += g._count._all;
      map.set(g.batchId, counts);
    }
    return map;
  }

  private requireEnabled(): void {
    if (!this.client.enabled()) {
      throw new AppException(ErrorCode.FEATURE_DISABLED, HttpStatus.SERVICE_UNAVAILABLE, 'Tính năng chuyển PDF sang MIDI chưa được mở (thiếu MUSICSCORE_URL).');
    }
  }

  private invalid(path: string, message: string): AppException {
    return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [{ path, message }]);
  }

  private async discardObjects(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      await this.storage.deleteObjects(keys);
    } catch {
      // PDF tạm mồ côi không ảnh hưởng nghiệp vụ; bỏ qua.
    }
  }
}

function toItem(row: {
  id: string;
  originalName: string;
  status: string;
  step: string | null;
  attempts: number;
  errorCode: string | null;
  errorMessage: string | null;
  sheetId: string | null;
  sheet: { title: string } | null;
  startedAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
}): SheetImportItem {
  return {
    id: row.id,
    originalName: row.originalName,
    status: row.status as ImportItemStatus,
    step: row.step as ImportItemStep | null,
    attempts: row.attempts,
    errorCode: row.errorCode as ImportItemError | null,
    errorMessage: row.errorMessage,
    sheetId: row.sheetId,
    sheetTitle: row.sheet?.title ?? null,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
