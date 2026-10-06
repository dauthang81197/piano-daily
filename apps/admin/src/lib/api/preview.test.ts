import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callsTo, jsonResponse, sessionBody, stubFetch } from '../../test/helpers';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { previewApi } from './preview';

const ID = '0192a000-0000-7000-8000-000000000001';

describe('previewApi.issue', () => {
  beforeEach(() => resetSessionForTests());
  afterEach(() => vi.unstubAllGlobals());

  it('POST /admin/preview-tokens kèm access token và body { sheetId }', async () => {
    const fetchMock = stubFetch((url) => {
      if (url.endsWith('/auth/login')) return jsonResponse(200, sessionBody('access-xyz'));
      return jsonResponse(200, { token: 'tok', expiresAt: '2026-10-06T00:10:00.000Z' });
    });
    await login({ email: 'admin@piano-daily.test', password: 'correct-horse-battery' });
    const result = await previewApi.issue(ID);
    expect(result).toEqual({ token: 'tok', expiresAt: '2026-10-06T00:10:00.000Z' });
    const [call] = callsTo(fetchMock, '/admin/preview-tokens');
    expect(call![1].method).toBe('POST');
    expect(JSON.parse(String(call![1].body))).toEqual({ sheetId: ID });
    expect(new Headers(call![1].headers).get('Authorization')).toBe('Bearer access-xyz');
  });
});
