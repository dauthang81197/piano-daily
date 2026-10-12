import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import {
  type AdItem,
  type AdItemInput,
  type AdSlot,
  cacheTags,
  type CreateAdSlotBody,
  ErrorCode,
  type PublicAdSlot,
  type UpdateAdSlotBody,
} from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from '../catalog/cache-invalidator';
import { inUse, notFound } from '../catalog/catalog.helpers';
import { isPrismaError } from '../catalog/prisma-errors';
import { AdClickRepository, type ClickTotals } from './ad-click.repository';

const NOT_FOUND = 'Không tìm thấy vị trí quảng cáo.';
const ITEM_NOT_IN_SLOT = 'Sản phẩm không thuộc vị trí này.';
const NO_CLICKS: ClickTotals = { clicks7d: 0, clicks30d: 0, clicksTotal: 0 };

type ItemRow = {
  id: string;
  platform: AdItem['platform'];
  image: string;
  link: string;
  label: string | null;
};

type Row = {
  id: string;
  position: AdSlot['position'];
  htmlCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  items: ItemRow[];
};

const ITEMS_ORDER = [{ sortOrder: 'asc' as const }, { id: 'asc' as const }];
const WITH_ITEMS = { items: { orderBy: ITEMS_ORDER } };

const toItem = (r: ItemRow, clicks: ClickTotals | undefined): AdItem => ({
  id: r.id,
  platform: r.platform,
  image: r.image,
  link: r.link,
  label: r.label,
  ...(clicks ?? NO_CLICKS),
});

const toAdSlot = (r: Row, clicks: ReadonlyMap<string, ClickTotals>): AdSlot => ({
  id: r.id,
  position: r.position,
  htmlCode: r.htmlCode,
  items: r.items.map((i) => toItem(i, clicks.get(i.id))),
  isActive: r.isActive,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
});

const itemData = (item: AdItemInput, sortOrder: number) => ({
  platform: item.platform,
  image: item.image,
  link: item.link,
  label: item.label ?? null,
  sortOrder,
});

/** Module chủ của các bảng `ad_slots`, `ad_items`, `ad_clicks` (AD-1). Không log `html_code`. */
@Injectable()
export class AdsService {
  private readonly logger = new Logger(AdsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: CacheInvalidator,
    private readonly clicks: AdClickRepository,
  ) {}

  async list(): Promise<AdSlot[]> {
    const rows = await this.prisma.adSlot.findMany({ include: WITH_ITEMS, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] });
    return this.present(rows);
  }

  /** Chỉ slot đang bật, chỉ các trường công khai (không có số lượt bấm). */
  async listPublic(): Promise<PublicAdSlot[]> {
    const rows = await this.prisma.adSlot.findMany({
      where: { isActive: true },
      select: {
        position: true,
        htmlCode: true,
        items: { select: { id: true, platform: true, image: true, link: true, label: true }, orderBy: ITEMS_ORDER },
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows;
  }

  async create(body: CreateAdSlotBody): Promise<AdSlot> {
    try {
      const row = await this.prisma.adSlot.create({
        data: {
          position: body.position,
          htmlCode: body.htmlCode ?? null,
          isActive: body.isActive ?? false,
          items: { create: body.items.map((item, index) => itemData(item, index)) },
        },
        include: WITH_ITEMS,
      });
      this.revalidate();
      return (await this.present([row]))[0]!;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) throw inUse('Vị trí này đã có quảng cáo. Hãy sửa slot hiện có.');
      throw err;
    }
  }

  /** Thay toàn bộ nội dung: sản phẩm có `id` được cập nhật (giữ số lượt bấm), không `id` thì tạo, thiếu thì xoá. */
  async update(id: string, body: UpdateAdSlotBody): Promise<AdSlot> {
    let row: Row;
    try {
      row = await this.replaceContent(id, body);
    } catch (err) {
      // Slot hoặc sản phẩm bị xoá giữa lúc đọc và ghi (admin khác thao tác cùng lúc).
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
    this.revalidate();
    return (await this.present([row]))[0]!;
  }

  private replaceContent(id: string, body: UpdateAdSlotBody): Promise<Row> {
    const items = body.items ?? [];
    return this.prisma.$transaction(async (tx) => {
      const slot = await tx.adSlot.findUnique({ where: { id }, select: { items: { select: { id: true } } } });
      if (!slot) throw notFound(NOT_FOUND);
      const existing = new Set(slot.items.map((i) => i.id));
      const keep = new Set<string>();
      items.forEach((item, index) => {
        if (item.id === undefined) return;
        if (!existing.has(item.id) || keep.has(item.id)) {
          throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, undefined, [
            { path: `items.${index}.id`, message: ITEM_NOT_IN_SLOT },
          ]);
        }
        keep.add(item.id);
      });
      await tx.adItem.deleteMany({ where: { slotId: id, id: { notIn: [...keep] } } });
      for (const [index, item] of items.entries()) {
        if (item.id === undefined) await tx.adItem.create({ data: { slotId: id, ...itemData(item, index) } });
        else await tx.adItem.update({ where: { id: item.id }, data: itemData(item, index) });
      }
      return tx.adSlot.update({ where: { id }, data: { htmlCode: body.htmlCode ?? null }, include: WITH_ITEMS });
    });
  }

  async setActive(id: string, isActive: boolean): Promise<AdSlot> {
    try {
      const row = await this.prisma.adSlot.update({ where: { id }, data: { isActive }, include: WITH_ITEMS });
      this.revalidate();
      return (await this.present([row]))[0]!;
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

  /** Ghi một lượt bấm; không tồn tại hoặc lỗi thì bỏ qua (số liệu chỉ để tham khảo, không được làm hỏng trang). */
  async registerClick(itemId: string): Promise<void> {
    try {
      await this.clicks.increment(itemId);
    } catch (err) {
      this.logger.warn(`Không ghi được lượt bấm quảng cáo: ${err instanceof Error ? err.name : 'unknown'}`);
    }
  }

  private async present(rows: Row[]): Promise<AdSlot[]> {
    const totals = await this.clicks.totals(rows.flatMap((r) => r.items.map((i) => i.id)));
    return rows.map((r) => toAdSlot(r, totals));
  }

  /** Best-effort sau commit; `notify` không bao giờ ném. */
  private revalidate(): void {
    void this.cache.notify([cacheTags.ads]);
  }
}
