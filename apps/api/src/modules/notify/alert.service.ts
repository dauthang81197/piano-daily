import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import { EMAIL_PORT, type EmailPort } from './email-port';

export const ALERT_KINDS = ['REVIEW_REQUIRED', 'LATE_CAPTURE', 'WEBHOOK_ERROR', 'BACKUP_FAILED'] as const;
export type AlertKind = (typeof ALERT_KINDS)[number];

/** Cùng `kind` + khoá chỉ gửi tối đa một email trong khoảng này. */
export const ALERT_THROTTLE_MS = 15 * 60 * 1000;
const MAX_TRACKED = 500;

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Cảnh báo vận hành tới founder (Story 5.3). Luôn best-effort: không bao giờ ném. Caller gọi `void alerts.alert(...)`.
 * `detail` chỉ chứa mã đơn/loại sự kiện, tuyệt đối không email người mua, token hay secret.
 */
@Injectable()
export class AlertService {
  private readonly logger = new Logger(AlertService.name);
  private readonly lastSent = new Map<string, number>();

  constructor(
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async alert(kind: AlertKind, subject: string, detail: string, key = ''): Promise<void> {
    try {
      this.logger.error(`ALERT ${kind} ${detail}`);
      const to = this.config.get('ALERT_EMAIL', { infer: true });
      if (!to) return;

      const now = Date.now();
      const throttleKey = `${kind}:${key}`;
      const last = this.lastSent.get(throttleKey);
      if (last !== undefined && now - last < ALERT_THROTTLE_MS) return;
      // Đặt trước khi gửi để các sự kiện đồng thời không gửi trùng.
      this.lastSent.set(throttleKey, now);
      this.prune(now);

      try {
        const sent = await this.email.send({
          to,
          subject: `[Piano Daily] ${subject}`,
          text: `${subject}\n\n${detail}\n`,
          html: `<p><strong>${escapeHtml(subject)}</strong></p><p>${escapeHtml(detail)}</p>`,
        });
        // Adapter bỏ qua (chưa cấu hình email): không giữ chỗ throttle.
        if (sent === false) this.lastSent.delete(throttleKey);
      } catch (err) {
        this.lastSent.delete(throttleKey);
        this.logger.error(`Gửi cảnh báo ${kind} thất bại: ${err instanceof Error ? err.name : 'unknown'}`);
      }
    } catch {
      // Best-effort: nuốt mọi lỗi.
    }
  }

  private prune(now: number): void {
    if (this.lastSent.size <= MAX_TRACKED) return;
    for (const [k, at] of this.lastSent) if (now - at >= ALERT_THROTTLE_MS) this.lastSent.delete(k);
  }
}
