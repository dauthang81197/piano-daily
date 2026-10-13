import { Controller, Header, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type CustomerDownloadResponse, type RemovableFileType, removeFileTypeSchema } from '@piano-daily/shared';
import { getClientIp } from '../../common/http/client-ip';
import { notFound, UuidParamPipe } from '../catalog/catalog.helpers';
import { type AuthenticatedCustomer, CustomerAuthGuard } from '../customers/customer-auth.guard';
import { CurrentCustomer } from '../customers/current-customer.decorator';
import { Public } from '../identity/public.decorator';
import { DownloadsService } from './downloads.service';

/** `:fileType` sai → 404 như mọi lỗi khác của endpoint này (không phân biệt lý do). */
function parseFileType(raw: string): RemovableFileType {
  const parsed = removeFileTypeSchema.safeParse(raw);
  if (!parsed.success) throw notFound('Không tìm thấy file.');
  return parsed.data;
}

/**
 * Tải file Sheet miễn phí của khách đã đăng nhập (AD-8, S1 thuê bao). `@Public()` chỉ để bỏ qua guard admin;
 * quyền được `CustomerAuthGuard` (access token khách) và `CustomerAccessService` (đã xác minh email) quyết định.
 * Trả `{url}` thay vì 302 vì trình duyệt không gửi `Authorization` khi điều hướng. Rate limit 20 request/60 giây theo IP.
 */
@Public()
@Controller()
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @UseGuards(ThrottlerGuard, CustomerAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @HttpCode(HttpStatus.OK)
  @Post('customer/downloads/:sheetId/:fileType')
  async download(
    @CurrentCustomer() customer: AuthenticatedCustomer,
    @Param('sheetId', UuidParamPipe) sheetId: string,
    @Param('fileType') fileType: string,
    @Req() req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ): Promise<CustomerDownloadResponse> {
    const type = parseFileType(fileType);
    const ua = req.headers['user-agent'];
    const url = await this.downloads.freeDownloadUrl(
      customer.id,
      sheetId,
      type,
      getClientIp(req),
      Array.isArray(ua) ? ua[0] : ua,
    );
    return { url };
  }
}
