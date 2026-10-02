import { Injectable } from '@nestjs/common';
import type { Composer, CreateComposerRequest, ListQuery, Page, UpdateComposerRequest } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from './cache-invalidator';
import { inUse, nameSearch, notFound, pagination } from './catalog.helpers';
import { isPrismaError } from './prisma-errors';
import { baseSlug, createWithUniqueSlug } from './unique-slug';

type ComposerRow = {
  id: string;
  name: string;
  slug: string;
  bio: string | null;
  avatar: string | null;
  _count: { series: number };
};

const SELECT = {
  id: true,
  name: true,
  slug: true,
  bio: true,
  avatar: true,
  _count: { select: { series: true } },
} as const;

function toComposer({ _count, ...row }: ComposerRow): Composer {
  return { ...row, seriesCount: _count.series };
}

@Injectable()
export class ComposersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(query: ListQuery): Promise<Page<Composer>> {
    const where = nameSearch(query.q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.composer.findMany({ where, select: SELECT, ...pagination(query) }),
      this.prisma.composer.count({ where }),
    ]);
    return { items: rows.map(toComposer), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<Composer> {
    const row = await this.prisma.composer.findUnique({ where: { id }, select: SELECT });
    if (!row) throw notFound('Không tìm thấy Composer.');
    return toComposer(row);
  }

  /** Body đã qua `createComposerSchema` (tên đã trim, bio rỗng thành null). */
  async create(body: CreateComposerRequest): Promise<Composer> {
    return this.cache.trackTaxonomy('composer', null, () => this.createRow(body), (row) => row.id);
  }

  private async createRow(body: CreateComposerRequest): Promise<Composer> {
    const row = await createWithUniqueSlug(
      async (candidates) =>
        (await this.prisma.composer.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map(
          (r) => r.slug,
        ),
      baseSlug(body.name, 'composer'),
      (slug) =>
        this.prisma.composer.create({ data: { name: body.name, bio: body.bio ?? null, slug }, select: SELECT }),
    );
    return toComposer(row);
  }

  /** Đổi tên không đổi slug (giữ URL công khai ổn định). */
  async update(id: string, body: UpdateComposerRequest): Promise<Composer> {
    return this.cache.trackTaxonomy('composer', id, () => this.updateRow(id, body));
  }

  private async updateRow(id: string, body: UpdateComposerRequest): Promise<Composer> {
    try {
      const row = await this.prisma.composer.update({
        where: { id },
        data: { name: body.name, bio: body.bio },
        select: SELECT,
      });
      return toComposer(row);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound('Không tìm thấy Composer.');
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    return this.cache.trackTaxonomy('composer', id, () => this.removeRow(id));
  }

  private async removeRow(id: string): Promise<void> {
    const composer = await this.prisma.composer.findUnique({
      where: { id },
      select: { _count: { select: { series: true, sheets: true } } },
    });
    if (!composer) throw notFound('Không tìm thấy Composer.');
    const { series, sheets } = composer._count;
    if (series > 0 || sheets > 0) {
      const refs = [series > 0 ? `${series} Series` : null, sheets > 0 ? `${sheets} Sheet` : null].filter(Boolean);
      const kinds = [series > 0 ? 'Series' : null, sheets > 0 ? 'Sheet' : null].filter(Boolean);
      throw inUse(
        `Composer đang có ${refs.join(' và ')} nên không thể xoá. Hãy xoá hoặc chuyển các ${kinds.join(' và ')} đó sang Composer khác trước.`,
      );
    }
    try {
      await this.prisma.composer.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound('Không tìm thấy Composer.');
      // Series/Sheet được thêm giữa lúc kiểm tra và lúc xoá (FK RESTRICT).
      if (isPrismaError(err, 'P2003')) {
        throw inUse('Composer đang có Series hoặc Sheet tham chiếu nên không thể xoá. Hãy gỡ các tham chiếu đó trước.');
      }
      throw err;
    }
  }
}
