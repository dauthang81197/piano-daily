import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  adminCourseTreeSchema,
  adminLessonSchema,
  adminCommentPageSchema,
  adminSubmissionSchema,
  adminTrackSchema,
  courseProgressSchema,
  errorResponseSchema,
  lessonSubmissionSchema,
  myCommunitySchema,
  publicCommunitySchema,
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

    it('GET …/midi/file trả đúng file đã upload (mọi admin); chưa có nhạc/id lạ 404; chưa đăng nhập 401', async () => {
      const { lessons } = await build({ lessons: [{ title: 'Có nhạc' }, { title: 'Chưa có nhạc', content: 'x' }], publish: false });
      const bytes = makeMidi(3);
      await midiUpload(lessons[0]!.id, bytes).expect(200);
      for (const token of [superToken, editorToken]) {
        const res = await as(token, api().get(`/admin/courses/lessons/${lessons[0]!.id}/midi/file`).buffer(true).parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        })).expect(200);
        expect(Buffer.from(res.body as Buffer).equals(bytes)).toBe(true);
        expect(res.headers['content-type']).toContain('application/octet-stream');
        expect(res.headers['content-disposition']).toContain(`bai-${lessons[0]!.id}.mid`);
        expect(res.headers['cache-control']).toBe('no-store');
      }
      await sup(api().get(`/admin/courses/lessons/${lessons[1]!.id}/midi/file`)).expect(404);
      await sup(api().get(`/admin/courses/lessons/${MISSING}/midi/file`)).expect(404);
      await sup(api().get('/admin/courses/lessons/khong-phai-uuid/midi/file')).expect(404);
      await api().get(`/admin/courses/lessons/${lessons[0]!.id}/midi/file`).expect(401);
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

    it('level có mức hiện tên chuẩn theo locale ở API công khai; contentEn giữ nguyên thụt lề; locale hoa/thường/rỗng', async () => {
      const track = await mk('tracks', { title: 'Kỹ thuật' });
      const level = await mk('levels', { trackId: track.id, preset: 'INTERMEDIATE' });
      const section = await mk('sections', { levelId: level.id, title: 'Gam' });
      const lesson = await mk('lessons', { sectionId: section.id, title: 'Bài 1', titleEn: 'Lesson 1', content: 'vi', contentEn: '    code\n\ntext\n' });
      const second = await mk('lessons', { sectionId: section.id, title: 'Bài 2', titleEn: 'Lesson 2', content: 'vi2' });
      for (const [kind, id] of [['tracks', track.id], ['levels', level.id], ['sections', section.id], ['lessons', lesson.id], ['lessons', second.id]] as const) await setPub(kind, id, true);
      const slug = track.slug!;
      const titleOf = async (q: string) => publicTrackTreeSchema.parse((await api().get(`/courses/${slug}${q}`).expect(200)).body).levels[0]!.title;
      expect(await titleOf('')).toBe('Trung cấp');
      expect(await titleOf('?locale=vi')).toBe('Trung cấp');
      expect(await titleOf('?locale=en')).toBe('Intermediate');
      expect(await titleOf('?locale=EN')).toBe('Intermediate');
      expect(await titleOf('?locale=')).toBe('Trung cấp');
      await api().get(`/courses/${slug}?locale=fr`).expect(400);
      const detail = publicLessonSchema.parse((await api().get(`/courses/${slug}/lessons/${second.id}?locale=en`).expect(200)).body);
      expect(detail).toMatchObject({ title: 'Lesson 2', level: { title: 'Intermediate' }, prev: { id: lesson.id, title: 'Lesson 1' } });
      const first = publicLessonSchema.parse((await api().get(`/courses/${slug}/lessons/${lesson.id}?locale=en`).expect(200)).body);
      expect(first.content).toBe('    code\n\ntext\n');
      expect(first.next).toEqual({ id: second.id, title: 'Lesson 2' });
      await api().get(`/courses/${slug}/lessons/${lesson.id}?locale=fr`).expect(400);
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

  describe('tiến độ học của khách (C2)', () => {
    let alice: { id: string; token: string };
    let bob: { id: string; token: string };
    const IDS = '/customer/courses/progress';
    const cust = async (email: string) => {
      const c = await prisma.customer.create({ data: { email, passwordHash: 'x', name: email, emailVerifiedAt: new Date() } });
      return { id: c.id, token: await app.get(JwtService).signAsync({ sub: c.id, typ: 'customer' }) };
    };
    const ip = () => `198.51.100.${(ipSeq += 1) + 100}`;
    const progress = (token: string | null) => as(token, api().get(IDS).set('CF-Connecting-IP', ip()));
    const complete = (token: string | null, lessonId: string, body: unknown = { completed: true }) =>
      as(token, api().put(`/customer/courses/lessons/${lessonId}/completion`).set('CF-Connecting-IP', ip()).send(body as object));

    beforeEach(async () => {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
      alice = await cust('alice@example.com');
      bob = await cust('bob@example.com');
    });
    afterAll(async () => {
      await prisma?.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
    });

    it('chưa đăng nhập / token admin -> 401; chưa học gì -> rỗng', async () => {
      await progress(null).expect(401);
      await progress(superToken).expect(401);
      await complete(null, MISSING).expect(401);
      const res = await progress(alice.token).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(courseProgressSchema.parse(res.body)).toEqual({ tracks: [], lessonIds: [] });
    });

    it('đánh dấu, lặp lại (một dòng), bỏ dấu (kể cả khi chưa có), đếm theo nhánh', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }, { title: 'A3', content: 'x' }] });
      const [l1, l2] = a.lessons;
      expect((await complete(alice.token, l1!.id).expect(200)).body).toEqual({ completed: true });
      await complete(alice.token, l1!.id).expect(200);
      await complete(alice.token, l2!.id).expect(200);
      expect(await prisma.courseLessonProgress.count({ where: { customerId: alice.id } })).toBe(2);
      const res = courseProgressSchema.parse((await progress(alice.token).expect(200)).body);
      expect(res.tracks).toEqual([{ slug: a.track.slug, completed: 2 }]);
      expect([...res.lessonIds].sort()).toEqual([l1!.id, l2!.id].sort());

      expect((await complete(alice.token, l1!.id, { completed: false }).expect(200)).body).toEqual({ completed: false });
      await complete(alice.token, a.lessons[2]!.id, { completed: false }).expect(200);
      expect(courseProgressSchema.parse((await progress(alice.token).expect(200)).body).lessonIds).toEqual([l2!.id]);
    });

    it('bài nháp, cha ẩn, id lạ hoặc không phải uuid -> 404, không ghi; body sai -> 400', async () => {
      const a = await build({ publish: false });
      await complete(alice.token, a.lessons[0]!.id).expect(404);
      await setPub('tracks', a.track.id, true);
      await setPub('levels', a.level.id, true);
      await setPub('lessons', a.lessons[0]!.id, true);
      await complete(alice.token, a.lessons[0]!.id).expect(404); // section vẫn ẩn
      await complete(alice.token, MISSING).expect(404);
      await complete(alice.token, 'khong-phai-uuid').expect(404);
      expect(await prisma.courseLessonProgress.count()).toBe(0);
      await setPub('sections', a.section.id, true);
      await complete(alice.token, a.lessons[0]!.id, {}).expect(400);
      await complete(alice.token, a.lessons[0]!.id, { completed: 'yes' }).expect(400);
      await complete(alice.token, a.lessons[0]!.id).expect(200);
    });

    it('ẩn sau khi học thì số đếm giảm, bật lại thì tính lại; cô lập giữa hai khách', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      await complete(alice.token, a.lessons[0]!.id).expect(200);
      await complete(alice.token, a.lessons[1]!.id).expect(200);
      await complete(bob.token, a.lessons[0]!.id).expect(200);

      await setPub('lessons', a.lessons[0]!.id, false);
      let res = courseProgressSchema.parse((await progress(alice.token).expect(200)).body);
      expect(res.lessonIds).toEqual([a.lessons[1]!.id]);
      expect(res.tracks).toEqual([{ slug: a.track.slug, completed: 1 }]);
      await setPub('tracks', a.track.id, false);
      expect(courseProgressSchema.parse((await progress(alice.token).expect(200)).body)).toEqual({ tracks: [], lessonIds: [] });
      await setPub('tracks', a.track.id, true);
      await setPub('lessons', a.lessons[0]!.id, true);
      res = courseProgressSchema.parse((await progress(alice.token).expect(200)).body);
      expect(res.lessonIds).toHaveLength(2);
      expect(courseProgressSchema.parse((await progress(bob.token).expect(200)).body).lessonIds).toEqual([a.lessons[0]!.id]);
    });

    it('đếm tách theo nhánh; PUT no-store; khách chưa xác minh email vẫn đánh dấu được; cha ẩn ở level/section -> 404', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      const b = await build({ lessons: [{ title: 'B1', content: 'x' }] });
      const res = await complete(alice.token, a.lessons[0]!.id).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      await complete(alice.token, b.lessons[0]!.id).expect(200);
      await complete(alice.token, a.lessons[1]!.id).expect(200);
      const got = courseProgressSchema.parse((await progress(alice.token).expect(200)).body);
      expect([...got.tracks].sort((x, y) => x.slug.localeCompare(y.slug))).toEqual(
        [{ slug: a.track.slug, completed: 2 }, { slug: b.track.slug, completed: 1 }].sort((x, y) => x.slug.localeCompare(y.slug)),
      );
      const unverified = await cust('chua-xac-minh@example.com');
      await prisma.customer.update({ where: { id: unverified.id }, data: { emailVerifiedAt: null } });
      await complete(unverified.token, a.lessons[0]!.id).expect(200);

      await setPub('levels', a.level.id, false);
      await complete(alice.token, a.lessons[0]!.id, { completed: false }).expect(404);
      await setPub('levels', a.level.id, true);
      await setPub('sections', a.section.id, false);
      await complete(alice.token, a.lessons[0]!.id).expect(404);
    });

    it('token khách còn hạn nhưng tài khoản đã bị xoá -> 401, không 500', async () => {
      const a = await build();
      await prisma.customer.delete({ where: { id: bob.id } });
      await complete(bob.token, a.lessons[0]!.id).expect(401);
    });

    it('xoá bài hoặc xoá khách thì dòng tiến độ xoá theo', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      await complete(alice.token, a.lessons[0]!.id).expect(200);
      await complete(bob.token, a.lessons[1]!.id).expect(200);
      await prisma.courseLesson.delete({ where: { id: a.lessons[0]!.id } });
      expect(await prisma.courseLessonProgress.count()).toBe(1);
      await prisma.customer.delete({ where: { id: bob.id } });
      expect(await prisma.courseLessonProgress.count()).toBe(0);
    });
  });

  describe('bài nộp của khách (C3)', () => {
    let alice: { id: string; token: string };
    let bob: { id: string; token: string };
    const DRIVE = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp';
    const DRIVE_CANON = 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view';
    const cust = async (email: string) => {
      const c = await prisma.customer.create({ data: { email, passwordHash: 'x', name: email, emailVerifiedAt: new Date() } });
      return { id: c.id, token: await app.get(JwtService).signAsync({ sub: c.id, typ: 'customer' }) };
    };
    const ip = () => `198.51.100.${(ipSeq += 1) + 100}`;
    const path = (lessonId: string) => `/customer/courses/lessons/${lessonId}/submission`;
    const getSub = (token: string | null, lessonId: string) => as(token, api().get(path(lessonId)).set('CF-Connecting-IP', ip()));
    const putSub = (token: string | null, lessonId: string, body: unknown, address = ip()) =>
      as(token, api().put(path(lessonId)).set('CF-Connecting-IP', address).send(body as object));
    const delSub = (token: string | null, lessonId: string) => as(token, api().delete(path(lessonId)).set('CF-Connecting-IP', ip()));
    const firstPath = (body: unknown) => (errorResponseSchema.parse(body).error.details as { path: string }[])[0]?.path;
    const adminList = (lessonId: string, token: string | null = superToken) => as(token, api().get(`/admin/courses/lessons/${lessonId}/submissions`));

    beforeEach(async () => {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
      alice = await cust('alice@example.com');
      bob = await cust('bob@example.com');
    });
    afterAll(async () => {
      await prisma?.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
    });

    it('chưa đăng nhập / token admin -> 401; chưa nộp -> submission null, no-store', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      await getSub(null, id).expect(401);
      await getSub(superToken, id).expect(401);
      await putSub(null, id, { url: YT }).expect(401);
      await delSub(null, id).expect(401);
      const res = await getSub(alice.token, id).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(lessonSubmissionSchema.parse(res.body)).toEqual({ submission: null });
    });

    it('nộp mới (YouTube), nộp lại sang Drive thay link, giữ một dòng và giữ cờ ẩn', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const first = lessonSubmissionSchema.parse((await putSub(alice.token, id, { url: 'youtu.be/dQw4w9WgXcQ', note: '  Lần 1  ' }).expect(200)).body);
      expect(first.submission).toMatchObject({ kind: 'YOUTUBE', url: YT, note: 'Lần 1', isHidden: false });
      await sup(api().patch(`/admin/courses/submissions/${first.submission!.id}`).send({ hidden: true })).expect(200);
      const second = lessonSubmissionSchema.parse((await putSub(alice.token, id, { url: DRIVE }).expect(200)).body);
      expect(second.submission).toMatchObject({ id: first.submission!.id, kind: 'DRIVE', url: DRIVE_CANON, note: null, isHidden: true });
      expect(await prisma.courseSubmission.count()).toBe(1);
      expect(lessonSubmissionSchema.parse((await getSub(alice.token, id).expect(200)).body).submission?.isHidden).toBe(true);
    });

    it('link lạ, thư mục Drive, ghi chú dài, body thừa -> 400 tại đúng trường, không ghi', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      for (const url of ['https://evil.com/watch?v=dQw4w9WgXcQ', 'javascript:alert(1)', 'https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOp', 'https://drive.google.com.evil.com/file/d/1AbCdEfGhIjKlMnOp/view', 'https://user:pw@drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', '']) {
        const res = await putSub(alice.token, id, { url }).expect(400);
        expect(firstPath(res.body)).toBe('url');
      }
      await putSub(alice.token, id, {}).expect(400);
      expect(firstPath((await putSub(alice.token, id, { url: YT, note: 'x'.repeat(501) }).expect(400)).body)).toBe('note');
      await putSub(alice.token, id, { url: YT, extra: 1 }).expect(400);
      expect(await prisma.courseSubmission.count()).toBe(0);
    });

    it('bài nháp, cha ẩn, id lạ, không phải uuid -> 404 và không ghi; tài khoản đã xoá -> 401', async () => {
      const a = await build({ publish: false });
      await putSub(alice.token, a.lessons[0]!.id, { url: YT }).expect(404);
      await getSub(alice.token, a.lessons[0]!.id).expect(404);
      await putSub(alice.token, MISSING, { url: YT }).expect(404);
      await putSub(alice.token, 'khong-phai-uuid', { url: YT }).expect(404);
      expect(await prisma.courseSubmission.count()).toBe(0);
      const b = await build();
      await prisma.customer.delete({ where: { id: bob.id } });
      await putSub(bob.token, b.lessons[0]!.id, { url: YT }).expect(401);
    });

    it('cô lập giữa khách; DELETE idempotent; xoá bài/khách thì bài nộp xoá theo', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      const [l1, l2] = a.lessons.map((l) => l.id) as [string, string];
      await putSub(alice.token, l1, { url: YT }).expect(200);
      await putSub(bob.token, l2, { url: DRIVE }).expect(200);
      expect(lessonSubmissionSchema.parse((await getSub(bob.token, l1).expect(200)).body)).toEqual({ submission: null });
      await delSub(bob.token, l1).expect(204); // chưa nộp: vẫn 204
      expect(await prisma.courseSubmission.count()).toBe(2); // xoá của Bob không đụng bài của Alice
      await delSub(alice.token, l1).expect(204);
      await delSub(alice.token, l1).expect(204);
      expect(await prisma.courseSubmission.count()).toBe(1);
      await prisma.courseLesson.delete({ where: { id: l2 } });
      expect(await prisma.courseSubmission.count()).toBe(0);
      await putSub(alice.token, l1, { url: YT }).expect(200);
      await prisma.customer.delete({ where: { id: alice.id } });
      expect(await prisma.courseSubmission.count()).toBe(0);
    });

    it('bài bị ẩn sau khi có bài nộp: khách sửa -> 404, vẫn xoá được; admin vẫn liệt kê', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      await putSub(alice.token, id, { url: YT }).expect(200);
      await setPub('lessons', id, false);
      await putSub(alice.token, id, { url: DRIVE }).expect(404);
      expect((await adminList(id).expect(200)).body).toHaveLength(1);
      await delSub(alice.token, id).expect(204);
      expect(await prisma.courseSubmission.count()).toBe(0);
    });

    it('admin: liệt kê mới nhất trước kèm khách; ẩn/hiện, xoá; EDITOR chỉ xem; id lạ 404', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const mine = lessonSubmissionSchema.parse((await putSub(alice.token, id, { url: YT }).expect(200)).body).submission!;
      await putSub(bob.token, id, { url: DRIVE, note: 'Bob' }).expect(200);
      const list = adminSubmissionSchema.array().parse((await adminList(id).expect(200)).body);
      expect(list.map((s) => s.customer.email)).toEqual(['bob@example.com', 'alice@example.com']);
      await adminList(id, null).expect(401);
      await adminList(id, alice.token).expect(401);
      expect(adminSubmissionSchema.array().parse((await adminList(id, editorToken).expect(200)).body)).toHaveLength(2);
      await adminList(MISSING).expect(404);

      const patch = (token: string | null, sid: string, body: unknown) => as(token, api().patch(`/admin/courses/submissions/${sid}`).send(body as object));
      await patch(editorToken, mine.id, { hidden: true }).expect(403);
      await patch(superToken, mine.id, { hidden: 'x' }).expect(400);
      expect((await patch(superToken, mine.id, { hidden: true }).expect(200)).body).toMatchObject({ id: mine.id, isHidden: true });
      expect((await patch(superToken, mine.id, { hidden: false }).expect(200)).body).toMatchObject({ isHidden: false });
      await patch(superToken, MISSING, { hidden: true }).expect(404);
      await as(editorToken, api().delete(`/admin/courses/submissions/${mine.id}`)).expect(403);
      await sup(api().delete(`/admin/courses/submissions/${mine.id}`)).expect(204);
      await sup(api().delete(`/admin/courses/submissions/${mine.id}`)).expect(404);
      expect(await prisma.courseSubmission.count()).toBe(1);
    });

    it('ghi quá 10 lần/phút từ cùng một địa chỉ -> 429 (PUT và DELETE)', async () => {
      const a = await build();
      const address = ip();
      for (let i = 0; i < 10; i += 1) await putSub(alice.token, a.lessons[0]!.id, { url: YT }, address).expect(200);
      await putSub(alice.token, a.lessons[0]!.id, { url: YT }, address).expect(429);
      const other = ip();
      for (let i = 0; i < 10; i += 1) await as(alice.token, api().delete(path(a.lessons[0]!.id)).set('CF-Connecting-IP', other)).expect(204);
      await as(alice.token, api().delete(path(a.lessons[0]!.id)).set('CF-Connecting-IP', other)).expect(429);
    });

    it('hai lần nộp đầu tiên song song không gây 500 (đua khoá duy nhất)', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const results = await Promise.all([putSub(alice.token, id, { url: YT }), putSub(alice.token, id, { url: DRIVE })]);
      expect(results.map((r) => r.status)).toEqual([200, 200]);
      expect(await prisma.courseSubmission.count()).toBe(1);
    });
  });

  describe('cộng đồng: đánh giá và bình luận (C4)', () => {
    let alice: { id: string; token: string };
    let bob: { id: string; token: string };
    const cust = async (email: string, name: string, verified = true) => {
      const c = await prisma.customer.create({ data: { email, passwordHash: 'x', name, emailVerifiedAt: verified ? new Date() : null } });
      return { id: c.id, token: await app.get(JwtService).signAsync({ sub: c.id, typ: 'customer' }) };
    };
    let communityIp = 0;
    /** Địa chỉ riêng cho từng request (dải 10.x, không đụng các dải của login/C2/C3) để không dính throttle của nhau. */
    const ip = () => `10.${((communityIp += 1) >> 8) & 255}.${communityIp & 255}.7`;
    const base = (lessonId: string) => `/customer/courses/lessons/${lessonId}`;
    const pub = (lessonId: string, query = '') => api().get(`/courses/lessons/${lessonId}/community${query}`).set('CF-Connecting-IP', ip());
    const mine = (token: string | null, lessonId: string) => as(token, api().get(`${base(lessonId)}/community/mine`).set('CF-Connecting-IP', ip()));
    const rate = (token: string | null, lessonId: string, body: unknown, address = ip()) => as(token, api().put(`${base(lessonId)}/rating`).set('CF-Connecting-IP', address).send(body as object));
    const post = (token: string | null, lessonId: string, body: unknown, address = ip()) => as(token, api().post(`${base(lessonId)}/comments`).set('CF-Connecting-IP', address).send(body as object));
    const edit = (token: string | null, id: string, body: unknown) => as(token, api().patch(`/customer/courses/comments/${id}`).set('CF-Connecting-IP', ip()).send(body as object));
    const del = (token: string | null, id: string) => as(token, api().delete(`/customer/courses/comments/${id}`).set('CF-Connecting-IP', ip()));
    const hide = (id: string, hidden: boolean, token: string | null = superToken) => as(token, api().patch(`/admin/courses/comments/${id}`).send({ hidden }));
    const view = async (lessonId: string, query = '') => publicCommunitySchema.parse((await pub(lessonId, query).expect(200)).body);

    beforeEach(async () => {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
      alice = await cust('alice@example.com', 'Alice');
      bob = await cust('bob@example.com', 'Bob');
    });
    afterAll(async () => {
      await prisma?.$executeRawUnsafe('TRUNCATE TABLE customers CASCADE');
    });

    it('đọc công khai không cần đăng nhập: rỗng ban đầu, no-store; ghi cần token khách', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const res = await pub(id).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(publicCommunitySchema.parse(res.body)).toEqual({ rating: { average: null, count: 0 }, comments: [], nextCursor: null });
      await post(null, id, { body: 'x' }).expect(401);
      await post(superToken, id, { body: 'x' }).expect(401);
      await rate(null, id, { stars: 3 }).expect(401);
      await mine(null, id).expect(401);
    });

    it('chấm sao: ghi đè một dòng, trung bình/số lượng, gỡ idempotent, 400 với sao sai', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      expect((await rate(alice.token, id, { stars: 4 }).expect(200)).body).toEqual({ myRating: 4, rating: { average: 4, count: 1 } });
      expect((await rate(alice.token, id, { stars: 5 }).expect(200)).body).toEqual({ myRating: 5, rating: { average: 5, count: 1 } });
      expect((await rate(bob.token, id, { stars: 2 }).expect(200)).body).toEqual({ myRating: 2, rating: { average: 3.5, count: 2 } });
      expect(await prisma.courseRating.count()).toBe(2);
      expect((await view(id)).rating).toEqual({ average: 3.5, count: 2 });
      expect(myCommunitySchema.parse((await mine(alice.token, id).expect(200)).body).myRating).toBe(5);
      for (const bad of [{ stars: 0 }, { stars: 6 }, { stars: 1.5 }, { stars: '3' }, {}, { stars: 3, x: 1 }]) await rate(alice.token, id, bad).expect(400);
      const gone = await as(alice.token, api().delete(`${base(id)}/rating`).set('CF-Connecting-IP', ip())).expect(200);
      expect(gone.body).toEqual({ myRating: null, rating: { average: 2, count: 1 } });
      await as(alice.token, api().delete(`${base(id)}/rating`).set('CF-Connecting-IP', ip())).expect(200);
    });

    it('chưa xác minh email -> 403 EMAIL_NOT_VERIFIED, không ghi; tài khoản bị khoá hoặc đã xoá -> 401', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const carol = await cust('carol@example.com', 'Carol', false);
      expect(errorResponseSchema.parse((await post(carol.token, id, { body: 'hi' }).expect(403)).body).error.code).toBe('EMAIL_NOT_VERIFIED');
      await rate(carol.token, id, { stars: 3 }).expect(403);
      expect(await prisma.courseComment.count()).toBe(0);
      await prisma.customer.update({ where: { id: bob.id }, data: { isActive: false } });
      await post(bob.token, id, { body: 'hi' }).expect(401);
      await prisma.customer.delete({ where: { id: alice.id } });
      await post(alice.token, id, { body: 'hi' }).expect(401);
    });

    it('bình luận: tạo, hiện công khai với tên (không lộ email), trả lời một cấp, thứ tự mới nhất trước / trả lời cũ trước', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const c1 = (await post(alice.token, id, { body: '  Bài hay\n\n\n\nquá  ' }).expect(201)).body as { id: string; body: string; isHidden: boolean };
      expect(c1).toMatchObject({ body: 'Bài hay\n\nquá', isHidden: false, authorName: 'Alice' });
      const c2 = (await post(bob.token, id, { body: '<script>x</script> **b**' }).expect(201)).body as { id: string };
      await post(bob.token, id, { body: 'Cảm ơn', parentId: c1.id }).expect(201);
      await post(alice.token, id, { body: 'Không có gì', parentId: c1.id }).expect(201);
      const v = await view(id);
      expect(v.comments.map((c) => c.id)).toEqual([c2.id, c1.id]);
      expect(v.comments[0]!.body).toBe('<script>x</script> **b**');
      expect(v.comments[1]!.replies.map((r) => r.body)).toEqual(['Cảm ơn', 'Không có gì']);
      expect(JSON.stringify(v)).not.toContain('@example.com');
      expect(JSON.stringify(v)).not.toContain('customerId');
    });

    it('kiểm tra nội dung: rỗng, dài, quá 2 link, trùng nguyên văn -> lỗi; trả lời sai gốc -> 404', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      const [l1, l2] = a.lessons.map((l) => l.id) as [string, string];
      for (const body of ['', '   ', 'x'.repeat(1001), 'https://a.com https://b.com https://c.com']) await post(alice.token, l1, { body }).expect(400);
      await post(alice.token, l1, { body: 'a', hidden: true }).expect(400);
      const root = (await post(alice.token, l1, { body: 'gốc' }).expect(201)).body as { id: string };
      await post(alice.token, l1, { body: 'gốc' }).expect(409);
      await post(bob.token, l1, { body: 'gốc' }).expect(201); // người khác được viết giống
      const reply = (await post(bob.token, l1, { body: 'tl', parentId: root.id }).expect(201)).body as { id: string };
      await post(alice.token, l1, { body: 'tl2', parentId: reply.id }).expect(404); // trả lời của trả lời
      await post(alice.token, l2, { body: 'tl3', parentId: root.id }).expect(404); // gốc ở bài khác
      await post(alice.token, l1, { body: 'tl4', parentId: '01920000-0000-7000-8000-000000000999' }).expect(404);
      await post(alice.token, l1, { body: 'tl5', parentId: 'khong-phai-uuid' }).expect(400);
    });

    it('sửa/xoá chỉ của mình: người khác 404; sửa đặt cờ edited; trùng nguyên văn 409; xoá gốc xoá cả trả lời; xoá idempotent', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const root = (await post(alice.token, id, { body: 'gốc' }).expect(201)).body as { id: string };
      const other = (await post(alice.token, id, { body: 'khác' }).expect(201)).body as { id: string };
      await post(bob.token, id, { body: 'tl', parentId: root.id }).expect(201);
      await edit(bob.token, root.id, { body: 'hack' }).expect(404);
      await del(bob.token, root.id).expect(204);
      expect(await prisma.courseComment.count()).toBe(3);
      expect((await edit(alice.token, root.id, { body: 'gốc đã sửa' }).expect(200)).body).toMatchObject({ body: 'gốc đã sửa', edited: true });
      await edit(alice.token, root.id, { body: 'khác' }).expect(409);
      await edit(alice.token, root.id, { body: '' }).expect(400);
      await del(alice.token, root.id).expect(204);
      await del(alice.token, root.id).expect(204);
      expect(await prisma.courseComment.count()).toBe(1);
      expect((await view(id)).comments.map((c) => c.id)).toEqual([other.id]);
    });

    it('kiểm duyệt: ẩn gốc ẩn cả nhánh trả lời với người khác; người viết vẫn thấy kèm cờ ẩn; sửa không bỏ cờ; hiện lại', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const root = (await post(alice.token, id, { body: 'gốc' }).expect(201)).body as { id: string };
      const reply = (await post(bob.token, id, { body: 'tl', parentId: root.id }).expect(201)).body as { id: string };
      expect((await hide(root.id, true).expect(200)).body).toEqual({ id: root.id, isHidden: true });
      expect((await view(id)).comments).toEqual([]);
      const aliceMine = myCommunitySchema.parse((await mine(alice.token, id).expect(200)).body).comments;
      expect(aliceMine).toMatchObject([{ id: root.id, isHidden: true }]);
      expect(myCommunitySchema.parse((await mine(bob.token, id).expect(200)).body).comments).toMatchObject([{ id: reply.id, isHidden: true }]); // gốc ẩn kéo theo trả lời
      expect((await edit(alice.token, root.id, { body: 'sửa khi bị ẩn' }).expect(200)).body).toMatchObject({ isHidden: true });
      await post(bob.token, id, { body: 'tl mới', parentId: root.id }).expect(404); // không trả lời vào bình luận đang ẩn
      await hide(root.id, false).expect(200);
      expect((await view(id)).comments[0]!.replies).toHaveLength(1);
      await hide(reply.id, true).expect(200);
      expect((await view(id)).comments[0]!.replies).toHaveLength(0);
    });

    it('bài ẩn: công khai/ghi 404 (không lộ), gỡ đánh giá/xoá bình luận của mình vẫn được; admin vẫn thấy; bài hiện lại thì dữ liệu còn', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      await rate(alice.token, id, { stars: 5 }).expect(200);
      const c = (await post(alice.token, id, { body: 'hi' }).expect(201)).body as { id: string };
      await setPub('lessons', id, false);
      await pub(id).expect(404);
      await mine(alice.token, id).expect(404);
      await rate(alice.token, id, { stars: 1 }).expect(404);
      await post(alice.token, id, { body: 'mới' }).expect(404);
      await edit(alice.token, c.id, { body: 'sửa' }).expect(404);
      const adminView = adminCommentPageSchema.parse((await sup(api().get(`/admin/courses/comments?lessonId=${id}`)).expect(200)).body);
      expect(adminView.items.map((i) => i.id)).toEqual([c.id]);
      await setPub('lessons', id, true);
      expect(await view(id)).toMatchObject({ rating: { average: 5, count: 1 } });
      await setPub('lessons', id, false);
      await del(alice.token, c.id).expect(204);
      await as(alice.token, api().delete(`${base(id)}/rating`).set('CF-Connecting-IP', ip())).expect(200);
      expect(await prisma.courseComment.count()).toBe(0);
      expect(await prisma.courseRating.count()).toBe(0);
    });

    it('bài nháp/cha ẩn/id lạ/không phải uuid -> 404 ở mọi đường ghi và đọc; không ghi gì', async () => {
      const a = await build({ publish: false });
      for (const id of [a.lessons[0]!.id, MISSING]) {
        await pub(id).expect(404);
        await rate(alice.token, id, { stars: 3 }).expect(404);
        await post(alice.token, id, { body: 'x' }).expect(404);
      }
      await api().get('/courses/lessons/khong-phai-uuid/community').set('CF-Connecting-IP', ip()).expect(404);
      expect(await prisma.courseComment.count()).toBe(0);
    });

    it('phân trang công khai bằng cursor (20/trang), không trùng không sót; cursor hỏng 400', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const bulk = Array.from({ length: 25 }, (_, i) => ({ lessonId: id, customerId: alice.id, body: `c${String(i).padStart(2, '0')}`, createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)), updatedAt: new Date() }));
      await prisma.courseComment.createMany({ data: bulk });
      const first = await view(id);
      expect(first.comments).toHaveLength(20);
      expect(first.comments[0]!.body).toBe('c24');
      expect(first.nextCursor).toBeTruthy();
      const second = await view(id, `?cursor=${encodeURIComponent(first.nextCursor!)}`);
      expect(second.comments.map((c) => c.body)).toEqual(['c04', 'c03', 'c02', 'c01', 'c00']);
      expect(second.nextCursor).toBeNull();
      await pub(id, '?cursor=@@@').expect(400);
    });

    it('cô lập và cascade: xoá bài / khách xoá đánh giá + bình luận theo', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      const [l1, l2] = a.lessons.map((l) => l.id) as [string, string];
      await rate(alice.token, l1, { stars: 5 }).expect(200);
      await post(alice.token, l1, { body: 'a' }).expect(201);
      await rate(bob.token, l2, { stars: 3 }).expect(200);
      await post(bob.token, l2, { body: 'b' }).expect(201);
      expect(myCommunitySchema.parse((await mine(bob.token, l1).expect(200)).body)).toEqual({ myRating: null, comments: [] });
      await prisma.courseLesson.delete({ where: { id: l1 } });
      expect([await prisma.courseRating.count(), await prisma.courseComment.count()]).toEqual([1, 1]);
      await prisma.customer.delete({ where: { id: bob.id } });
      expect([await prisma.courseRating.count(), await prisma.courseComment.count()]).toEqual([0, 0]);
    });

    it('admin: liệt kê mới nhất trước kèm khách/bài, lọc theo bài và theo ẩn, phân trang; EDITOR chỉ xem; ẩn/xoá chỉ SUPER_ADMIN', async () => {
      const a = await build({ lessons: [{ title: 'A1', content: 'x' }, { title: 'A2', content: 'x' }] });
      const [l1, l2] = a.lessons.map((l) => l.id) as [string, string];
      const c1 = (await post(alice.token, l1, { body: 'một' }).expect(201)).body as { id: string };
      const c2 = (await post(bob.token, l2, { body: 'hai' }).expect(201)).body as { id: string };
      const list = async (query = '', token: string | null = superToken) => adminCommentPageSchema.parse((await as(token, api().get(`/admin/courses/comments${query}`)).expect(200)).body);
      const all = await list();
      expect(all.items.map((i) => i.id)).toEqual([c2, c1].map((c) => c.id));
      expect(all.items[0]).toMatchObject({ lessonTitle: 'A2', customer: { name: 'Bob', email: 'bob@example.com' }, isHidden: false });
      expect((await list(`?lessonId=${l1}`)).items.map((i) => i.id)).toEqual([c1.id]);
      await hide(c1.id, true).expect(200);
      expect((await list('?hidden=true')).items.map((i) => i.id)).toEqual([c1.id]);
      expect((await list('?hidden=false')).items.map((i) => i.id)).toEqual([c2.id]);
      const page = await list('?limit=1');
      expect(page.items).toHaveLength(1);
      expect((await list(`?limit=1&cursor=${encodeURIComponent(page.nextCursor!)}`)).items.map((i) => i.id)).toEqual([c1.id]);
      expect((await list('', editorToken)).items).toHaveLength(2);
      await as(null, api().get('/admin/courses/comments')).expect(401);
      await as(alice.token, api().get('/admin/courses/comments')).expect(401);
      await api().get('/admin/courses/comments?hidden=maybe').set('Authorization', `Bearer ${superToken}`).expect(400);
      await api().get(`/admin/courses/comments?lessonId=${MISSING}`).set('Authorization', `Bearer ${superToken}`).expect(404);
      await hide(c1.id, false, editorToken).expect(403);
      await hide(c1.id, 'x' as never).expect(400);
      await hide(MISSING, true).expect(404);
      await as(editorToken, api().delete(`/admin/courses/comments/${c1.id}`)).expect(403);
      await sup(api().delete(`/admin/courses/comments/${c1.id}`)).expect(204);
      await sup(api().delete(`/admin/courses/comments/${c1.id}`)).expect(404);
    });

    it('ghi quá 10 lần/phút từ một địa chỉ -> 429 (bình luận, đánh giá)', async () => {
      const a = await build();
      const id = a.lessons[0]!.id;
      const address = ip();
      for (let i = 0; i < 10; i += 1) await post(alice.token, id, { body: `c${i}` }, address).expect(201);
      await post(alice.token, id, { body: 'c-extra' }, address).expect(429);
      const other = ip();
      for (let i = 0; i < 10; i += 1) await rate(alice.token, id, { stars: (i % 5) + 1 }, other).expect(200);
      await rate(alice.token, id, { stars: 3 }, other).expect(429);
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
