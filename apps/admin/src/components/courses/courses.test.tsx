import { MIDI_WRONG_TYPE_MESSAGE } from '@piano-daily/shared';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CourseTreeEditor } from '@/components/courses/course-tree-editor';
import { CommunityModeration } from '@/components/courses/community-moderation';
import { LessonSubmissionsPage } from '@/components/courses/lesson-submissions';
import CoursesPage from '@/app/(admin)/courses/page';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';

const uploadMultipart = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api/upload', () => ({ uploadMultipart }));

const NOW = '2026-10-15T00:00:00.000Z';
const TRACK_ID = '0192a000-0000-7000-8000-0000000000a1';
const LEVEL_ID = '0192a000-0000-7000-8000-0000000000b1';
const SECTION_ID = '0192a000-0000-7000-8000-0000000000c1';
const LESSON_ID = '0192a000-0000-7000-8000-0000000000d1';

const track = (over: Record<string, unknown> = {}) => ({
  id: TRACK_ID, slug: 'phuong-phap', title: 'Phương pháp', titleEn: null, description: '', descriptionEn: null, isPublished: true, sortOrder: 0,
  lessonCount: 2, publishedLessonCount: 1, createdAt: NOW, updatedAt: NOW, ...over,
});
const lesson = (over: Record<string, unknown> = {}) => ({
  id: LESSON_ID, sectionId: SECTION_ID, title: 'Gam Đô', titleEn: null, youtubeUrl: null, content: '', contentEn: null, durationMinutes: null, midi: null,
  isPublished: false, sortOrder: 0, createdAt: NOW, updatedAt: NOW, ...over,
});
const tree = (lessons: unknown[] = [lesson()]) => ({
  track: track(),
  levels: [{
    id: LEVEL_ID, trackId: TRACK_ID, preset: null, title: 'Cấp 1', titleEn: null, description: '', descriptionEn: null, isPublished: true, sortOrder: 0,
    sections: [{ id: SECTION_ID, levelId: LEVEL_ID, title: 'Làm quen phím', titleEn: null, description: '', descriptionEn: null, isPublished: true, sortOrder: 0, lessons }],
  }],
});

type Handler = (url: URL, init: RequestInit) => Response | undefined;
async function signIn(role: 'SUPER_ADMIN' | 'EDITOR', handler: Handler) {
  stubFetch(() => jsonResponse(200, { ...sessionBody(), user: { ...USER, role } }));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw, init) => handler(new URL(raw), init) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}
const calls = (fetchMock: Awaited<ReturnType<typeof signIn>>, method: string, path: string) =>
  fetchMock.mock.calls.filter(([input, init]) => new URL(String(input)).pathname === path && init?.method === method);
const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body));
const wrap = (ui: React.ReactElement) => render(<AuthProvider>{ui}</AuthProvider>);
const renderTrackPage = () => wrap(<CourseTreeEditor trackId={TRACK_ID} />);

beforeEach(() => {
  resetSessionForTests();
  uploadMultipart.mockReset();
});

