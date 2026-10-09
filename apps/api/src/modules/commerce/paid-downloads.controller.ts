import { Controller, Get, Header, Param, Redirect, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type DownloadStatusResponse, type RemovableFileType, removeFileTypeSchema } from '@piano-daily/shared';
import { getClientIp } from '../../common/http/client-ip';
import { notFound } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { PaidDownloadsService } from './paid-downloads.service';

/** Token là base64url 43 ký tự; chuỗi sai dạng → 404 như token lạ. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,128}$/;

function parseToken(raw: string): string {
  if (!TOKEN_PATTERN.test(raw)) throw notFound('Không tìm thấy link tải.');
  return raw;
}

function parseFileType(raw: string): RemovableFileType {
  const parsed = removeFileTypeSchema.safeParse(raw);
  if (!parsed.success) throw notFound('Không tìm thấy file.');
  return parsed.data;
}

/** Tải file đã mua bằng DownloadToken (Story 3.5). Công khai, rate limit 20 request/60 giây theo `getClientIp()`. */
@Public()
@Controller('downloads')
export class PaidDownloadsController {
  constructor(private readonly downloads: PaidDownloadsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Get(':token')
  status(@Param('token') token: string): Promise<DownloadStatusResponse> {
    return this.downloads.status(parseToken(token));
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Redirect(undefined, 302)
  @Get(':token/:fileType')
  async download(
    @Param('token') token: string,
    @Param('fileType') fileType: string,
    @Req() req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ): Promise<{ url: string }> {
    const t = parseToken(token);
    const type = parseFileType(fileType);
    const ua = req.headers['user-agent'];
    const url = await this.downloads.downloadUrl(t, type, getClientIp(req), Array.isArray(ua) ? ua[0] : ua);
    return { url };
  }
}
