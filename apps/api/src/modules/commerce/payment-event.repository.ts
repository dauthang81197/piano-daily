import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type RecordedEvent = {
  /** true nếu chính lệnh này tạo dòng mới; false nếu `provider_event_id` đã có. */
  created: boolean;
  processedAt: Date | null;
};

/** Nơi DUY NHẤT ghi bảng `payment_events` (AD-1, Story 3.8). Không log payload. */
@Injectable()
export class PaymentEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** INSERT ... ON CONFLICT DO NOTHING; trùng thì đọc lại `processed_at` của dòng cũ. */
  async record(eventId: string, type: string, payload: unknown): Promise<RecordedEvent> {
    const inserted = await this.prisma.$queryRaw<{ id: string }[]>`
      INSERT INTO payment_events (provider_event_id, type, payload)
      VALUES (${eventId}, ${type}, ${JSON.stringify(payload)}::jsonb)
      ON CONFLICT (provider_event_id) DO NOTHING
      RETURNING id`;
    if (inserted.length === 1) return { created: true, processedAt: null };
    const existing = await this.prisma.paymentEvent.findUnique({
      where: { providerEventId: eventId },
      select: { processedAt: true },
    });
    return { created: false, processedAt: existing?.processedAt ?? null };
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.prisma.paymentEvent.updateMany({
      where: { providerEventId: eventId, processedAt: null },
      data: { processedAt: new Date() },
    });
  }
}
