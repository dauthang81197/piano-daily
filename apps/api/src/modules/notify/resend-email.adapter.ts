import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env';
import type { EmailMessage, EmailPort } from './email-port';

const RESEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

/** Resend trả lỗi hoặc không tới được. Chỉ mang tên lỗi và mã HTTP, không chứa email hay nội dung. */
export class ResendEmailError extends Error {
  constructor(readonly status: number) {
    super(`Resend trả lỗi (HTTP ${status}).`);
    this.name = 'ResendEmailError';
  }
}

/**
 * Adapter Resend qua REST (`fetch`, không SDK). Thiếu `RESEND_API_KEY`/`EMAIL_FROM` thì chỉ log cảnh báo và bỏ qua.
 * Không bao giờ log địa chỉ nhận hay nội dung email.
 */
@Injectable()
export class ResendEmailAdapter implements EmailPort {
  private readonly logger = new Logger(ResendEmailAdapter.name);

  constructor(private readonly config: ConfigService<Env, true>) {}

  async send(message: EmailMessage): Promise<boolean> {
    const apiKey = this.config.get('RESEND_API_KEY', { infer: true });
    const from = this.config.get('EMAIL_FROM', { infer: true });
    if (!apiKey || !from) {
      this.logger.warn('Chưa cấu hình RESEND_API_KEY / EMAIL_FROM: bỏ qua việc gửi email.');
      return false;
    }
    const res = await fetch(RESEND_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [message.to], subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new ResendEmailError(res.status);
    return true;
  }
}
