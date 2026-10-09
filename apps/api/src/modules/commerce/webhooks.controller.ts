import { Controller, Header, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ErrorCode } from '@piano-daily/shared';
import type { Request } from 'express';
import { AppException } from '../../common/http-exception.filter';
import { Public } from '../identity/public.decorator';
import { PAYPAL_SIGNATURE_HEADERS, WebhookService } from './webhook.service';

/** Webhook PayPal (Story 3.8). Công khai nhưng bảo vệ bằng chữ ký; không dùng ThrottlerGuard (PayPal gửi lại khi lỗi). */
@Public()
@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @Post('paypal')
  async paypal(@Req() req: Request & { rawBody?: Buffer }): Promise<{ received: true }> {
    if (!req.rawBody) {
      throw new AppException(ErrorCode.VALIDATION_FAILED, HttpStatus.BAD_REQUEST, 'Thiếu nội dung webhook.');
    }
    const headers: Record<string, string | undefined> = {};
    for (const name of PAYPAL_SIGNATURE_HEADERS) {
      const value = req.headers[name];
      headers[name] = Array.isArray(value) ? value[0] : value;
    }
    await this.webhooks.handle(headers, req.rawBody.toString('utf8'));
    return { received: true };
  }
}
