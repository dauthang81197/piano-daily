import { afterEach, describe, expect, it, vi } from 'vitest';
import { MusicscoreClient, MusicscoreError } from '../../src/modules/scores/musicscore.client';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;
const client = (url: string | null = 'http://piano-musicscore:3000') =>
  new MusicscoreClient(config({ MUSICSCORE_URL: url ?? undefined, SCORE_JOB_TIMEOUT_MS: 10_000 }));

describe('MusicscoreClient', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('chưa cấu hình URL: enabled() = false và toMidi ném unavailable', async () => {
    const c = client(null);
    expect(c.enabled()).toBe(false);
    await expect(c.toMidi(Buffer.from('x'), 'pdf', 0)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('gửi thân thô tới /midi?transpose=n với Content-Type theo loại file (không lấy từ client)', async () => {
    const fetchMock = vi.fn(async () => new Response(Uint8Array.from([0x4d, 0x54, 0x68, 0x64]), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const out = await client().toMidi(Buffer.from('%PDF-'), 'pdf', -3);
    expect(out.toString()).toBe('MThd');
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://piano-musicscore:3000/midi?transpose=-3');
    expect(init).toMatchObject({ method: 'POST', headers: { 'Content-Type': 'application/pdf' } });
  });

  it.each([400, 415, 422])('mã %i: unreadable (nhận dạng không đọc được)', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"không đọc được"}', { status })));
    await expect(client().toMidi(Buffer.from('x'), 'png', 0)).rejects.toMatchObject({ kind: 'unreadable' });
  });

  it.each([401, 500, 503])('mã %i: unavailable (hạ tầng)', async (status) => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status })));
    await expect(client().toMidi(Buffer.from('x'), 'pdf', 0)).rejects.toBeInstanceOf(MusicscoreError);
    await expect(client().toMidi(Buffer.from('x'), 'pdf', 0)).rejects.toMatchObject({ kind: 'unavailable' });
  });

  it('lỗi mạng/timeout: unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('fetch failed'); }));
    await expect(client().toMidi(Buffer.from('x'), 'pdf', 0)).rejects.toMatchObject({ kind: 'unavailable' });
  });
});
