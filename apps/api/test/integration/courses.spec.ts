import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import {
  adminCourseTreeSchema,
  adminLessonSchema,
  adminTrackSchema,
  errorResponseSchema,
  loginResponseSchema,
  publicLessonSchema,
  publicTrackCardSchema,
  publicTrackTreeSchema,
  sitemapEntriesSchema,
} from '@piano-daily/shared';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { CacheInvalidator } from '../../src/modules/catalog/cache-invalidator';
import { PrismaService } from '../../src/prisma/prisma.service';
import { corruptMidi, makeMidi } from '../fixtures/midi';
import { createApp, TEST_S3 } from './create-app';
import { resolveTestDatabaseUrl } from './test-env';

const PASSWORD = 'correct-horse-battery';
const SUPER = 'courses-super@piano-daily.test';
const EDITOR = 'courses-editor@piano-daily.test';
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const MISSING = '01920000-0000-7000-8000-000000000999';

const s3 = new S3Client({
  endpoint: TEST_S3.S3_ENDPOINT,
  region: TEST_S3.S3_REGION,
  forcePathStyle: true,
  credentials: { accessKeyId: TEST_S3.S3_ACCESS_KEY_ID, secretAccessKey: TEST_S3.S3_SECRET_ACCESS_KEY },
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});
async function listKeys(bucket: string, prefix: string): Promise<string[]> {
  const res = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }));
  return (res.Contents ?? []).map((o) => o.Key!).sort();
}
const lessonKeys = async (id: string) => [
  ...(await listKeys(TEST_S3.S3_BUCKET_PRIVATE, `private/lessons/${id}/`)),
  ...(await listKeys(TEST_S3.S3_BUCKET_PUBLIC, `public/lessons/${id}/`)),
];

