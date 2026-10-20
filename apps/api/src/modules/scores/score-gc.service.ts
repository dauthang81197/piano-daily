import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ScoresService } from './scores.service';

/** Dọn bản chuyển nhạc hết hạn và đưa việc kẹt sang FAILED. Lúc khởi động mọi việc dang dở đều kẹt (tiến trình chạy chúng đã mất). */
@Injectable()
export class ScoreGcService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ScoreGcService.name);
  private running = false;

  constructor(private readonly scores: ScoresService) {}

  async onApplicationBootstrap(): Promise<void> {
    try {
      const stuck = await this.scores.failStuck(true);
      if (stuck > 0) this.logger.warn({ stuck }, 'Đưa việc chuyển nhạc dở dang sau khi khởi động sang FAILED');
    } catch (err) {
      this.logger.error({ err }, 'Không dọn được việc kẹt lúc khởi động; GC định kỳ sẽ thử lại');
    }
  }

  @Cron(CronExpression.EVERY_10_MINUTES)
  scheduledRun(): Promise<void> {
    return this.run();
  }

  async run(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.scores.failStuck(false, now);
      const deleted = await this.scores.deleteExpired(now);
      if (deleted > 0) this.logger.log({ deleted }, 'Đã xoá bản chuyển nhạc hết hạn');
    } catch (err) {
      this.logger.error({ err }, 'Dọn bản chuyển nhạc thất bại; sẽ thử lại lần sau');
    } finally {
      this.running = false;
    }
  }
}
