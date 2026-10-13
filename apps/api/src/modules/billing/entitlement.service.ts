import { HttpStatus, Injectable } from '@nestjs/common';
import { type Entitlement, ErrorCode, type PaywallReason } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Prisma } from '../../generated/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerTrialRepository } from '../customers/customer-trial.repository';
import { SettingsService } from '../settings/settings.service';

const DAY_MS = 86_400_000;

/**
 * Quyền tải của khách (S2 thuê bao). Thứ tự: (1) tắt cưỡng chế → tự do; (2) Subscription ACTIVE còn hạn và còn lượt kỳ;
 * (3) dùng thử (trong `trial_days` kể từ lúc xác minh email VÀ dưới `trial_max_downloads` lượt). Mọi lần trừ lượt là một
 * `UPDATE … WHERE (còn lượt)` kiểm số dòng, chạy trong transaction của caller (cùng `DownloadLog`), nên tải song song
 * không vượt hạn mức và lượt bị từ chối không bao giờ bị trừ.
 */
@Injectable()
export class EntitlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
    private readonly trial: CustomerTrialRepository,
  ) {}

  /** Trừ một lượt tải hoặc ném 402 (`TRIAL_EXPIRED` | `PLAN_REQUIRED` | `QUOTA_EXCEEDED`, `details.reason`). */
  async consume(tx: Prisma.TransactionClient, customerId: string): Promise<void> {
    const config = await this.settings.subscriptionConfig();
    if (!config.enabled) return;

    const updated = await tx.$executeRaw`
      UPDATE subscriptions s
      SET downloads_used_in_period = s.downloads_used_in_period + 1, updated_at = now()
      FROM plans p
      WHERE s.customer_id = ${customerId}::uuid AND p.id = s.plan_id
        AND EXISTS (SELECT 1 FROM customers c WHERE c.id = s.customer_id AND c.is_active)
        AND s.status = 'ACTIVE' AND s.current_period_end > now()
        AND (p.download_quota IS NULL OR s.downloads_used_in_period < p.download_quota)`;
    if (updated === 1) return;

    if (await this.trial.consume(tx, customerId, config.trialDays, config.trialMaxDownloads)) return;
    throw paywall(await this.denialReason(tx, customerId));
  }

  /** Trạng thái hiện tại để web hiển thị và quyết định có mở paywall không (không trừ lượt). */
  async getEntitlement(customerId: string): Promise<Entitlement> {
    const config = await this.settings.subscriptionConfig();
    const now = new Date();
    const [customer, sub] = await Promise.all([
      this.prisma.customer.findUnique({
        where: { id: customerId },
        select: { emailVerifiedAt: true, trialDownloadsUsed: true, isActive: true },
      }),
      this.prisma.subscription.findFirst({
        where: { customerId, status: 'ACTIVE', currentPeriodEnd: { gt: now } },
        include: { plan: true },
      }),
    ]);

    // Khách bị khoá hoặc không tồn tại: không bao giờ báo "tải được" (khớp `consume`, vốn từ chối họ).
    if (!customer?.isActive) {
      return {
        subscriptionsEnabled: config.enabled,
        trial: { active: false, endsAt: null, downloadsLeft: 0, downloadsMax: config.trialMaxDownloads },
        subscription: null,
        canDownload: !config.enabled,
      };
    }

    const endsAt = customer?.emailVerifiedAt ? new Date(customer.emailVerifiedAt.getTime() + config.trialDays * DAY_MS) : null;
    const withinTime = endsAt !== null && endsAt.getTime() > now.getTime();
    const left = withinTime ? Math.max(0, config.trialMaxDownloads - (customer?.trialDownloadsUsed ?? 0)) : 0;
    const trial = { active: left > 0, endsAt: endsAt?.toISOString() ?? null, downloadsLeft: left, downloadsMax: config.trialMaxDownloads };

    const quota = sub?.plan.downloadQuota ?? null;
    const subLeft = sub && quota !== null ? Math.max(0, quota - sub.downloadsUsedInPeriod) : null;
    const subscription = sub
      ? {
          planId: sub.planId,
          planName: { vi: sub.plan.nameVi, en: sub.plan.nameEn },
          endsAt: sub.currentPeriodEnd.toISOString(),
          downloadsLeft: subLeft,
        }
      : null;

    const subCanDownload = subscription !== null && (subLeft === null || subLeft > 0);
    return {
      subscriptionsEnabled: config.enabled,
      trial,
      subscription,
      canDownload: !config.enabled || subCanDownload || trial.active,
    };
  }

  private async denialReason(tx: Prisma.TransactionClient, customerId: string): Promise<PaywallReason> {
    const active = await tx.subscription.findFirst({
      where: { customerId, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      select: { id: true },
    });
    if (active) return 'QUOTA_EXCEEDED';
    const ever = await tx.subscription.findFirst({ where: { customerId }, select: { id: true } });
    return ever ? 'PLAN_REQUIRED' : 'TRIAL_EXPIRED';
  }
}

function paywall(reason: PaywallReason): AppException {
  return new AppException(ErrorCode[reason], HttpStatus.PAYMENT_REQUIRED, undefined, { reason });
}
