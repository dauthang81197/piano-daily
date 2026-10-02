import { HttpStatus, Injectable } from '@nestjs/common';
import {
  type CreateSeriesRequest,
  ErrorCode,
  type ListQuery,
  type Page,
  type Series,
  type UpdateSeriesRequest,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from './cache-invalidator';
import { inUse, nameSearch, notFound, pagination } from './catalog.helpers';
import { isPrismaError } from './prisma-errors';
import { baseSlug, createWithUniqueSlug } from './unique-slug';

const SELECT = { id: true, name: true, slug: true, composer: { select: { id: true, name: true } } } as const;

function composerNotFound(): AppException {
  return new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
    { path: 'composerId', message: 'Composer không tồn tại. Hãy chọn Composer khác.' },
  ]);
}

@Injectable()
export class SeriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(query: ListQuery): Promise<Page<Series>> {
    const where = { ...nameSearch(query.q), ...(query.composerId ? { composerId: query.composerId } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.series.findMany({ where, select: SELECT, ...pagination(query) }),
      this.prisma.series.count({ where }),
    ]);
    return { items, page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<Series> {
    const row = await this.prisma.series.findUnique({ where: { id }, select: SELECT });
    if (!row) throw notFound('Không tìm thấy Series.');
    return row;
  }

  async create(body: CreateSeriesRequest): Promise<Series> {
    return this.cache.trackTaxonomy('series', null, () => this.createRow(body), (row) => row.id);
  }

  private async createRow(body: CreateSeriesRequest): Promise<Series> {
    await this.assertComposerExists(body.composerId);
    try {
      return await createWithUniqueSlug(
        async (candidates) =>
          (await this.prisma.series.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map(
            (r) => r.slug,
          ),
        baseSlug(body.name, 'series'),
        (slug) =>
          this.prisma.series.create({
            data: { name: body.name, composerId: body.composerId, slug },
            select: SELECT,
          }),
      );
    } catch (err) {
      // Composer bị xoá giữa lúc kiểm tra và lúc tạo.
      if (isPrismaError(err, 'P2003')) throw composerNotFound();
      throw err;
    }
  }

  async update(id: string, body: UpdateSeriesRequest): Promise<Series> {
    return this.cache.trackTaxonomy('series', id, () => this.updateRow(id, body));
  }

  private async updateRow(id: string, body: UpdateSeriesRequest): Promise<Series> {
    if (body.composerId !== undefined) await this.assertComposerExists(body.composerId);
    try {
      return await this.prisma.series.update({
        where: { id },
        data: { name: body.name, composerId: body.composerId },
        select: SELECT,
      });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound('Không tìm thấy Series.');
      if (isPrismaError(err, 'P2003')) throw composerNotFound();
      throw err;
    }
  }

  /** Sheet tham chiếu Series bằng FK RESTRICT: P2003 → 409 `RESOURCE_IN_USE`. */
  async remove(id: string): Promise<void> {
    return this.cache.trackTaxonomy('series', id, () => this.removeRow(id));
  }

  private async removeRow(id: string): Promise<void> {
    try {
      await this.prisma.series.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound('Không tìm thấy Series.');
      if (isPrismaError(err, 'P2003')) {
        throw inUse('Series đang được gắn với Sheet nên không thể xoá. Hãy gỡ Series khỏi các Sheet đó trước.');
      }
      throw err;
    }
  }

  private async assertComposerExists(composerId: string): Promise<void> {
    const found = await this.prisma.composer.findUnique({ where: { id: composerId }, select: { id: true } });
    if (!found) throw composerNotFound();
  }
}
