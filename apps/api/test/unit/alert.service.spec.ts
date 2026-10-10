import type { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { ALERT_THROTTLE_MS, AlertService } from '../../src/modules/notify/alert.service';

describe('AlertService', () => {
  const send = vi.fn<(m: { to: string; subject: string; html: string; text: string }) => Promise<boolean | void>>();
  const make = (alertEmail: string | undefined = 'founder@x.co') =>
    new AlertService({ send }, { get: () => alertEmail } as unknown as ConfigService<Env, true>);

  beforeEach(() => {
    send.mockReset();
    send.mockResolvedValue(true);
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('gửi email tới ALERT_EMAIL với mã đơn trong nội dung', async () => {
    await make().alert('REVIEW_REQUIRED', 'Đơn PD-ABC234 cần xem', 'Đơn PD-ABC234 lệch', 'PD-ABC234');
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0]![0]).toMatchObject({ to: 'founder@x.co' });
    expect(send.mock.calls[0]![0].text).toContain('PD-ABC234');
  });

  it('thiếu ALERT_EMAIL: chỉ log, không gửi, không ném', async () => {
    await expect(make('').alert('LATE_CAPTURE', 's', 'd')).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
  });

  it('bão sự kiện: 10 lần cùng loại + khoá chỉ gửi một email; hết 15 phút thì gửi lại', async () => {
    const service = make();
    for (let i = 0; i < 10; i += 1) await service.alert('WEBHOOK_ERROR', 's', 'd', 'k');
    expect(send).toHaveBeenCalledOnce();
    await service.alert('WEBHOOK_ERROR', 's', 'd', 'khác');
    expect(send).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(ALERT_THROTTLE_MS + 1);
    await service.alert('WEBHOOK_ERROR', 's', 'd', 'k');
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('gửi lỗi: không ném, và cho phép thử lại ngay', async () => {
    const service = make();
    send.mockRejectedValueOnce(new Error('boom founder@x.co'));
    await expect(service.alert('BACKUP_FAILED', 's', 'd')).resolves.toBeUndefined();
    await service.alert('BACKUP_FAILED', 's', 'd');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('adapter bỏ qua (trả false): không giữ chỗ throttle', async () => {
    const service = make();
    send.mockResolvedValueOnce(false);
    await service.alert('BACKUP_FAILED', 's', 'd');
    await service.alert('BACKUP_FAILED', 's', 'd');
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('thoát ký tự HTML trong nội dung', async () => {
    await make().alert('BACKUP_FAILED', 's', '<b>x</b>');
    expect(send.mock.calls[0]![0].html).toContain('&lt;b&gt;');
  });
});
