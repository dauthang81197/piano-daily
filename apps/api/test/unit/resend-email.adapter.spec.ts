import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ResendEmailAdapter, ResendEmailError } from '../../src/modules/notify/resend-email.adapter';

const config = (values: Record<string, string | undefined>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<never, true>;
const MESSAGE = { to: 'buyer@example.com', subject: 'S', html: '<p>h</p>', text: 't' };

afterEach(() => vi.unstubAllGlobals());

describe('ResendEmailAdapter', () => {
  it('gọi REST Resend với Bearer, from và to', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const adapter = new ResendEmailAdapter(config({ RESEND_API_KEY: 'key', EMAIL_FROM: 'Piano <no-reply@piano.test>' }));
    await expect(adapter.send(MESSAGE)).resolves.toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { method: string; headers: Record<string, string>; body: string }];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer key');
    expect(JSON.parse(init.body)).toEqual({
      from: 'Piano <no-reply@piano.test>',
      to: ['buyer@example.com'],
      subject: 'S',
      html: '<p>h</p>',
      text: 't',
    });
  });

  it.each([
    ['thiếu API key', { EMAIL_FROM: 'a@b.co' }],
    ['thiếu EMAIL_FROM', { RESEND_API_KEY: 'key' }],
  ])('%s: bỏ qua, không gọi mạng, không ném lỗi', async (_n, values) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(new ResendEmailAdapter(config(values)).send(MESSAGE)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Resend trả lỗi HTTP: ném ResendEmailError không chứa email', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 422 })));
    const adapter = new ResendEmailAdapter(config({ RESEND_API_KEY: 'key', EMAIL_FROM: 'a@b.co' }));
    const err = await adapter.send(MESSAGE).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ResendEmailError);
    expect((err as Error).message).not.toContain('buyer@example.com');
  });
});
