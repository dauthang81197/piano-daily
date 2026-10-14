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

async function get(path: string): Promise<unknown | null> {
  const res = await publicFetch(path, { tags: [cacheTags.courses], headers: { Accept: 'application/json' } });
  // 404/400: nhánh/bài không công khai hoặc không tồn tại -> `notFound()`; lỗi khác ném để error boundary hiển thị.
  if (res.status === 404 || res.status === 400) return null;
  if (!res.ok) throw new Error(`API ${path} trả ${res.status}`);
  return res.json();
}

/** Các nhánh khoá học đã công khai (thẻ ở `/courses`). */
export async function fetchTracks(): Promise<PublicTrackCard[]> {
  const body = await get('/courses');
  return z.array(publicTrackCardSchema).parse(body ?? []);
}

export async function fetchTrack(slug: string): Promise<PublicTrackTree | null> {
  const body = await get(`/courses/${encodeURIComponent(slug)}`);
  return body === null ? null : publicTrackTreeSchema.parse(body);
}

export async function fetchLesson(trackSlug: string, id: string): Promise<PublicLesson | null> {
  const body = await get(`/courses/${encodeURIComponent(trackSlug)}/lessons/${encodeURIComponent(id)}`);
  return body === null ? null : publicLessonSchema.parse(body);
}
