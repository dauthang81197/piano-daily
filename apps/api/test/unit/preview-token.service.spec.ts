import { JwtService } from '@nestjs/jwt';
import { PREVIEW_TOKEN_AUDIENCE, PREVIEW_TOKEN_TTL_SECONDS } from '@piano-daily/shared';
import { describe, expect, it } from 'vitest';
import { PreviewTokenService } from '../../src/modules/identity/preview-token.service';

const SECRET = 'unit-test-jwt-secret-0123456789abcdef0123';
const SHEET = '0192a000-0000-7000-8000-000000000001';
const OTHER = '0192a000-0000-7000-8000-000000000002';

const jwt = () => new JwtService({ secret: SECRET, signOptions: { algorithm: 'HS256' } });
const service = () => new PreviewTokenService(jwt());

describe('PreviewTokenService', () => {
  it('phát token hợp lệ: gắn sheetId, hạn đúng 10 phút, audience riêng, không có sub/role', async () => {
    const { token, expiresAt } = await service().issue(SHEET);
    const payload = jwt().decode(token) as Record<string, unknown>;
    expect(payload.sheetId).toBe(SHEET);
    expect(payload.aud).toBe(PREVIEW_TOKEN_AUDIENCE);
    expect(payload.sub).toBeUndefined();
    expect(payload.role).toBeUndefined();
    expect((payload.exp as number) - (payload.iat as number)).toBe(PREVIEW_TOKEN_TTL_SECONDS);
    expect(PREVIEW_TOKEN_TTL_SECONDS).toBe(600);
    expect(new Date(expiresAt).getTime()).toBe((payload.exp as number) * 1000);
  });

  it('verify: đúng token và đúng sheetId (không phân biệt hoa thường)', async () => {
    const { token } = await service().issue(SHEET);
    expect(await service().verify(token, SHEET)).toBe(true);
    expect(await service().verify(token, SHEET.toUpperCase())).toBe(true);
  });

  it('verify: token của Sheet khác thì sai', async () => {
    const { token } = await service().issue(SHEET);
    expect(await service().verify(token, OTHER)).toBe(false);
  });

  it('verify: hết hạn thì sai', async () => {
    const expired = await jwt().signAsync(
      { sheetId: SHEET },
      { audience: PREVIEW_TOKEN_AUDIENCE, expiresIn: -10 },
    );
    expect(await service().verify(expired, SHEET)).toBe(false);
  });

  it('verify: access token (không có audience preview) không dùng được làm preview token', async () => {
    const access = await jwt().signAsync({ sub: 'user-1', role: 'SUPER_ADMIN', sheetId: SHEET }, { expiresIn: 900 });
    expect(await service().verify(access, SHEET)).toBe(false);
  });

  it('verify: audience khác thì sai', async () => {
    const other = await jwt().signAsync({ sheetId: SHEET }, { audience: 'someone-else', expiresIn: 600 });
    expect(await service().verify(other, SHEET)).toBe(false);
  });

  it('verify: ký bằng khoá khác, bị sửa nội dung, rác, rỗng, thiếu: đều sai và không ném', async () => {
    const forged = await new JwtService({ secret: 'another-secret-0123456789abcdef012345' }).signAsync(
      { sheetId: SHEET },
      { audience: PREVIEW_TOKEN_AUDIENCE, expiresIn: 600 },
    );
    const { token } = await service().issue(SHEET);
    const [h, , s] = token.split('.');
    const tampered = `${h}.${Buffer.from(JSON.stringify({ sheetId: OTHER, aud: PREVIEW_TOKEN_AUDIENCE, exp: 9999999999 })).toString('base64url')}.${s}`;
    for (const bad of [forged, tampered, 'khong.phai.jwt', 'abc', '', undefined]) {
      expect(await service().verify(bad, SHEET)).toBe(false);
    }
  });

  it('verify: thuật toán none bị từ chối', async () => {
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(
      JSON.stringify({ sheetId: SHEET, aud: PREVIEW_TOKEN_AUDIENCE, exp: Math.floor(Date.now() / 1000) + 600 }),
    ).toString('base64url');
    expect(await service().verify(`${header}.${body}.`, SHEET)).toBe(false);
  });

  it('verify: payload không có sheetId kiểu chuỗi thì sai', async () => {
    const noSheet = await jwt().signAsync({}, { audience: PREVIEW_TOKEN_AUDIENCE, expiresIn: 600 });
    const numeric = await jwt().signAsync({ sheetId: 5 }, { audience: PREVIEW_TOKEN_AUDIENCE, expiresIn: 600 });
    expect(await service().verify(noSheet, SHEET)).toBe(false);
    expect(await service().verify(numeric, SHEET)).toBe(false);
  });
});
