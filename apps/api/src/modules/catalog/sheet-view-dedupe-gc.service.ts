import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SheetViewsRepository } from './sheet-views.repository';

const RETENTION_MS = 24 * 60 * 60 * 1000;

/** Dọn dòng dedupe cũ hơn 24 giờ để bảng không phình mãi; dedupe chỉ cần bucket giờ hiện tại. */
@Injectable()
export class SheetViewDedupeGcService {
  private readonly logger = new Logger(SheetViewDedupeGcService.name);
  private running = false;

  constructor(private readonly views: SheetViewsRepository) {}

  @Cron(CronExpression.EVERY_HOUR)
  scheduledRun(): Promise<void> {
    return this.run();
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.views.deleteOlderThan(new Date(now.getTime() - RETENTION_MS));
    } catch (err) {
      // Lỗi dọn dẹp không ảnh hưởng việc đếm; lần chạy sau thử lại.
      this.logger.error({ err }, 'Dọn sheet_view_dedupe thất bại; sẽ thử lại lần sau');
    } finally {
      this.running = false;
    }
  }
}
