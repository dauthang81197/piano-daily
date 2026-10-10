import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

/** Báo cáo chỉ đọc (Story 4.7): không sở hữu bảng nào, chỉ truy vấn qua `PrismaService`. */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
