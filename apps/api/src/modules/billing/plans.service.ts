import { Injectable } from '@nestjs/common';
import { cacheTags, type Plan, type PlanBody, type PublicPlansResponse } from '@piano-daily/shared';
import type { Plan as PlanRow } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CacheInvalidator } from '../catalog/cache-invalidator';
import { inUse, notFound } from '../catalog/catalog.helpers';
import { isPrismaError } from '../catalog/prisma-errors';
import { SettingsService } from '../settings/settings.service';

const NOT_FOUND = 'Không tìm thấy gói.';
const ORDER = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }, { id: 'asc' as const }];

/** Nơi DUY NHẤT ghi bảng `plans`. Đổi gói thì revalidate tag web `plans`. */
@Injectable()
export class PlansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly cache: CacheInvalidator,
  ) {}

  /** Mọi gói (kể cả đang tắt) kèm số Subscription ACTIVE, cho admin. */
  async list(): Promise<Plan[]> {
    const rows = await this.prisma.plan.findMany({ orderBy: ORDER });
    const counts = await this.prisma.subscription.groupBy({
      by: ['planId'],
      where: { status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      _count: { _all: true },
    });
    const byPlan = new Map(counts.map((c) => [c.planId, c._count._all]));
    return rows.map((row) => toPlan(row, byPlan.get(row.id) ?? 0));
  }

  async create(body: PlanBody): Promise<Plan> {
    const row = await this.prisma.plan.create({ data: body });
    this.revalidate();
    return toPlan(row, 0);
  }

  async update(id: string, body: PlanBody): Promise<Plan> {
    try {
      const row = await this.prisma.plan.update({ where: { id }, data: body });
      this.revalidate();
      return toPlan(row, await this.activeCount(id));
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
  }

  async setActive(id: string, isActive: boolean): Promise<Plan> {
    try {
      const row = await this.prisma.plan.update({ where: { id }, data: { isActive } });
      this.revalidate();
      return toPlan(row, await this.activeCount(id));
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      throw err;
    }
  }

  /** Gói đã từng có Subscription thì không xoá (FK RESTRICT): hãy tắt gói. */
  async remove(id: string): Promise<void> {
    try {
      await this.prisma.plan.delete({ where: { id } });
    } catch (err) {
      if (isPrismaError(err, 'P2025')) throw notFound(NOT_FOUND);
      if (isPrismaError(err, 'P2003')) throw inUse('Gói đã có người đăng ký nên không xoá được. Hãy tắt gói thay vì xoá.');
      throw err;
    }
    this.revalidate();
  }

  /** `GET /plans`: chỉ gói đang bật, kèm công tắc thuê bao để web biết có hiện giá hay chưa. */
  async listPublic(): Promise<PublicPlansResponse> {
    const [subscriptionsEnabled, rows] = await Promise.all([
      this.settings.subscriptionsEnabled(),
      this.prisma.plan.findMany({ where: { isActive: true }, orderBy: ORDER }),
    ]);
    return {
      subscriptionsEnabled,
      plans: rows.map((row) => ({
        id: row.id,
        name: { vi: row.nameVi, en: row.nameEn },
        description: { vi: row.descriptionVi, en: row.descriptionEn },
        priceVnd: row.priceVnd,
        priceUsdCents: row.priceUsdCents,
        durationDays: row.durationDays,
        downloadQuota: row.downloadQuota,
      })),
    };
  }

  private activeCount(planId: string): Promise<number> {
    return this.prisma.subscription.count({ where: { planId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } } });
  }

  /** Best-effort sau commit; `notify` không bao giờ ném. */
  private revalidate(): void {
    void this.cache.notify([cacheTags.plans]);
  }
}

function toPlan(row: PlanRow, activeSubscriptions: number): Plan {
  return {
    id: row.id,
    nameVi: row.nameVi,
    nameEn: row.nameEn,
    descriptionVi: row.descriptionVi,
    descriptionEn: row.descriptionEn,
    priceVnd: row.priceVnd,
    priceUsdCents: row.priceUsdCents,
    durationDays: row.durationDays,
    downloadQuota: row.downloadQuota,
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    activeSubscriptions,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