describe('Trang /courses (danh sách nhánh)', () => {
  const listHandler = (tracks: unknown[]): Handler => (url, init) =>
    url.pathname === '/admin/courses/tracks' && (init.method ?? 'GET') === 'GET' ? jsonResponse(200, tracks) : undefined;

  it('liệt kê nhánh với số bài công khai/tất cả và liên kết sang trình soạn', async () => {
    await signIn('SUPER_ADMIN', listHandler([track(), track({ id: 'x2', slug: 'ky-thuat', title: 'Kỹ thuật', isPublished: false, lessonCount: 0, publishedLessonCount: 0 })]));
    wrap(<CoursesPage />);
    const table = await screen.findByRole('table', { name: 'Danh sách nhánh khoá học' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Phương pháp');
    expect(rows[1]).toHaveTextContent('1/2');
    expect(within(rows[1]!).getByRole('link', { name: 'Phương pháp' })).toHaveAttribute('href', `/courses/${TRACK_ID}`);
    expect(rows[2]).toHaveTextContent('Nháp');
  });

  it('tạo nhánh: POST đúng body; bật công khai và đổi thứ tự gọi đúng API', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'POST' && url.pathname === '/admin/courses/tracks') return jsonResponse(201, track());
      if (init.method === 'PATCH') return jsonResponse(200, track());
      if (init.method === 'POST' && url.pathname.endsWith('/move')) return new Response(null, { status: 204 });
      return listHandler([track(), track({ id: 'x2', slug: 'b', title: 'B' })])(url, init);
    });
    wrap(<CoursesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo nhánh' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên nhánh'), '  Tác phẩm ');
    await user.click(within(dialog).getByLabelText(/Công khai/));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', '/admin/courses/tracks')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'POST', '/admin/courses/tracks')[0]!)).toEqual({ title: 'Tác phẩm', titleEn: null, description: '', descriptionEn: null, isPublished: true });

    await user.click(await screen.findByLabelText('Công khai Phương pháp'));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', `/admin/courses/tracks/${TRACK_ID}/published`)).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH', `/admin/courses/tracks/${TRACK_ID}/published`)[0]!)).toEqual({ isPublished: false });

    await user.click(screen.getByRole('button', { name: 'Đưa Phương pháp xuống' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', `/admin/courses/tracks/${TRACK_ID}/move`)).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'POST', `/admin/courses/tracks/${TRACK_ID}/move`)[0]!)).toEqual({ direction: 'down' });
    expect(screen.getByRole('button', { name: 'Đưa Phương pháp lên' })).toBeDisabled();
  });

  it('thiếu tên: lỗi tại trường, không gọi API; xoá nhánh còn level hiện thông báo 409 từ API', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'DELETE' ? jsonResponse(409, errorBody('RESOURCE_IN_USE', 'Nhánh còn level. Hãy xoá hết level trước.')) : listHandler([track()])(url, init),
    );
    wrap(<CoursesPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo nhánh' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByText('Vui lòng nhập tên nhánh.')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/admin/courses/tracks')).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Huỷ' }));

    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    expect(await screen.findByText('Nhánh còn level. Hãy xoá hết level trước.')).toBeInTheDocument();
  });

  it('EDITOR chỉ xem: không có nút tạo/xoá/đổi thứ tự, checkbox bị khoá', async () => {
    await signIn('EDITOR', listHandler([track()]));
    wrap(<CoursesPage />);
    expect(await screen.findByRole('button', { name: 'Xem Phương pháp' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo nhánh' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Đưa Phương pháp/ })).toBeNull();
    expect(screen.getByLabelText('Công khai Phương pháp')).toBeDisabled();
  });
});

describe('Trình soạn cây một nhánh', () => {
  const treeHandler = (t: unknown): Handler => (url, init) =>
    url.pathname === `/admin/courses/tracks/${TRACK_ID}/tree` && (init.method ?? 'GET') === 'GET' ? jsonResponse(200, t) : undefined;

  it('hiển thị level → section → bài, kèm tóm tắt phần có (video/nhạc/nội dung) và trạng thái', async () => {
    await signIn('SUPER_ADMIN', treeHandler(tree([
      lesson({ title: 'Có đủ', youtubeUrl: 'https://youtu.be/dQw4w9WgXcQ', content: 'x', midi: { noteJsonUrl: 'u', durationSeconds: 12, noteCount: 5, originalName: 'g.mid' }, isPublished: true }),
      lesson({ id: 'l2', title: 'Nháp trống' }),
    ])));
    renderTrackPage();
    const level = await screen.findByRole('region', { name: 'Level Cấp 1' });
    expect(within(level).getByText('Làm quen phím')).toBeInTheDocument();
    const full = within(level).getByText('Có đủ').closest('div')!;
    expect(full).toHaveTextContent('Video · Nhạc · Nội dung');
    expect(within(level).getByText('Nháp trống').closest('div')).toHaveTextContent('Trống');
    expect(screen.getByText(/1\/2 bài công khai/)).toBeInTheDocument();
  });

  it('thêm level: POST kèm trackId; thêm section kèm levelId', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'POST' ? jsonResponse(201, { id: 'new', trackId: TRACK_ID, title: 'x', description: '', isPublished: false, sortOrder: 1, sections: [], levelId: LEVEL_ID, lessons: [] }) : treeHandler(tree())(url, init),
    );
    renderTrackPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Thêm level' }));
    let dialog = await screen.findByRole('dialog');
    // Mặc định chọn sẵn mức "Sơ cấp": không có ô tên; chọn "Khác" thì mới nhập tên (và tên English).
    expect(within(dialog).queryByLabelText('Tên level')).toBeNull();
    expect(within(dialog).getByLabelText('Mức')).toHaveValue('BEGINNER');
    await user.selectOptions(within(dialog).getByLabelText('Mức'), 'INTERMEDIATE');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', '/admin/courses/levels')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'POST', '/admin/courses/levels')[0]!)).toMatchObject({ trackId: TRACK_ID, preset: 'INTERMEDIATE', isPublished: false });

    await user.click(screen.getByRole('button', { name: 'Thêm level' }));
    dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Mức'), '');
    await user.type(within(dialog).getByLabelText('Tên level'), 'Cấp 2');
    await user.type(within(dialog).getByLabelText('Tên level (English, tuỳ chọn)'), 'Stage 2');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', '/admin/courses/levels')).toHaveLength(2));
    expect(bodyOf(calls(fetchMock, 'POST', '/admin/courses/levels')[1]!)).toMatchObject({ trackId: TRACK_ID, preset: null, title: 'Cấp 2', titleEn: 'Stage 2' });

    await user.click(await screen.findByRole('button', { name: /Thêm section vào “Cấp 1”/ }));
    dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên section'), 'Gam');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', '/admin/courses/sections')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'POST', '/admin/courses/sections')[0]!)).toMatchObject({ levelId: LEVEL_ID, title: 'Gam' });
  });

  it('thêm bài: link YouTube sai bị chặn ở client; hợp lệ thì POST đủ trường (video tuỳ chọn, nhạc/nội dung tuỳ chọn)', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'POST' ? jsonResponse(201, lesson()) : treeHandler(tree())(url, init),
    );
    renderTrackPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /Thêm bài vào “Làm quen phím”/ }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên bài'), 'Bài mới');
    await user.type(within(dialog).getByLabelText('Link YouTube (tuỳ chọn)'), 'https://vimeo.com/1');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bài' }));
    expect(await within(dialog).findByText('Link phải là link YouTube hợp lệ.')).toBeInTheDocument();
    expect(calls(fetchMock, 'POST', '/admin/courses/lessons')).toHaveLength(0);
    // Chưa lưu bài thì chưa upload được nhạc.
    expect(within(dialog).getByText(/Hãy lưu bài trước/)).toBeInTheDocument();

    const youtube = within(dialog).getByLabelText('Link YouTube (tuỳ chọn)');
    await user.clear(youtube);
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bài' }));
    await waitFor(() => expect(calls(fetchMock, 'POST', '/admin/courses/lessons')).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'POST', '/admin/courses/lessons')[0]!)).toEqual({
      title: 'Bài mới', titleEn: null, contentEn: null, youtubeUrl: null, content: '', durationMinutes: null, isPublished: false, sectionId: SECTION_ID,
    });
  });

  it('trường tiếng Anh: dấu EN ở cây; sửa bài gửi titleEn/contentEn, để trống thì gửi null', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'PATCH' ? jsonResponse(200, lesson()) : treeHandler(tree([lesson({ titleEn: 'C major scale', contentEn: 'EN body' })]))(url, init),
    );
    renderTrackPage();
    const user = userEvent.setup();
    expect(await screen.findByTitle('Đã có bản tiếng Anh')).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Sửa Gam Đô' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Tên bài (English, tuỳ chọn)')).toHaveValue('C major scale');
    await user.clear(within(dialog).getByLabelText('Tên bài (English, tuỳ chọn)'));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bài' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', `/admin/courses/lessons/${LESSON_ID}`)).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH', `/admin/courses/lessons/${LESSON_ID}`)[0]!)).toMatchObject({ titleEn: null, contentEn: 'EN body' });
  });

  it('mỗi bài có liên kết "Soạn nhạc" tới trang trình gõ nốt (cả EDITOR thấy để xem)', async () => {
    await signIn('EDITOR', (url, init) => treeHandler(tree())(url, init));
    renderTrackPage();
    const link = await screen.findByRole('link', { name: 'Soạn nhạc Gam Đô' });
    expect(link).toHaveAttribute('href', `/courses/${TRACK_ID}/lessons/${LESSON_ID}/music`);
  });

  it('mỗi bài có liên kết "Bài nộp" tới danh sách bài nộp', async () => {
    await signIn('EDITOR', (url, init) => treeHandler(tree())(url, init));
    renderTrackPage();
    const link = await screen.findByRole('link', { name: 'Bài nộp Gam Đô' });
    expect(link).toHaveAttribute('href', `/courses/${TRACK_ID}/lessons/${LESSON_ID}/submissions`);
  });

  it('mỗi bài có liên kết "Bình luận" lọc theo bài', async () => {
    await signIn('EDITOR', (url, init) => treeHandler(tree())(url, init));
    renderTrackPage();
    const link = await screen.findByRole('link', { name: 'Bình luận Gam Đô' });
    expect(link).toHaveAttribute('href', `/courses/comments?lessonId=${LESSON_ID}`);
  });

  it('bật công khai bài trống: hiện lỗi từ API ở nội dung; thời lượng sai bị chặn ở client', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'PATCH' ? jsonResponse(400, { error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ path: 'content', message: 'Bài công khai cần ít nhất một trong video, nhạc (MIDI) hoặc nội dung.' }] } }) : treeHandler(tree())(url, init),
    );
    renderTrackPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sửa Gam Đô' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Thời lượng ước tính (phút, tuỳ chọn)'), '0');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bài' }));
    expect(await within(dialog).findByText(/Thời lượng phải là số phút từ 1 đến 600/)).toBeInTheDocument();
    expect(calls(fetchMock, 'PATCH', `/admin/courses/lessons/${LESSON_ID}`)).toHaveLength(0);
    await user.clear(within(dialog).getByLabelText('Thời lượng ước tính (phút, tuỳ chọn)'));
    await user.click(within(dialog).getByLabelText(/Công khai \(cần ít nhất/));
    await user.click(within(dialog).getByRole('button', { name: 'Lưu bài' }));
    expect(await within(dialog).findByText(/Bài công khai cần ít nhất một/)).toBeInTheDocument();
  });

  it('upload MIDI cho bài đã lưu: sai loại/quá lớn bị chặn ngay; hợp lệ thì gọi upload, hiện tên/thời lượng/số nốt; có thể gỡ', async () => {
    const withMidi = lesson({ midi: { noteJsonUrl: 'u', durationSeconds: 75, noteCount: 42, originalName: 'gam.mid' } });
    uploadMultipart.mockResolvedValue(withMidi);
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'DELETE' && url.pathname.endsWith('/midi') ? jsonResponse(200, lesson()) : treeHandler(tree())(url, init),
    );
    renderTrackPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Sửa Gam Đô' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Chọn file MIDI');
    fireEvent.change(input, { target: { files: [new File(['x'], 'a.txt', { type: 'text/plain' })] } });
    expect(await within(dialog).findByText(MIDI_WRONG_TYPE_MESSAGE)).toBeInTheDocument();
    expect(uploadMultipart).not.toHaveBeenCalled();

    fireEvent.change(within(dialog).getByLabelText('Chọn file MIDI'), { target: { files: [new File(['MThd'], 'gam.mid', { type: 'audio/midi' })] } });
    await waitFor(() => expect(uploadMultipart).toHaveBeenCalledTimes(1));
    expect(uploadMultipart.mock.calls[0]![0]).toBe(`/admin/courses/lessons/${LESSON_ID}/midi`);
    const info = await within(dialog).findByTestId('lesson-midi');
    expect(info).toHaveTextContent('gam.mid');
    expect(info).toHaveTextContent('1:15 · 42 nốt');

    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }));
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(calls(fetchMock, 'DELETE', `/admin/courses/lessons/${LESSON_ID}/midi`)).toHaveLength(1));
    await waitFor(() => expect(within(dialog).queryByTestId('lesson-midi')).toBeNull());
  });

  it('EDITOR chỉ xem: không có nút thêm/sửa/xoá/đổi thứ tự, form bài bị khoá và không upload được', async () => {
    await signIn('EDITOR', treeHandler(tree()));
    renderTrackPage();
    const user = userEvent.setup();
    expect(await screen.findByRole('button', { name: 'Thêm level' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Đưa Gam Đô/ })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Xem Gam Đô' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByLabelText('Tên bài')).toBeDisabled();
    expect(within(dialog).queryByRole('button', { name: 'Lưu bài' })).toBeNull();
    expect(within(dialog).queryByLabelText('Chọn file MIDI')).toBeNull();
  });
});

