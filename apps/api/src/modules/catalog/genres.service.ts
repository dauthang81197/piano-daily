import { Injectable } from '@nestjs/common';
import type { CreateGenreRequest, Genre, GenreIcon, ListQuery, Page, UpdateGenreRequest } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from './cache-invalidator';
import { inUse, nameSearch, notFound, pagination } from './catalog.helpers';
import { isPrismaError } from './prisma-errors';
import { baseSlug, createWithUniqueSlug } from './unique-slug';

const SELECT = { id: true, name: true, slug: true, icon: true } as const;

/** Cột `icon` chỉ được ghi qua `genreIconSchema`, nên luôn thuộc `GENRE_ICONS` hoặc null. */
function toGenre(row: { id: string; name: string; slug: string; icon: string | null }): Genre {
  return { ...row, icon: row.icon as GenreIcon | null };
}

@Injectable()
export class GenresService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(query: ListQuery): Promise<Page<Genre>> {
    const where = nameSearch(query.q);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.genre.findMany({ where, select: SELECT, ...pagination(query) }),
      this.prisma.genre.count({ where }),
    ]);
    return { items: rows.map(toGenre), page: query.page, pageSize: query.pageSize, total };
  }

  async get(id: string): Promise<Genre> {
    const row = await this.prisma.genre.findUnique({ where: { id }, select: SELECT });
    if (!row) throw notFound('Không tìm thấy Genre.');
    return toGenre(row);
  }

  async create(body: CreateGenreRequest): Promise<Genre> {
    return this.cache.trackTaxonomy('genre', null, () => this.createRow(body), (row) => row.id);
  }

  private async createRow(body: CreateGenreRequest): Promise<Genre> {
    const row = await createWithUniqueSlug(
      async (candidates) =>
        (await this.prisma.genre.findMany({ where: { slug: { in: candidates } }, select: { slug: true } })).map(
          (r) => r.slug,
        ),
      baseSlug(body.name, 'genre'),
      (slug) => this.prisma.genre.create({ data: { name: body.name, icon: body.icon ?? null, slug }, select: SELECT }),
    );
    return toGenre(row);
  }

  async update(id: string, body: UpdateGenreRequest): Promise<Genre> {
    return this.cache.trackTaxonomy('genre', id, () => this.updateRow(id, body));
  }

  private async updateRow(id: string, body: UpdateGenreRequest): Promise<Genre> {
    try {
      return toGenre(
        await this.prisma.genre.update({ where: { id }, data: { name: body.name, icon: body.icon }, select: SELECT }),
      );
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound('Không tìm thấy Genre.');
      throw err;
    }
  }

  /** `SheetGenre` tham chiếu Genre bằng FK RESTRICT: P2003 → 409 `RESOURCE_IN_USE`. */
  async remove(id: string): Promise<void> {
    return this.cache.trackTaxonomy('genre', id, () => this.removeRow(id));
  }

  private async removeRow(id: string): Promise<void> {
    try {
      await this.prisma.genre.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound('Không tìm thấy Genre.');
      if (isPrismaError(err, 'P2003')) {
        throw inUse('Genre đang được gắn với Sheet nên không thể xoá. Hãy gỡ Genre khỏi các Sheet đó trước.');
      }
      throw err;
    }
  }
}
