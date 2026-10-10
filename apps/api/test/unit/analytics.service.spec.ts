import { describe, expect, it } from 'vitest';
import { buildPeriods } from '../../src/modules/analytics/analytics.service';

describe('buildPeriods', () => {
  it('theo ngày: đủ mọi ngày gồm hai đầu, qua ranh giới tháng', () => {
    expect(buildPeriods('2026-09-29', '2026-10-02', 'day')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
  it('theo tháng: qua ranh giới năm', () => {
    expect(buildPeriods('2026-11-20', '2027-01-05', 'month')).toEqual(['2026-11', '2026-12', '2027-01']);
  });
});