describe('Khoá học C1: soạn, công khai, nhạc MIDI (Postgres + SeaweedFS thật)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superToken: string;
  let editorToken: string;
  let ipSeq = 0;

  const api = () => request(app.getHttpServer());
  const as = (token: string | null, req: request.Test) => (token ? req.set('Authorization', `Bearer ${token}`) : req);
  const sup = (req: request.Test) => as(superToken, req);
  const login = async (email: string) =>
    loginResponseSchema.parse((await api().post('/auth/login').set('CF-Connecting-IP', `198.51.100.${(ipSeq += 1) + 200}`).send({ email, password: PASSWORD }).expect(200)).body).accessToken;

  const mk = async (kind: string, body: Record<string, unknown>) => ((await sup(api().post(`/admin/courses/${kind}`).send(body)).expect(201)).body as { id: string; slug?: string });
  const setPub = (kind: string, id: string, isPublished: boolean) => sup(api().patch(`/admin/courses/${kind}/${id}/published`).send({ isPublished }));
  const midiUpload = (id: string, buf: Buffer, filename = 'gam.mid', token: string | null = superToken) =>
    as(token, api().post(`/admin/courses/lessons/${id}/midi`).attach('file', buf, { filename, contentType: 'audio/midi' }));

  /** Dựng nhanh một cây công khai: nhánh → level → section → bài (mặc định đều công khai). */
  async function build(opts: { lessons?: Record<string, unknown>[]; publish?: boolean } = {}) {
    const track = await mk('tracks', { title: 'Phương pháp', description: 'Nền tảng' });
    const level = await mk('levels', { trackId: track.id, title: 'Cấp 1' });
    const section = await mk('sections', { levelId: level.id, title: 'Làm quen phím' });
    const lessons: { id: string }[] = [];
    for (const body of opts.lessons ?? [{ title: 'Bài 1', content: 'Nội dung' }]) lessons.push(await mk('lessons', { sectionId: section.id, ...body }));
    if (opts.publish !== false) {
      await setPub('tracks', track.id, true);
      await setPub('levels', level.id, true);
      await setPub('sections', section.id, true);
      for (const lesson of lessons) await setPub('lessons', lesson.id, true);
    }
    return { track: track as { id: string; slug: string }, level, section, lessons };
  }

  beforeAll(async () => {
    app = await createApp(resolveTestDatabaseUrl());
    prisma = app.get(PrismaService);
    await prisma.$executeRawUnsafe('TRUNCATE TABLE refresh_tokens, users CASCADE');
    const passwordHash = await bcrypt.hash(PASSWORD, 4);
    await prisma.user.create({ data: { email: SUPER, passwordHash, name: 'Founder', role: 'SUPER_ADMIN' } });
    await prisma.user.create({ data: { email: EDITOR, passwordHash, name: 'Editor', role: 'EDITOR' } });
    superToken = await login(SUPER);
    editorToken = await login(EDITOR);
  });
  afterAll(async () => {
    await prisma?.$executeRawUnsafe('TRUNCATE TABLE course_lessons, course_sections, course_levels, course_tracks CASCADE');
    await app?.close();
  });
  beforeEach(async () => {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE course_lessons, course_sections, course_levels, course_tracks CASCADE');
  });

  describe('soạn (admin)', () => {
    it('chưa đăng nhập 401; EDITOR xem được nhưng mọi ghi/upload/xoá/đổi thứ tự 403', async () => {
      const { track, lessons } = await build();
      await api().get('/admin/courses/tracks').expect(401);
      await as(editorToken, api().get('/admin/courses/tracks')).expect(200);
      await as(editorToken, api().get(`/admin/courses/tracks/${track.id}/tree`)).expect(200);
      await as(editorToken, api().post('/admin/courses/tracks').send({ title: 'X' })).expect(403);
      await as(editorToken, api().patch(`/admin/courses/tracks/${track.id}`).send({ title: 'Y' })).expect(403);
      await as(editorToken, api().post(`/admin/courses/tracks/${track.id}/move`).send({ direction: 'up' })).expect(403);
      await as(editorToken, api().delete(`/admin/courses/lessons/${lessons[0]!.id}`)).expect(403);
      await midiUpload(lessons[0]!.id, makeMidi(2), 'a.mid', editorToken).expect(403);
    });

    it('tạo nhánh: slug sinh từ tiêu đề (trùng thì -2), nháp, sort_order = max+1; tạo cấp con gắn đúng cha', async () => {
      const a = await mk('tracks', { title: 'Phương pháp' });
      const b = await mk('tracks', { title: 'Phương pháp' });
      expect(a.slug).toBe('phuong-phap');
      expect(b.slug).toBe('phuong-phap-2');
      const rows = await prisma.courseTrack.findMany({ orderBy: { sortOrder: 'asc' } });
      expect(rows.map((r) => [r.slug, r.sortOrder, r.isPublished])).toEqual([['phuong-phap', 0, false], ['phuong-phap-2', 1, false]]);
      const level = await mk('levels', { trackId: a.id, title: 'Cấp 1' });
      const level2 = await mk('levels', { trackId: a.id, title: 'Cấp 2' });
      expect((await prisma.courseLevel.findMany({ where: { trackId: a.id }, orderBy: { sortOrder: 'asc' } })).map((l) => l.id)).toEqual([level.id, level2.id]);
    });

    it('đổi tên không đổi slug; dữ liệu sai 400 theo trường; cha lạ 404; :kind sai 404', async () => {
      const track = await mk('tracks', { title: 'Kỹ thuật' });
      const updated = adminTrackSchema.parse((await sup(api().patch(`/admin/courses/tracks/${track.id}`).send({ title: 'Kỹ thuật nâng cao', isPublished: false })).expect(200)).body);
      expect(updated).toMatchObject({ slug: 'ky-thuat', title: 'Kỹ thuật nâng cao' });
      const bad = await sup(api().post('/admin/courses/tracks').send({ title: '   ' })).expect(400);
      expect(errorResponseSchema.parse(bad.body).error.code).toBe('VALIDATION_FAILED');
      await sup(api().post('/admin/courses/levels').send({ trackId: MISSING, title: 'x' })).expect(404);
      await sup(api().post('/admin/courses/levels').send({ title: 'x' })).expect(400);
      // NUL trong văn bản: 400 (Postgres không lưu được), không phải 500.
      await sup(api().post('/admin/courses/tracks').send({ title: 'a\u0000b' })).expect(400);
      await sup(api().post('/admin/courses/bai-hoc').send({ title: 'x' })).expect(404);
      await sup(api().patch(`/admin/courses/tracks/${MISSING}`).send({ title: 'x' })).expect(404);
    });

    it('bài học: video/nhạc/nội dung đều tuỳ chọn; link YouTube sai bị từ chối; bài nháp được để trống', async () => {
      const { section } = await build({ lessons: [], publish: false });
      const empty = await mk('lessons', { sectionId: section.id, title: 'Nháp trống' });
      expect(adminLessonSchema.parse(empty)).toMatchObject({ youtubeUrl: null, content: '', midi: null, isPublished: false });
      await mk('lessons', { sectionId: section.id, title: 'Có video', youtubeUrl: YT });
      const bad = await sup(api().post('/admin/courses/lessons').send({ sectionId: section.id, title: 'x', youtubeUrl: 'https://vimeo.com/1' })).expect(400);
      expect(JSON.stringify(errorResponseSchema.parse(bad.body).error.details)).toContain('youtubeUrl');
      await sup(api().post('/admin/courses/lessons').send({ sectionId: section.id, title: 'x', durationMinutes: 0 })).expect(400);
    });

    it('bài công khai phải có ít nhất một phần: bật công khai/tạo công khai/xoá phần cuối đều bị 400', async () => {
      const { section } = await build({ lessons: [], publish: false });
      const empty = await mk('lessons', { sectionId: section.id, title: 'Trống' });
      const res = await setPub('lessons', empty.id, true).expect(400);
      expect(JSON.stringify(errorResponseSchema.parse(res.body).error.details)).toContain('content');
      await sup(api().post('/admin/courses/lessons').send({ sectionId: section.id, title: 'x', isPublished: true })).expect(400);
      const withText = await mk('lessons', { sectionId: section.id, title: 'Có chữ', content: 'abc', isPublished: true });
      await sup(api().patch(`/admin/courses/lessons/${withText.id}`).send({ title: 'Có chữ', content: '   ', isPublished: true })).expect(400);
      await sup(api().patch(`/admin/courses/lessons/${withText.id}`).send({ title: 'Có chữ', content: 'abc', youtubeUrl: '', isPublished: true })).expect(200);
    });

    it('đổi thứ tự lên/xuống hoán đổi anh em liền kề; mục đầu lên hoặc mục cuối xuống không đổi; chuẩn hoá thứ tự bị trùng', async () => {
      const { section } = await build({ lessons: [{ title: 'A', content: 'a' }, { title: 'B', content: 'b' }, { title: 'C', content: 'c' }], publish: false });
      const order = async () => (await prisma.courseLesson.findMany({ where: { sectionId: section.id }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] })).map((l) => l.title);
      expect(await order()).toEqual(['A', 'B', 'C']);
      const rows = await prisma.courseLesson.findMany({ where: { sectionId: section.id }, orderBy: { createdAt: 'asc' } });
      const move = (id: string, direction: 'up' | 'down') => sup(api().post(`/admin/courses/lessons/${id}/move`).send({ direction }));
      await move(rows[2]!.id, 'up').expect(204);
      expect(await order()).toEqual(['A', 'C', 'B']);
      await move(rows[0]!.id, 'up').expect(204);
      await move(rows[1]!.id, 'down').expect(204); // B đã ở cuối
      expect(await order()).toEqual(['A', 'C', 'B']);
      // Khuyết/trùng số thứ tự: sau một lần đổi, cả nhóm được đánh lại 0..n-1.
      await prisma.courseLesson.updateMany({ where: { sectionId: section.id }, data: { sortOrder: 5 } });
      await move(rows[1]!.id, 'up').expect(204);
      expect((await prisma.courseLesson.findMany({ where: { sectionId: section.id }, orderBy: { sortOrder: 'asc' } })).map((l) => l.sortOrder)).toEqual([0, 1, 2]);
      await sup(api().post(`/admin/courses/lessons/${MISSING}/move`).send({ direction: 'up' })).expect(404);
      await sup(api().post(`/admin/courses/lessons/${rows[0]!.id}/move`).send({ direction: 'sideways' })).expect(400);
    });

    it('đổi thứ tự hai lần đồng thời không làm trùng/mất thứ tự', async () => {
      const { section } = await build({ lessons: [{ title: 'A', content: 'a' }, { title: 'B', content: 'b' }, { title: 'C', content: 'c' }, { title: 'D', content: 'd' }], publish: false });
      const rows = await prisma.courseLesson.findMany({ where: { sectionId: section.id }, orderBy: { createdAt: 'asc' } });
      await Promise.all(rows.slice(1).map((r) => sup(api().post(`/admin/courses/lessons/${r.id}/move`).send({ direction: 'up' })).expect(204)));
      const after = await prisma.courseLesson.findMany({ where: { sectionId: section.id }, orderBy: { sortOrder: 'asc' } });
      expect(after.map((l) => l.sortOrder)).toEqual([0, 1, 2, 3]);
      expect(new Set(after.map((l) => l.id)).size).toBe(4);
    });

    it('xoá nút còn con -> 409 RESOURCE_IN_USE; xoá từ lá lên thì được', async () => {
      const { track, level, section, lessons } = await build();
      for (const [kind, id] of [['tracks', track.id], ['levels', level.id], ['sections', section.id]] as const) {
        const res = await sup(api().delete(`/admin/courses/${kind}/${id}`)).expect(409);
        expect(errorResponseSchema.parse(res.body).error.code).toBe('RESOURCE_IN_USE');
      }
      await sup(api().delete(`/admin/courses/lessons/${lessons[0]!.id}`)).expect(204);
      await sup(api().delete(`/admin/courses/sections/${section.id}`)).expect(204);
      await sup(api().delete(`/admin/courses/levels/${level.id}`)).expect(204);
      await sup(api().delete(`/admin/courses/tracks/${track.id}`)).expect(204);
      await sup(api().delete(`/admin/courses/tracks/${track.id}`)).expect(404);
    });

    it('cây admin có cả phần nháp, đúng thứ tự, kèm số bài (tất cả/công khai)', async () => {
      const { track, section } = await build({ lessons: [{ title: 'Công khai', content: 'x' }], publish: true });
      await mk('lessons', { sectionId: section.id, title: 'Nháp' });
      const tree = adminCourseTreeSchema.parse((await sup(api().get(`/admin/courses/tracks/${track.id}/tree`)).expect(200)).body);
      expect(tree.track).toMatchObject({ lessonCount: 2, publishedLessonCount: 1 });
      expect(tree.levels[0]!.sections[0]!.lessons.map((l) => [l.title, l.isPublished])).toEqual([['Công khai', true], ['Nháp', false]]);
      await sup(api().get(`/admin/courses/tracks/${MISSING}/tree`)).expect(404);
    });
  });

  describe('nhạc MIDI của bài học', () => {
    it('upload: note-JSON ra URL public, file gốc ở vùng private, kèm thời lượng/số nốt; DB và object khớp', async () => {
      const { lessons } = await build({ lessons: [{ title: 'Gam Đô', content: 'x' }] });
      const id = lessons[0]!.id;
      const res = adminLessonSchema.parse((await midiUpload(id, makeMidi(3)).expect(200)).body);
      expect(res.midi).toMatchObject({ originalName: 'gam.mid', noteCount: expect.any(Number) });
      expect(res.midi!.noteCount).toBeGreaterThan(0);
      expect(res.midi!.noteJsonUrl).toContain(`public/lessons/${id}/MIDI_JSON/`);
      expect(res.midi!.noteJsonUrl).not.toContain('private/');
      const keys = await lessonKeys(id);
      expect(keys).toHaveLength(2);
      expect(keys.filter((k) => k.startsWith('private/'))).toHaveLength(1);
      const row = await prisma.courseLesson.findUniqueOrThrow({ where: { id } });
      expect([row.midiStorageKey, row.noteJsonKey].sort()).toEqual(keys);
    });

    it('thay file: DB trỏ file mới, object cũ bị xoá; upload lại đúng nội dung cũ không xoá nhầm', async () => {
      const { lessons } = await build({ lessons: [{ title: 'Gam', content: 'x' }] });
      const id = lessons[0]!.id;
      await midiUpload(id, makeMidi(2)).expect(200);
      const first = await lessonKeys(id);
      await midiUpload(id, makeMidi(2)).expect(200); // cùng nội dung -> cùng key
      expect(await lessonKeys(id)).toEqual(first);
      await midiUpload(id, makeMidi(5)).expect(200);
      const after = await lessonKeys(id);
      expect(after).toHaveLength(2);
      expect(after.some((k) => first.includes(k))).toBe(false);
    });

    it('file lỗi: không phải MIDI 415, MIDI hỏng 422, quá 2MB 413, thiếu file 400; không ghi gì, bài giữ nguyên', async () => {
      const { lessons } = await build({ lessons: [{ title: 'Gam', content: 'x' }] });
      const id = lessons[0]!.id;
      expect((await midiUpload(id, Buffer.from('không phải midi')).expect(415)).body).toBeTruthy();
      await midiUpload(id, corruptMidi()).expect(422);
      await midiUpload(id, Buffer.concat([Buffer.from('MThd'), Buffer.alloc(2 * 1024 * 1024 + 1)])).expect(413);
      await sup(api().post(`/admin/courses/lessons/${id}/midi`)).expect(400);
      await midiUpload(MISSING, makeMidi(2)).expect(404);
      expect(await lessonKeys(id)).toEqual([]);
      expect((await prisma.courseLesson.findUniqueOrThrow({ where: { id } })).noteJsonKey).toBeNull();
    });

    it('gỡ nhạc: xoá object, bài về không nhạc; bài công khai mà nhạc là phần duy nhất thì không gỡ (400); chưa có nhạc -> 404', async () => {
      const { lessons } = await build({ lessons: [{ title: 'Chỉ nhạc' }, { title: 'Nhạc và chữ', content: 'chữ' }], publish: false });
      const [onlyMusic, both] = lessons.map((l) => l.id) as [string, string];
      await midiUpload(onlyMusic, makeMidi(2)).expect(200);
      await midiUpload(both, makeMidi(2)).expect(200);
      await setPub('lessons', onlyMusic, true).expect(200); // nhạc là phần duy nhất vẫn đủ điều kiện công khai
      await sup(api().delete(`/admin/courses/lessons/${onlyMusic}/midi`)).expect(400);
      expect(await lessonKeys(onlyMusic)).toHaveLength(2);
      const gone = adminLessonSchema.parse((await sup(api().delete(`/admin/courses/lessons/${both}/midi`)).expect(200)).body);
      expect(gone.midi).toBeNull();
      expect(await lessonKeys(both)).toEqual([]);
      await sup(api().delete(`/admin/courses/lessons/${both}/midi`)).expect(404);
    });

    it('xoá bài học xoá luôn object nhạc', async () => {
      const { lessons } = await build({ lessons: [{ title: 'Gam', content: 'x' }], publish: false });
      const id = lessons[0]!.id;
      await midiUpload(id, makeMidi(2)).expect(200);
      expect(await lessonKeys(id)).toHaveLength(2);
      await sup(api().delete(`/admin/courses/lessons/${id}`)).expect(204);
      expect(await lessonKeys(id)).toEqual([]);
    });
  });

  describe('công khai', () => {
    it('GET /courses chỉ nhánh công khai, lessonCount là số bài công khai, theo thứ tự; không cần đăng nhập', async () => {
      const { track, section } = await build({ lessons: [{ title: 'A', content: 'a' }, { title: 'B', content: 'b' }] });
      await mk('lessons', { sectionId: section.id, title: 'Nháp', content: 'd' }); // nháp: không tính
      const draft = await mk('tracks', { title: 'Nháp cả nhánh' });
      expect(draft.id).toBeTruthy();
      const cards = (await api().get('/courses').expect(200)).body as unknown[];
      const parsed = cards.map((c) => publicTrackCardSchema.parse(c));
      expect(parsed).toEqual([{ slug: track.slug, title: 'Phương pháp', description: 'Nền tảng', lessonCount: 2 }]);
    });

    it('cây công khai: chỉ phần công khai, đúng thứ tự, có cờ video/nhạc/thời lượng; nhánh nháp hoặc lạ -> 404', async () => {
      const { track, lessons } = await build({
        lessons: [{ title: 'Chỉ chữ', content: 'x' }, { title: 'Video', youtubeUrl: YT, durationMinutes: 5 }, { title: 'Nhạc' }],
        publish: false,
      });
      await midiUpload(lessons[2]!.id, makeMidi(2)).expect(200);
      expect((await api().get(`/courses/${track.slug}`)).status).toBe(404);
      await setPub('tracks', track.id, true);
      const tree = await prisma.courseLevel.findFirstOrThrow({ where: { trackId: track.id } });
      const section = await prisma.courseSection.findFirstOrThrow({ where: { levelId: tree.id } });
      await setPub('levels', tree.id, true);
      await setPub('sections', section.id, true);
      for (const l of lessons) await setPub('lessons', l.id, true);
      const body = publicTrackTreeSchema.parse((await api().get(`/courses/${track.slug}`).expect(200)).body);
      expect(body.lessonCount).toBe(3);
      expect(body.levels[0]!.sections[0]!.lessons).toEqual([
        { id: lessons[0]!.id, title: 'Chỉ chữ', durationMinutes: null, hasVideo: false, hasMusic: false },
        { id: lessons[1]!.id, title: 'Video', durationMinutes: 5, hasVideo: true, hasMusic: false },
        { id: lessons[2]!.id, title: 'Nhạc', durationMinutes: null, hasVideo: false, hasMusic: true },
      ]);
      await api().get('/courses/khong-ton-tai').expect(404);
    });

    it('ẩn theo cấp cha: section/level/nhánh nháp che mọi bài bên dưới khỏi cây, số đếm, chi tiết, bài trước/sau và sitemap', async () => {
      const { track, level, section, lessons } = await build({ lessons: [{ title: 'A', content: 'a' }, { title: 'B', content: 'b' }] });
      const [a, b] = lessons.map((l) => l.id) as [string, string];
      const detail = (id: string) => api().get(`/courses/${track.slug}/lessons/${id}`);
      expect((await detail(a).expect(200)).body).toMatchObject({ next: { id: b }, prev: null });
      for (const [kind, id] of [['sections', section.id], ['levels', level.id], ['tracks', track.id]] as const) {
        await setPub(kind, id, false).expect(200);
        await detail(a).expect(404);
        const entries = sitemapEntriesSchema.parse((await api().get('/sitemap-entries').expect(200)).body);
        expect(entries.courseLessons.find((l) => l.id === a)).toBeUndefined();
        if (kind !== 'tracks') expect((publicTrackTreeSchema.parse((await api().get(`/courses/${track.slug}`).expect(200)).body)).lessonCount).toBe(0);
        else await api().get(`/courses/${track.slug}`).expect(404);
        await setPub(kind, id, true).expect(200);
      }
      // Bài nháp bị bỏ khỏi bài trước/sau.
      await setPub('lessons', b, false).expect(200);
      expect((await detail(a).expect(200)).body).toMatchObject({ next: null });
    });

    it('chi tiết bài: nội dung, video, nhạc (URL public, không lộ khoá private), level/section, bài trước/sau; sai nhánh/id -> 404', async () => {
      const { track, lessons } = await build({
        lessons: [{ title: 'Một', content: 'Chữ **đậm**' }, { title: 'Hai', youtubeUrl: YT }, { title: 'Ba', content: 'cuối' }],
        publish: false,
      });
      await midiUpload(lessons[1]!.id, makeMidi(3)).expect(200);
      const level = await prisma.courseLevel.findFirstOrThrow({ where: { trackId: track.id } });
      const section = await prisma.courseSection.findFirstOrThrow({ where: { levelId: level.id } });
      await setPub('tracks', track.id, true);
      await setPub('levels', level.id, true);
      await setPub('sections', section.id, true);
      for (const l of lessons) await setPub('lessons', l.id, true);
      const res = await api().get(`/courses/${track.slug}/lessons/${lessons[1]!.id}`).expect(200);
      const lesson = publicLessonSchema.parse(res.body);
      expect(lesson).toMatchObject({
        title: 'Hai',
        youtubeUrl: YT,
        track: { slug: track.slug, title: 'Phương pháp' },
        level: { title: 'Cấp 1' },
        section: { title: 'Làm quen phím' },
        prev: { id: lessons[0]!.id, title: 'Một' },
        next: { id: lessons[2]!.id, title: 'Ba' },
      });
      expect(lesson.midi!.noteJsonUrl).toContain('MIDI_JSON');
      expect(JSON.stringify(res.body)).not.toMatch(/private\/|midiStorageKey|originalName/);
      const other = await mk('tracks', { title: 'Khác' });
      await setPub('tracks', other.id, true);
      await api().get(`/courses/${other.slug}/lessons/${lessons[1]!.id}`).expect(404);
      await api().get(`/courses/${track.slug}/lessons/${MISSING}`).expect(404);
      await api().get(`/courses/${track.slug}/lessons/not-a-uuid`).expect(404);
    });

    it('sitemap-entries có nhánh và bài công khai (đủ cả cha)', async () => {
      const { track, lessons } = await build({ lessons: [{ title: 'A', content: 'a' }] });
      const entries = sitemapEntriesSchema.parse((await api().get('/sitemap-entries').set('CF-Connecting-IP', '203.0.113.9').expect(200)).body);
      expect(entries.courseTracks.map((t) => t.slug)).toEqual([track.slug]);
      expect(entries.courseLessons).toEqual([{ id: lessons[0]!.id, trackSlug: track.slug, updatedAt: expect.any(String) }]);
    });
  });

  describe('song ngữ vi/en và level chọn mức', () => {
    it('lưu/xoá trường tiếng Anh (rỗng -> null); request cũ không có trường EN vẫn hợp lệ; quá dài 400', async () => {
      const track = (await sup(api().post('/admin/courses/tracks').send({ title: 'Phương pháp', titleEn: ' Method ', descriptionEn: '' })).expect(201)).body;
      expect(track).toMatchObject({ titleEn: 'Method', descriptionEn: null });
      const cleared = (await sup(api().patch(`/admin/courses/tracks/${track.id}`).send({ title: 'Phương pháp', titleEn: '   ' })).expect(200)).body;
      expect(cleared.titleEn).toBeNull();
      await sup(api().post('/admin/courses/tracks').send({ title: 'x', titleEn: 'a'.repeat(121) })).expect(400);
      const section = (await build()).section;
      const lesson = (await sup(api().post('/admin/courses/lessons').send({ sectionId: section.id, title: 'Bài', titleEn: 'Lesson', content: 'vi', contentEn: 'en' })).expect(201)).body;
      expect(lesson).toMatchObject({ titleEn: 'Lesson', contentEn: 'en' });
    });

    it('public: mặc định/vi là tiếng Việt, en lấy bản EN và thiếu thì dùng tiếng Việt từng trường; locale sai 400', async () => {
      const track = await mk('tracks', { title: 'Phương pháp', titleEn: 'Method', description: 'Nền tảng' });
      const level = await mk('levels', { trackId: track.id, title: 'Cấp 1', titleEn: 'Level 1' });
      const section = await mk('sections', { levelId: level.id, title: 'Làm quen phím' }); // chưa dịch
      const l1 = await mk('lessons', { sectionId: section.id, title: 'Bài 1', titleEn: 'Lesson 1', content: 'Nội dung', contentEn: 'Content' });
      const l2 = await mk('lessons', { sectionId: section.id, title: 'Bài 2', content: 'Chỉ tiếng Việt' });
      for (const [kind, id] of [['tracks', track.id], ['levels', level.id], ['sections', section.id], ['lessons', l1.id], ['lessons', l2.id]] as const) await setPub(kind, id, true);
      const slug = track.slug!;

      expect(publicTrackCardSchema.parse(((await api().get('/courses').expect(200)).body as unknown[])[0])).toMatchObject({ title: 'Phương pháp', description: 'Nền tảng' });
      const en = (await api().get('/courses?locale=en').expect(200)).body as { title: string; description: string }[];
      expect(en[0]).toMatchObject({ title: 'Method', description: 'Nền tảng' }); // mô tả chưa dịch -> tiếng Việt

      const tree = publicTrackTreeSchema.parse((await api().get(`/courses/${slug}?locale=en`).expect(200)).body);
      expect(tree.levels[0]!.title).toBe('Level 1');
      expect(tree.levels[0]!.sections[0]!.title).toBe('Làm quen phím');
      expect(tree.levels[0]!.sections[0]!.lessons.map((l) => l.title)).toEqual(['Lesson 1', 'Bài 2']);
      expect(publicTrackTreeSchema.parse((await api().get(`/courses/${slug}`).expect(200)).body).levels[0]!.title).toBe('Cấp 1');

      const detailEn = publicLessonSchema.parse((await api().get(`/courses/${slug}/lessons/${l1.id}?locale=en`).expect(200)).body);
      expect(detailEn).toMatchObject({ title: 'Lesson 1', content: 'Content', track: { title: 'Method' }, level: { title: 'Level 1' }, next: { id: l2.id, title: 'Bài 2' } });
      const detailVi = publicLessonSchema.parse((await api().get(`/courses/${slug}/lessons/${l1.id}?locale=vi`).expect(200)).body);
      expect(detailVi).toMatchObject({ title: 'Bài 1', content: 'Nội dung' });
      await api().get('/courses?locale=fr').expect(400);
    });

    it('bài chỉ có nội dung tiếng Anh không công khai được (quy tắc xét tiếng Việt)', async () => {
      const { section } = await build();
      const lesson = await mk('lessons', { sectionId: section.id, title: 'Chỉ EN', contentEn: 'Only English' });
      const res = await setPub('lessons', lesson.id, true).expect(400);
      expect(errorResponseSchema.parse(res.body).error.code).toBe('VALIDATION_FAILED');
    });

    it('level: chọn mức đặt tên chuẩn vi/en (bỏ qua title gửi lên); "Khác" cần tên; mức lạ 400; đổi mức đổi tên', async () => {
      const track = await mk('tracks', { title: 'Kỹ thuật' });
      const lv = (await sup(api().post('/admin/courses/levels').send({ trackId: track.id, preset: 'INTERMEDIATE', title: 'tự gõ' })).expect(201)).body;
      expect(lv).toMatchObject({ preset: 'INTERMEDIATE', title: 'Trung cấp', titleEn: 'Intermediate' });
      const other = (await sup(api().post('/admin/courses/levels').send({ trackId: track.id, preset: null, title: 'Chủ đề đặc biệt', titleEn: 'Special' })).expect(201)).body;
      expect(other).toMatchObject({ preset: null, title: 'Chủ đề đặc biệt', titleEn: 'Special' });
      await sup(api().post('/admin/courses/levels').send({ trackId: track.id })).expect(400); // Khác mà không có tên
      await sup(api().post('/admin/courses/levels').send({ trackId: track.id, preset: 'GOD' })).expect(400);
      const changed = (await sup(api().patch(`/admin/courses/levels/${lv.id}`).send({ preset: 'ADVANCED' })).expect(200)).body;
      expect(changed).toMatchObject({ preset: 'ADVANCED', title: 'Cao cấp', titleEn: 'Advanced' });
      // Hai level cùng mức trong một nhánh là hợp lệ.
      await sup(api().post('/admin/courses/levels').send({ trackId: track.id, preset: 'ADVANCED' })).expect(201);
    });
  });

  describe('làm mới cache web', () => {
    it('mọi ghi thành công (tạo/sửa/công khai/đổi thứ tự/upload/gỡ nhạc/xoá) notify tag courses; thao tác lỗi thì không', async () => {
      const notify = vi.spyOn(app.get(CacheInvalidator), 'notify').mockResolvedValue(undefined);
      try {
        const track = await mk('tracks', { title: 'Cache' });
        const level = await mk('levels', { trackId: track.id, title: 'L' });
        const section = await mk('sections', { levelId: level.id, title: 'S' });
        const lesson = await mk('lessons', { sectionId: section.id, title: 'B', content: 'x' });
        await sup(api().patch(`/admin/courses/lessons/${lesson.id}`).send({ title: 'B2', content: 'x' })).expect(200);
        await setPub('lessons', lesson.id, true).expect(200);
        await sup(api().post(`/admin/courses/lessons/${lesson.id}/move`).send({ direction: 'down' })).expect(204);
        await midiUpload(lesson.id, makeMidi(2)).expect(200);
        await sup(api().delete(`/admin/courses/lessons/${lesson.id}/midi`)).expect(200);
        await sup(api().delete(`/admin/courses/lessons/${lesson.id}`)).expect(204);
        expect(notify).toHaveBeenCalledTimes(10);
        for (const call of notify.mock.calls) expect(call).toEqual([['courses', 'sitemap']]);

        notify.mockClear();
        await sup(api().post('/admin/courses/tracks').send({ title: '' })).expect(400);
        await sup(api().delete(`/admin/courses/tracks/${track.id}`)).expect(409);
        await sup(api().patch(`/admin/courses/tracks/${MISSING}`).send({ title: 'x' })).expect(404);
        await midiUpload(MISSING, makeMidi(2)).expect(404);
        expect(notify).not.toHaveBeenCalled();
      } finally {
        notify.mockRestore();
      }
    });
  });

  describe('ràng buộc DB', () => {
    it('bài công khai không phần nào bị DB chặn; nhạc phải đủ cặp khoá', async () => {
      const { lessons } = await build({ lessons: [{ title: 'A', content: 'a' }], publish: false });
      await expect(prisma.courseLesson.update({ where: { id: lessons[0]!.id }, data: { isPublished: true, content: '' } })).rejects.toBeTruthy();
      await expect(prisma.courseLesson.update({ where: { id: lessons[0]!.id }, data: { midiStorageKey: 'private/lessons/x/MIDI/a.mid' } })).rejects.toBeTruthy();
    });
  });
});