describe('Bài nộp của khách (C3)', () => {
  const SUB_ID = '0192a000-0000-7000-8000-0000000000e1';
  const sub = (over: Record<string, unknown> = {}) => ({
    id: SUB_ID, kind: 'YOUTUBE', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', note: 'Em tập lần 1', isHidden: false, createdAt: NOW, updatedAt: NOW,
    customer: { id: 'c1', name: 'Lan', email: 'lan@example.com' }, ...over,
  });
  const listPath = `/admin/courses/lessons/${LESSON_ID}/submissions`;
  const handler = (rows: unknown[]): Handler => (url, init) => {
    if (url.pathname === listPath) return jsonResponse(200, rows);
    if (url.pathname === `/admin/courses/tracks/${TRACK_ID}/tree`) return jsonResponse(200, tree());
    if (url.pathname === `/admin/courses/submissions/${SUB_ID}` && init.method === 'PATCH') return jsonResponse(200, sub());
    if (url.pathname === `/admin/courses/submissions/${SUB_ID}` && init.method === 'DELETE') return new Response(null, { status: 204 });
    return undefined;
  };
  const renderPage = () => wrap(<LessonSubmissionsPage trackId={TRACK_ID} lessonId={LESSON_ID} />);

  it('liệt kê khách, loại link (mở tab mới an toàn) và ghi chú; rỗng thì báo chưa có', async () => {
    await signIn('SUPER_ADMIN', handler([sub(), sub({ id: 'x2', kind: 'DRIVE', url: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view', note: null, customer: { id: 'c2', name: 'Minh', email: 'minh@example.com' } })]));
    renderPage();
    expect(await screen.findByText('Lan (lan@example.com)')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Bài nộp: Gam Đô' })).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByText('Em tập lần 1')).toBeInTheDocument();
    expect(screen.getByText('Drive')).toBeInTheDocument();
  });

  it('chưa có bài nộp: hiện thông báo trống', async () => {
    await signIn('SUPER_ADMIN', handler([]));
    renderPage();
    expect(await screen.findByText('Chưa có bài nộp nào.')).toBeInTheDocument();
  });

  it('SUPER_ADMIN ẩn bài nộp (PATCH hidden:true) rồi tải lại; xoá có xác nhận gọi DELETE', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', handler([sub()]));
    renderPage();
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ẩn bài nộp của Lan (lan@example.com)' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', `/admin/courses/submissions/${SUB_ID}`)).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH', `/admin/courses/submissions/${SUB_ID}`)[0]!)).toEqual({ hidden: true });

    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(calls(fetchMock, 'DELETE', `/admin/courses/submissions/${SUB_ID}`)).toHaveLength(1));
  });

  it('bài nộp đã ẩn có nhãn và nút Hiện gửi hidden:false', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', handler([sub({ isHidden: true })]));
    renderPage();
    expect(await screen.findByText('Đã ẩn')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Hiện bài nộp của Lan (lan@example.com)' }));
    await waitFor(() => expect(bodyOf(calls(fetchMock, 'PATCH', `/admin/courses/submissions/${SUB_ID}`)[0]!)).toEqual({ hidden: false }));
  });

  it('EDITOR chỉ xem: nút ẩn bị khoá, không có nút xoá', async () => {
    await signIn('EDITOR', handler([sub()]));
    renderPage();
    expect(await screen.findByRole('button', { name: 'Ẩn bài nộp của Lan (lan@example.com)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
  });

  it('lỗi 403 khi ẩn hiện thông báo lỗi', async () => {
    await signIn('SUPER_ADMIN', (url, init) =>
      init.method === 'PATCH' ? jsonResponse(403, errorBody('FORBIDDEN', 'Không đủ quyền.')) : handler([sub()])(url, init),
    );
    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ẩn bài nộp của Lan (lan@example.com)' }));
    expect(await screen.findByText(/quyền/i)).toBeInTheDocument();
  });

  it('PATCH trả 404 (bài nộp đã bị xoá nơi khác): hiện lỗi và tải lại danh sách', async () => {
    let listed = 0;
    await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'PATCH') return jsonResponse(404, errorBody('NOT_FOUND'));
      if (url.pathname === listPath) {
        listed += 1;
        return jsonResponse(200, listed === 1 ? [sub()] : []);
      }
      return handler([])(url, init);
    });
    renderPage();
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ẩn bài nộp của Lan (lan@example.com)' }));
    expect(await screen.findByText('Chưa có bài nộp nào.')).toBeInTheDocument();
    expect(listed).toBeGreaterThanOrEqual(2);
  });
});

describe('Kiểm duyệt bình luận (C4)', () => {
  const CID = '0192a000-0000-7000-8000-0000000000f1';
  const cm = (over: Record<string, unknown> = {}) => ({
    id: CID, lessonId: LESSON_ID, lessonTitle: 'Gam Đô', parentId: null, body: 'Bài hay\n<b>x</b>', isHidden: false, parentHidden: false, edited: false, createdAt: NOW,
    customer: { id: 'c1', name: 'Lan', email: 'lan@example.com' }, ...over,
  });
  const commentsPath = '/admin/courses/comments';
  const handler = (rows: unknown[], nextCursor: string | null = null): Handler => (url, init) => {
    if (url.pathname === commentsPath && (init.method ?? 'GET') === 'GET') return jsonResponse(200, { items: rows, nextCursor });
    if (url.pathname === `${commentsPath}/${CID}` && init.method === 'PATCH') return jsonResponse(200, { id: CID, isHidden: true });
    if (url.pathname === `${commentsPath}/${CID}` && init.method === 'DELETE') return new Response(null, { status: 204 });
    return undefined;
  };
  const queries = (fetchMock: Awaited<ReturnType<typeof signIn>>) =>
    fetchMock.mock.calls.map(([input]) => new URL(String(input))).filter((u) => u.pathname === commentsPath).map((u) => u.search);

  it('liệt kê bình luận dạng văn bản thuần kèm khách, bài và nhãn; rỗng thì báo trống', async () => {
    await signIn('SUPER_ADMIN', handler([cm(), cm({ id: 'x2', parentId: CID, isHidden: true, edited: true })]));
    wrap(<CommunityModeration lessonId={null} />);
    expect((await screen.findAllByText('Lan (lan@example.com)')).length).toBe(2);
    expect(screen.getAllByText(/<b>x<\/b>/).length).toBe(2); // không render HTML
    expect(document.querySelector('p b')).toBeNull();
    expect(screen.getByText('Trả lời')).toBeInTheDocument();
    expect(screen.getAllByText('Đã ẩn')).toHaveLength(2); // nút lọc + nhãn của dòng bị ẩn
    expect(screen.getAllByRole('link', { name: 'Bài: Gam Đô' })[0]).toHaveAttribute('href', `/courses/comments?lessonId=${LESSON_ID}`);
  });

  it('không có bình luận: thông báo trống', async () => {
    await signIn('SUPER_ADMIN', handler([]));
    wrap(<CommunityModeration lessonId={null} />);
    expect(await screen.findByText('Không có bình luận nào.')).toBeInTheDocument();
  });

  it('lọc theo bài và theo trạng thái gửi đúng query', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', handler([cm()]));
    wrap(<CommunityModeration lessonId={LESSON_ID} />);
    await screen.findByText('Lan (lan@example.com)');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Đã ẩn' }));
    await waitFor(() => expect(queries(fetchMock)).toContain(`?lessonId=${LESSON_ID}&hidden=true`));
    expect(queries(fetchMock)[0]).toBe(`?lessonId=${LESSON_ID}`);
  });

  it('SUPER_ADMIN ẩn (PATCH hidden:true) và xoá có xác nhận (DELETE)', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', handler([cm()]));
    wrap(<CommunityModeration lessonId={null} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Ẩn bình luận của Lan (lan@example.com)' }));
    await waitFor(() => expect(calls(fetchMock, 'PATCH', `${commentsPath}/${CID}`)).toHaveLength(1));
    expect(bodyOf(calls(fetchMock, 'PATCH', `${commentsPath}/${CID}`)[0]!)).toEqual({ hidden: true });
    await user.click(await screen.findByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    await waitFor(() => expect(calls(fetchMock, 'DELETE', `${commentsPath}/${CID}`)).toHaveLength(1));
  });

  it('bình luận đã ẩn có nút Hiện gửi hidden:false', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', handler([cm({ isHidden: true })]));
    wrap(<CommunityModeration lessonId={null} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Hiện bình luận của Lan (lan@example.com)' }));
    await waitFor(() => expect(bodyOf(calls(fetchMock, 'PATCH', `${commentsPath}/${CID}`)[0]!)).toEqual({ hidden: false }));
  });

  it('EDITOR chỉ xem: nút ẩn bị khoá, không có nút xoá', async () => {
    await signIn('EDITOR', handler([cm()]));
    wrap(<CommunityModeration lessonId={null} />);
    expect(await screen.findByRole('button', { name: 'Ẩn bình luận của Lan (lan@example.com)' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Xoá' })).toBeNull();
  });

  it('Xem thêm nối trang kế bằng cursor', async () => {
    const fetchMock = await signIn('SUPER_ADMIN', (url, init) => {
      if (url.pathname === commentsPath && url.searchParams.get('cursor') === 'cur') return jsonResponse(200, { items: [cm({ id: 'p2', body: 'Trang hai' })], nextCursor: null });
      return handler([cm()], 'cur')(url, init);
    });
    wrap(<CommunityModeration lessonId={null} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Xem thêm' }));
    expect(await screen.findByText('Trang hai')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xem thêm' })).toBeNull();
    expect(queries(fetchMock)).toContain('?cursor=cur');
  });

  it('trả lời dưới bình luận gốc bị ẩn có nhãn riêng; xoá lỗi 404 cũng tải lại danh sách', async () => {
    let listed = 0;
    await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'DELETE') return jsonResponse(404, errorBody('NOT_FOUND'));
      if (url.pathname === commentsPath) {
        listed += 1;
        return jsonResponse(200, { items: listed === 1 ? [cm({ parentId: CID, parentHidden: true })] : [], nextCursor: null });
      }
      return undefined;
    });
    wrap(<CommunityModeration lessonId={null} />);
    const user = userEvent.setup();
    expect(await screen.findByText('Ẩn theo bình luận gốc')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Xoá' }));
    await user.click(screen.getByRole('button', { name: 'Xác nhận xoá' }));
    expect(await screen.findByText('Không có bình luận nào.')).toBeInTheDocument();
    expect(listed).toBeGreaterThanOrEqual(2);
  });

  it('PATCH 404 (đã bị xoá nơi khác): hiện lỗi và tải lại danh sách', async () => {
    let listed = 0;
    await signIn('SUPER_ADMIN', (url, init) => {
      if (init.method === 'PATCH') return jsonResponse(404, errorBody('NOT_FOUND'));
      if (url.pathname === commentsPath) {
        listed += 1;
        return jsonResponse(200, { items: listed === 1 ? [cm()] : [], nextCursor: null });
      }
      return undefined;
    });
    wrap(<CommunityModeration lessonId={null} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Ẩn bình luận của Lan (lan@example.com)' }));
    expect(await screen.findByText('Không có bình luận nào.')).toBeInTheDocument();
    expect(listed).toBeGreaterThanOrEqual(2);
  });
});

