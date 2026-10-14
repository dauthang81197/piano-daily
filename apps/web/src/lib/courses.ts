import 'server-only';
import {
  cacheTags,
  type PublicLesson,
  type PublicTrackCard,
  type PublicTrackTree,
  publicLessonSchema,
  publicTrackCardSchema,
  publicTrackTreeSchema,
} from '@piano-daily/shared';
import { z } from 'zod';
import { publicFetch } from './api';

async function get(path: string, locale: string): Promise<unknown | null> {
  // `locale` nằm trong URL nên mỗi ngôn ngữ có khoá cache riêng; API chọn bản tiếng Anh (thiếu thì tiếng Việt).
  const res = await publicFetch(`${path}?locale=${locale === 'en' ? 'en' : 'vi'}`, { tags: [cacheTags.courses], headers: { Accept: 'application/json' } });
  // 404/400: nhánh/bài không công khai hoặc không tồn tại -> `notFound()`; lỗi khác ném để error boundary hiển thị.
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${path} trả ${res.status}`);
  return res.json();
}

/** Các nhánh khoá học đã công khai (thẻ ở `/courses`). */
export async function fetchTracks(locale: string): Promise<PublicTrackCard[]> {
  const body = await get('/courses', locale);
  return z.array(publicTrackCardSchema).parse(body ?? []);
}

export async function fetchTrack(slug: string, locale: string): Promise<PublicTrackTree | null> {
  const body = await get(`/courses/${encodeURIComponent(slug)}`, locale);
  return body === null ? null : publicTrackTreeSchema.parse(body);
}

export async function fetchLesson(trackSlug: string, id: string, locale: string): Promise<PublicLesson | null> {
  const body = await get(`/courses/${encodeURIComponent(trackSlug)}/lessons/${encodeURIComponent(id)}`, locale);
  return body === null ? null : publicLessonSchema.parse(body);
}
