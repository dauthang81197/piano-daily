import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '@piano-daily/shared';
import { PinoLogger } from 'nestjs-pino';
import { AppException } from '../common/http-exception.filter';
import { Public } from '../modules/identity/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HealthController.name);
  }

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok'; db: 'up' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.logger.warn({ err }, 'Database health check failed');
      throw new AppException(ErrorCode.SERVICE_UNAVAILABLE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    return { status: 'ok', db: 'up' };
  }
}
