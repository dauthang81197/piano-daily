import { Injectable } from '@nestjs/common';
import {
  type AdSlot,
  cacheTags,
  type CreateAdSlotBody,
  type PublicAdSlot,
  type UpdateAdSlotBody,
} from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from '../catalog/cache-invalidator';
import { inUse, notFound } from '../catalog/catalog.helpers';
import { isPrismaError } from '../catalog/prisma-errors';

const NOT_FOUND = 'Không tìm thấy vị trí quảng cáo.';

type Row = {
  id: string;
  position: AdSlot['position'];
  htmlCode: string | null;
  image: string | null;
  link: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

const toAdSlot = (r: Row): AdSlot => ({
  id: r.id,
  position: r.position,
  htmlCode: r.htmlCode,
  image: r.image,
  link: r.link,
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

/** Module chủ của bảng `ad_slots` (AD-1). Không log `html_code`. */
@Injectable()
export class AdsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidator,
  ) {}

  async list(): Promise<AdSlot[]> {
    return (await this.prisma.adSlot.findMany({ orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] })).map(toAdSlot);
  }

  /** Chỉ slot đang bật, chỉ 4 trường công khai. */
  async listPublic(): Promise<PublicAdSlot[]> {
    return this.prisma.adSlot.findMany({
      where: { isActive: true },
      select: { position: true, htmlCode: true, image: true, link: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
  }

  async create(body: CreateAdSlotBody): Promise<AdSlot> {
    try {
      const row = await this.prisma.adSlot.create({
        data: {
          position: body.position,
          htmlCode: body.htmlCode ?? null,
          image: body.image ?? null,
          link: body.link ?? null,
          isActive: body.isActive ?? false,
        },
      });
      this.revalidate();
      return toAdSlot(row);
    } catch (err) {
      if (isPrismaError(err, 'P2002')) throw inUse('Vị trí này đã có quảng cáo. Hãy sửa slot hiện có.');
      throw err;
    }
  }

  async update(id: string, body: UpdateAdSlotBody): Promise<AdSlot> {
    try {
      const row = await this.prisma.adSlot.update({
        where: { id },
        data: { htmlCode: body.htmlCode ?? null, image: body.image ?? null, link: body.link ?? null },
      });
      this.revalidate();
      return toAdSlot(row);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<AdSlot> {
    try {
      const row = await this.prisma.adSlot.update({ where: { id }, data: { isActive } });
      this.revalidate();
      return toAdSlot(row);
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.adSlot.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
    this.revalidate();
  }

  /** Best-effort sau commit; `notify` không bao giờ ném. */
  private revalidate(): void {
    void this.cache.notify([cacheTags.ads]);
  }
}
