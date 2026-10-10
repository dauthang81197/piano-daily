import { describe, expect, it } from 'vitest';
import { analyticsQuerySchema, analyticsRangeError, resolveAnalyticsRange } from './analytics';
import { addDays, dayStartUtc, daysInRange, reportRangeToUtc, todayInReportTz } from './report-range';

describe('dayStartUtc / reportRangeToUtc (REPORT_TZ = Asia/Ho_Chi_Minh, UTC+7)', () => {
  it('00:00 ngày 01/10 giờ Việt Nam là 17:00 UTC ngày 30/09', () => {
    expect(dayStartUtc('2026-10-01').toISOString()).toBe('2026-09-30T17:00:00.000Z');
  });
  it('from = to gồm trọn một ngày: [00:00, 24:00) giờ Việt Nam', () => {
    const { gte, lt } = reportRangeToUtc('2026-10-01', '2026-10-01');
    expect(gte?.toISOString()).toBe('2026-09-30T17:00:00.000Z');
    expect(lt?.toISOString()).toBe('2026-10-01T17:00:00.000Z');
  });
  it('qua ranh giới năm, chỉ một đầu', () => {
    expect(reportRangeToUtc(undefined, '2026-12-31').lt?.toISOString()).toBe('2026-12-31T17:00:00.000Z');
    expect(reportRangeToUtc('2026-01-01').lt).toBeUndefined();
    expect(reportRangeToUtc()).toEqual({});
  });
  it('múi giờ có DST vẫn đúng đầu ngày', () => {
    expect(dayStartUtc('2026-07-01', 'America/New_York').toISOString()).toBe('2026-07-01T04:00:00.000Z');
    expect(dayStartUtc('2026-01-01', 'America/New_York').toISOString()).toBe('2026-01-01T05:00:00.000Z');
  });
});

describe('ngày lịch', () => {
  it('addDays / daysInRange', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(daysInRange('2026-10-01', '2026-10-01')).toBe(1);
    expect(daysInRange('2026-01-01', '2026-12-31')).toBe(365);
  });
  it('todayInReportTz lấy ngày theo giờ Việt Nam', () => {
    expect(todayInReportTz(new Date('2026-10-09T18:00:00Z'))).toBe('2026-10-10');
  });
});

describe('analyticsQuerySchema', () => {
  it('mặc định granularity=day, không bắt buộc from/to', () => {
    expect(analyticsQuerySchema.parse({})).toEqual({ granularity: 'day' });
  });
  it('từ chối from > to, sai định dạng, ngày không có thật, > 366 ngày, granularity lạ', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2026-10-02', to: '2026-10-01' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ from: '10/01/2026' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ to: '2026-02-30' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ from: '2025-01-01', to: '2026-01-02' }).success).toBe(false);
    expect(analyticsQuerySchema.safeParse({ granularity: 'week' }).success).toBe(false);
  });
  it('chấp nhận đúng 366 ngày', () => {
    expect(analyticsQuerySchema.safeParse({ from: '2024-01-01', to: '2024-12-31' }).success).toBe(true);
  });
});

describe('resolveAnalyticsRange / analyticsRangeError', () => {
  it('mặc định 30 ngày gần nhất gồm hôm nay', () => {
    expect(resolveAnalyticsRange({}, '2026-10-10')).toEqual({ from: '2026-09-11', to: '2026-10-10' });
    expect(resolveAnalyticsRange({ from: '2026-10-01' }, '2026-10-10')).toEqual({ from: '2026-10-01', to: '2026-10-10' });
  });
  it('báo lỗi khoảng sau khi resolve', () => {
    expect(analyticsRangeError('2026-10-11', '2026-10-10')).not.toBeNull();
    expect(analyticsRangeError('2020-01-01', '2026-10-10')).not.toBeNull();
    expect(analyticsRangeError('2026-10-01', '2026-10-10')).toBeNull();
  });
});
