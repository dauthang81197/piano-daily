import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import {
  type PreviewTokenRequest,
  type PreviewTokenResponse,
  previewTokenRequestSchema,
} from '@piano-daily/shared';
import { type AuthenticatedUser, CurrentUser } from './current-user.decorator';
import { PreviewTokenService } from './preview-token.service';

/**
 * Admin xin preview token để xem Sheet Draft như người dùng (AD-19). Không `@Public()`: guard JWT toàn cục đòi
 * access token admin. `identity` không kiểm tra Sheet có tồn tại (không sở hữu bảng Sheet); Sheet lạ thì route
 * preview trả 404.
 */
@Controller('admin/preview-tokens')
export class PreviewTokensController {
  private readonly logger = new Logger(PreviewTokensController.name);

  constructor(private readonly tokens: PreviewTokenService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  async issue(
    @Body({ schema: previewTokenRequestSchema }) body: PreviewTokenRequest,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<PreviewTokenResponse> {
    const issued = await this.tokens.issue(body.sheetId);
    // Dấu vết: ai xin token cho Sheet nào (không bao giờ log chính token).
    this.logger.log({ userId: user.id, sheetId: body.sheetId, expiresAt: issued.expiresAt }, 'Phát preview token');
    return issued;
  }
}
