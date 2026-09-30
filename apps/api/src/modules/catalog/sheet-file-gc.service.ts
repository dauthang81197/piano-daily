import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { FileType } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { SheetMediaService } from '../media/sheet-media.service';
import { withSheetFileLock } from './sheet-file-lock';

const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Cleans superseded source/derived file groups after the retention window. */
@Injectable()
export class SheetFileGcService {
  private readonly logger = new Logger(SheetFileGcService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly media: SheetMediaService) {}

  @Cron(CronExpression.EVERY_HOUR)
  scheduledRun(): Promise<void> {
    return this.run();
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const cutoff = new Date(now.getTime() - RETENTION_MS);
      const roots = await this.prisma.sheetFile.findMany({
        where: {
          supersededAt: { lte: cutoff },
          sourceFileId: null,
          type: { in: [FileType.PDF, FileType.MIDI, FileType.MP3] },
        },
        select: { id: true, sheetId: true },
        orderBy: { supersededAt: 'asc' },
      });
      for (const root of roots) {
        try {
          await this.collectGroup(root.id, root.sheetId, cutoff);
        } catch (err) {
          this.logger.error({ err, sheetId: root.sheetId, fileId: root.id }, 'GC file group failed; will retry later');
        }
      }
    } finally {
      this.running = false;
    }
  }

  private collectGroup(rootId: string, sheetId: string, cutoff: Date): Promise<void> {
    return withSheetFileLock(sheetId, () => this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM sheets WHERE id = ${sheetId}::uuid FOR UPDATE`;
      if (!locked.length) return;
      const root = await tx.sheetFile.findUnique({ where: { id: rootId }, select: { type: true, supersededAt: true } });
      if (!root?.supersededAt || root.supersededAt > cutoff) return;
      const group = await tx.sheetFile.findMany({
        where: { OR: [{ id: rootId }, { sourceFileId: rootId }] },
        select: { id: true, type: true, storageKey: true, supersededAt: true },
      });
      if (!group.length || group.some((file) => !file.supersededAt || file.supersededAt > cutoff)) return;

      const types = new Set(group.map((file) => file.type));
      if (root.type === FileType.PDF && (!types.has(FileType.THUMBNAIL) || !types.has(FileType.PAGE_IMAGE))) return;
      if (root.type === FileType.MIDI && !types.has(FileType.MIDI_JSON)) return;

      const keys = [...new Set(group.map((file) => file.storageKey))];
      const candidateIds = group.map((file) => file.id);
      const otherReferences = await tx.sheetFile.findMany({
        where: { storageKey: { in: keys }, id: { notIn: candidateIds } },
        select: { id: true, supersededAt: true },
      });
      // A different group may share a content-addressed object. Preserve it until every reference
      // has itself passed retention; current rows and newer superseded rows always block deletion.
      if (otherReferences.some((reference) => !reference.supersededAt || reference.supersededAt > cutoff)) return;
      if (await this.hasLiveDownloadTokenReference([...candidateIds, ...otherReferences.map((file) => file.id)])) return;

      // Keep the rows until every S3 delete succeeds; retry is safe when some objects were already gone.
      await this.media.deleteObjects(keys);
      await tx.sheetFile.deleteMany({ where: { id: { in: group.map((file) => file.id) } } });
    }));
  }

  /** Epic 3 replaces this pre-Epic-3 hook with a live DownloadToken reference lookup. */
  async hasLiveDownloadTokenReference(_fileIds: string[]): Promise<boolean> {
    return false;
  }
}
