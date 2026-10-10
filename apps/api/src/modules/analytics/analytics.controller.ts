import { Controller, Get, Query } from '@nestjs/common';
import { type AnalyticsDashboard, type AnalyticsQuery, analyticsQuerySchema } from '@piano-daily/shared';
import { AnalyticsService } from './analytics.service';

/** Dashboard doanh thu và lượt dùng. Không `@Public()`: guard JWT toàn cục chặn; mọi admin đều xem được. */
@Controller('admin/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@Query({ schema: analyticsQuerySchema }) query: AnalyticsQuery): Promise<AnalyticsDashboard> {
    return this.analytics.dashboard(query);
  }
}
