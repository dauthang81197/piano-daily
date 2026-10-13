import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../src/config/env';
import { GoogleVerifier } from '../../src/modules/customers/google-verifier.service';

const CLIENT_ID = 'abc.apps.googleusercontent.com';
const verifier = (clientId: string | null = CLIENT_ID) =>
  new GoogleVerifier({ get: () => clientId ?? undefined } as unknown as ConfigService<Env, true>);
const reply = (status: number, body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: status < 400, status, json: async () => body })));
const good = { aud: CLIENT_ID, iss: 'https://accounts.google.com', exp: String(Math.floor(Date.now() / 1000) + 3600), sub: 'g-1', email: 'Khach@Example.com', email_verified: 'true', name: ' Khách ' };

afterEach(() => vi.unstubAllGlobals());

describe('GoogleVerifier', () => {
  it('hợp lệ: trả sub, email chữ thường, tên đã trim; gửi idToken đã mã hoá tới tokeninfo', async () => {
    reply(200, good);
    await expect(verifier().verify('a b&c')).resolves.toEqual({ sub: 'g-1', email: 'khach@example.com', name: 'Khách' });
    expect(vi.mocked(fetch).mock.calls[0]![0]).toBe('https://oauth2.googleapis.com/tokeninfo?id_token=a%20b%26c');
  });

  it('thiếu tên thì dùng phần trước @ của email', async () => {
    reply(200, { ...good, name: undefined });
    await expect(verifier().verify('t')).resolves.toMatchObject({ name: 'Khach' });
  });

  it.each([
    ['sai audience (token của app khác)', { ...good, aud: 'khac.apps.googleusercontent.com' }],
    ['sai nhà phát hành', { ...good, iss: 'https://evil.example' }],
    ['token đã hết hạn', { ...good, exp: '1' }],
    ['email chưa xác minh', { ...good, email_verified: 'false' }],
    ['thiếu sub', { ...good, sub: undefined }],
    ['thiếu email', { ...good, email: undefined }],
  ])('%s -> 401', async (_name, body) => {
    reply(200, body);
    await expect(verifier().verify('t')).rejects.toMatchObject({ status: 401 });
  });

  it('Google trả 5xx/429 -> 503 (không báo là token sai)', async () => {
    reply(503, {});
    await expect(verifier().verify('t')).rejects.toMatchObject({ status: 503 });
    reply(429, {});
    await expect(verifier().verify('t')).rejects.toMatchObject({ status: 503 });
  });

  it('Google trả 400 (token sai/hết hạn) -> 401; Google lỗi mạng -> 503; chưa cấu hình client id -> 503, không gọi mạng', async () => {
    reply(400, { error: 'invalid_token' });
    await expect(verifier().verify('t')).rejects.toMatchObject({ status: 401 });
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))));
    await expect(verifier().verify('t')).rejects.toMatchObject({ status: 503 });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(verifier(null).verify('t')).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
