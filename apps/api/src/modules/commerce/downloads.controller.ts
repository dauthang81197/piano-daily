import { Controller, Get, Header, Param, Redirect, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { type RemovableFileType, removeFileTypeSchema } from '@piano-daily/shared';
import { getClientIp } from '../../common/http/client-ip';
import { notFound, UuidParamPipe } from '../catalog/catalog.helpers';
import { Public } from '../identity/public.decorator';
import { DownloadsService } from './downloads.service';

/** `:fileType` sai → 404 như mọi lỗi khác của endpoint này (không phân biệt lý do). */
function parseFileType(raw: string): RemovableFileType {
  const parsed = removeFileTypeSchema.safeParse(raw);
  if (!parsed.success) throw notFound('Không tìm thấy file.');
  return parsed.data;
}

/** Tải file Sheet miễn phí (Story 3.2, AD-8). Công khai, rate limit 20 request/60 giây theo `getClientIp()`. */
@Public()
@Controller()
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Header('Cache-Control', 'no-store')
  @Header('X-Robots-Tag', 'noindex, nofollow')
  @Redirect(undefined, 302)
  @Get('files/:sheetId/:fileType/download')
  async freeDownload(
    @Param('sheetId', UuidParamPipe) sheetId: string,
    @Param('fileType') fileType: string,
    @Req() req: { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } },
  ): Promise<{ url: string }> {
    const type = parseFileType(fileType);
    const ua = req.headers['user-agent'];
    const url = await this.downloads.freeDownloadUrl(sheetId, type, getClientIp(req), Array.isArray(ua) ? ua[0] : ua);
    return { url };
  }
}
