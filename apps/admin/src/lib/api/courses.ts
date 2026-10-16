import type { AdminCourseTree, AdminLesson, AdminLevel, AdminSection, AdminSubmission, AdminTrack, CourseKind, MySubmission } from '@piano-daily/shared';
import { apiFetch } from './client';
import { type UploadProgress, uploadMultipart } from './upload';

const PATH = '/admin/courses';
const item = (kind: CourseKind, id: string) => `${PATH}/${kind}/${encodeURIComponent(id)}`;

type Node = AdminTrack | AdminLevel | AdminSection | AdminLesson;

/** Admin Courses API (khoá học C1). Ghi, upload, đổi thứ tự, xoá chỉ SUPER_ADMIN (API trả 403 cho EDITOR). */
export const coursesApi = {
  listTracks: (signal?: AbortSignal) => apiFetch<AdminTrack[]>(`${PATH}/tracks`, { signal }),
  tree: (trackId: string, signal?: AbortSignal) => apiFetch<AdminCourseTree>(`${PATH}/tracks/${encodeURIComponent(trackId)}/tree`, { signal }),
  create: (kind: CourseKind, body: object) => apiFetch<Node>(`${PATH}/${kind}`, { method: 'POST', json: body }),
  update: (kind: CourseKind, id: string, body: object) => apiFetch<Node>(item(kind, id), { method: 'PATCH', json: body }),
  setPublished: (kind: CourseKind, id: string, isPublished: boolean) =>
    apiFetch<Node>(`${item(kind, id)}/published`, { method: 'PATCH', json: { isPublished } }),
  move: (kind: CourseKind, id: string, direction: 'up' | 'down') =>
    apiFetch<void>(`${item(kind, id)}/move`, { method: 'POST', json: { direction } }),
  remove: (kind: CourseKind, id: string) => apiFetch<void>(item(kind, id), { method: 'DELETE' }),
  /** `POST /admin/courses/lessons/:id/midi` — multipart `file` (MIDI ≤ 2MB); trả bài học đã cập nhật. */
  uploadMidi: (lessonId: string, file: File, onProgress?: UploadProgress) =>
    uploadMultipart<AdminLesson>(
      `${PATH}/lessons/${encodeURIComponent(lessonId)}/midi`,
      () => {
        const form = new FormData();
        form.append('file', file, file.name);
        return form;
      },
      onProgress,
    ),
  /** `GET /admin/courses/lessons/:id/midi/file` — file `.mid` gốc của bài (cho trình gõ nốt); 404 nếu bài chưa có nhạc. */
  midiFile: (lessonId: string) => apiFetch<ArrayBuffer>(`${PATH}/lessons/${encodeURIComponent(lessonId)}/midi/file`, { binary: true }),
  removeMidi: (lessonId: string) => apiFetch<AdminLesson>(`${PATH}/lessons/${encodeURIComponent(lessonId)}/midi`, { method: 'DELETE' }),
  /** C3: bài nộp của khách cho một bài (mới nhất trước). Mọi admin xem được. */
  submissions: (lessonId: string, signal?: AbortSignal) =>
    apiFetch<AdminSubmission[]>(`${PATH}/lessons/${encodeURIComponent(lessonId)}/submissions`, { signal }),
  /** Ẩn/hiện bài nộp (chỉ SUPER_ADMIN). */
  setSubmissionHidden: (id: string, hidden: boolean) =>
    apiFetch<MySubmission>(`${PATH}/submissions/${encodeURIComponent(id)}`, { method: 'PATCH', json: { hidden } }),
  removeSubmission: (id: string) => apiFetch<void>(`${PATH}/submissions/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
