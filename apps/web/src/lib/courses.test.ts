import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchLesson, fetchTrack, fetchTracks } from './courses';

describe('lib/courses', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.stubEnv('API_INTERNAL_URL', 'http://api:4000');
    vi.stubEnv('INTERNAL_API_SECRET', 'secret');
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it('truyền locale vào URL (mỗi ngôn ngữ một khoá cache) và gắn tag courses', async () => {
    fetchMock.mockImplementation(async () => new Response('[]', { status: 200 }));
    await fetchTracks('en');
    await fetchTracks('vi');
    await fetchTracks('khác');
    const urls = fetchMock.mock.calls.map(([url]) => url);
    expect(urls).toEqual(['http://api:4000/courses?locale=en', 'http://api:4000/courses?locale=vi', 'http://api:4000/courses?locale=vi']);
    expect(fetchMock.mock.calls[0]![1].next.tags).toEqual(['courses']);
  });

  it('nhánh/bài không công khai (404 hoặc id sai 400) -> null; lỗi khác ném', async () => {
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 404 }));
    await expect(fetchTrack('x', 'en')).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
    await expect(fetchLesson('x', 'bad', 'vi')).resolves.toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 500 }));
    await expect(fetchTrack('x', 'en')).rejects.toThrow('500');
    expect(fetchMock.mock.calls[1]![0]).toBe('http://api:4000/courses/x/lessons/bad?locale=vi');
  });
});
