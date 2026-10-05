import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchNoteJson, NOTE_JSON_TIMEOUT_MS } from './fetch-note-json';

describe('fetchNoteJson', () => {
  const fetchMock = vi.fn();
  beforeEach(() => vi.stubGlobal('fetch', fetchMock));
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('GET không credentials, có tín hiệu timeout; trả JSON', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ tracks: [] }), { status: 200 }));
    expect(await fetchNoteJson('http://cdn/notes.json')).toEqual({ tracks: [] });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('http://cdn/notes.json');
    expect(init.credentials).toBe('omit');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.method).toBeUndefined();
  });

  it('phản hồi không ok thì ném lỗi nêu mã trạng thái', async () => {
    fetchMock.mockResolvedValue(new Response('no', { status: 403 }));
    await expect(fetchNoteJson('http://cdn/x')).rejects.toThrow('403');
  });

  it('timeout mặc định 15 giây', () => {
    expect(NOTE_JSON_TIMEOUT_MS).toBe(15_000);
  });

  it('tín hiệu huỷ khi hết hạn', async () => {
    fetchMock.mockImplementation((_url: string, init: RequestInit) => new Promise((_res, rej) => {
      init.signal!.addEventListener('abort', () => rej(init.signal!.reason));
    }));
    await expect(fetchNoteJson('http://cdn/slow', 20)).rejects.toBeDefined();
  });
});
