import type { Sheet } from '@piano-daily/shared';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SheetsPage from '@/app/(admin)/sheets/page';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { SheetCreatePage, SheetEditPage } from './sheet-editor';

const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/sheets' }));

const BEETHOVEN = { id: '01920000-0000-7000-8000-00000000000a', name: 'Beethoven', slug: 'beethoven', bio: null, avatar: null, seriesCount: 1 };
const CHOPIN = { ...BEETHOVEN, id: '01920000-0000-7000-8000-00000000000b', name: 'Chopin', slug: 'chopin' };
const BAGATELLES = { id: '01920000-0000-7000-8000-0000000000c1', name: 'Bagatelles', slug: 'bagatelles', composer: { id: BEETHOVEN.id, name: 'Beethoven' } };
const NOCTURNES = { id: '01920000-0000-7000-8000-0000000000c2', name: 'Nocturnes', slug: 'nocturnes', composer: { id: CHOPIN.id, name: 'Chopin' } };
const POP = { id: '01920000-0000-7000-8000-0000000000d1', name: 'Pop', slug: 'pop', icon: null };
const CLASSICAL = { id: '01920000-0000-7000-8000-0000000000d2', name: 'Cổ điển', slug: 'co-dien', icon: null };
const VIDEO_ID = 'dQw4w9WgXcQ';

const SHEET: Sheet = {
  id: '01920000-0000-7000-8000-0000000000e1',
  publicId: 7,
  slug: 'fur-elise',
  title: 'Für Elise',
  subtitle: null,
  composer: { id: BEETHOVEN.id, name: 'Beethoven' },
  series: { id: BAGATELLES.id, name: 'Bagatelles' },
  level: 'BEGINNER',
  difficultyScore: 30,
  difficultyNote: null,
  description: null,
  lyricsChords: '## Đoạn A',
  youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
  genres: [{ id: CLASSICAL.id, name: CLASSICAL.name }],
  hasSheet: false,
  hasChords: true,
  hasMidi: false,
  hasMp3: false,
  hasVideo: true,
  pageCount: 0,
  thumbnailUrl: null,
  pages: [],
  pdf: null,
  viewCount: 0,
  isHot: false,
  status: 'DRAFT',
  firstPublishedAt: null,
  createdAt: '2026-09-29T01:00:00.000Z',
  updatedAt: '2026-09-29T02:30:00.000Z',
};

const LIST_ITEM = {
  id: SHEET.id,
  publicId: 7,
  title: 'Für Elise',
  slug: 'fur-elise',
  level: 'BEGINNER',
  status: 'DRAFT',
  composer: SHEET.composer,
  isHot: false,
  updatedAt: SHEET.updatedAt,
};

function page<T>(items: T[], total = items.length) {
  return { items, page: 1, pageSize: 20, total };
}

type Handler = (url: URL, init: RequestInit) => Response | undefined;

/** Phản hồi mặc định cho các danh sách tham chiếu (Composer, Series theo composerId, Genre). */
const catalog: Handler = (url) => {
  if (url.pathname === '/admin/composers') return jsonResponse(200, page([BEETHOVEN, CHOPIN]));
  if (url.pathname === '/admin/genres') return jsonResponse(200, page([CLASSICAL, POP]));
  if (url.pathname === '/admin/series') {
    const composerId = url.searchParams.get('composerId');
    return jsonResponse(200, page([BAGATELLES, NOCTURNES].filter((s) => s.composer.id === composerId)));
  }
  return undefined;
};

async function signIn(handler: Handler) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch(
    (raw, init) => handler(new URL(raw), init) ?? catalog(new URL(raw), init) ?? jsonResponse(404, errorBody('NOT_FOUND')),
  );
}

function requests(fetchMock: Awaited<ReturnType<typeof signIn>>, method: string, pathname: string) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => url.pathname === pathname && (init.method ?? 'GET') === method);
}

async function choose(user: ReturnType<typeof userEvent.setup>, label: string, option: string) {
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole('option', { name: option }));
}

beforeEach(() => {
  resetSessionForTests();
  router.push.mockReset();
});

describe('Trang /sheets — bảng', () => {
  it('hiện Sheet với #publicId, Composer, Level, Status, thời gian vi-VN; click hàng mở trang sửa', async () => {
    await signIn((url) => (url.pathname === '/admin/sheets' ? jsonResponse(200, page([LIST_ITEM])) : undefined));
    render(<SheetsPage />);
    const table = screen.getByRole('table', { name: 'Danh sách Sheet' });
    const row = await within(table).findByRole('row', { name: 'Sửa Sheet Für Elise' });
    expect(row).toHaveTextContent('#7');
    expect(row).toHaveTextContent('Beethoven');
    expect(row).toHaveTextContent('Cơ bản');
    expect(row).toHaveTextContent('Draft');
    expect(row).toHaveTextContent(new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(SHEET.updatedAt)));
    expect(screen.getByRole('link', { name: 'Tạo Sheet' })).toHaveAttribute('href', '/sheets/new');

    await userEvent.setup().click(row);
    expect(router.push).toHaveBeenCalledWith(`/sheets/${SHEET.id}`);
  });

  it('tìm và lọc gửi đúng query (debounce, về trang 1)', async () => {
    const fetchMock = await signIn((url) => (url.pathname === '/admin/sheets' ? jsonResponse(200, page([LIST_ITEM])) : undefined));
    render(<SheetsPage />);
    await screen.findByRole('row', { name: 'Sửa Sheet Für Elise' });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Tìm Sheet theo tiêu đề'), 'elise');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/sheets')).toHaveLength(2));
    await choose(user, 'Cấp độ', 'Cơ bản');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/sheets')).toHaveLength(3));
    await choose(user, 'Trạng thái', 'Draft');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/sheets')).toHaveLength(4));
    await choose(user, 'Composer', 'Chopin');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/sheets')).toHaveLength(5));

    const last = requests(fetchMock, 'GET', '/admin/sheets').at(-1)!.url.searchParams;
    expect(Object.fromEntries(last)).toEqual({
      q: 'elise',
      level: 'BEGINNER',
      status: 'DRAFT',
      composerId: CHOPIN.id,
      page: '1',
      pageSize: '20',
    });

    await choose(user, 'Cấp độ', 'Tất cả cấp độ');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/sheets')).toHaveLength(6));
    expect(requests(fetchMock, 'GET', '/admin/sheets').at(-1)!.url.searchParams.has('level')).toBe(false);
  });
});

describe('Trang /sheets — phân trang', () => {
  it('"Trang sau" gọi page=2; gõ từ khoá -> quay về page=1', async () => {
    const fetchMock = await signIn((url) =>
      url.pathname === '/admin/sheets'
        ? jsonResponse(200, { ...page([LIST_ITEM], 45), page: Number(url.searchParams.get('page')) })
        : undefined,
    );
    render(<SheetsPage />);
    expect(await screen.findByText('Trang 1 / 3')).toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2 / 3')).toBeInTheDocument();
    expect(requests(fetchMock, 'GET', '/admin/sheets').at(-1)!.url.searchParams.get('page')).toBe('2');

    await user.type(screen.getByLabelText('Tìm Sheet theo tiêu đề'), 'elise');
    await waitFor(() =>
      expect(requests(fetchMock, 'GET', '/admin/sheets').at(-1)!.url.searchParams.get('q')).toBe('elise'),
    );
    expect(requests(fetchMock, 'GET', '/admin/sheets').at(-1)!.url.searchParams.get('page')).toBe('1');
    expect(await screen.findByText('Trang 1 / 3')).toBeInTheDocument();
  });

  it('trang vượt quá số trang (dữ liệu giảm) -> lùi về trang cuối', async () => {
    let shrunk = false;
    const fetchMock = await signIn((url) => {
      if (url.pathname !== '/admin/sheets') return undefined;
      const pageNo = Number(url.searchParams.get('page'));
      if (shrunk) return jsonResponse(200, { ...page(pageNo === 1 ? [LIST_ITEM] : [], 1), page: pageNo });
      return jsonResponse(200, { ...page([LIST_ITEM], 45), page: pageNo });
    });
    render(<SheetsPage />);
    await screen.findByText('Trang 1 / 3');
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await screen.findByText('Trang 2 / 3');
    shrunk = true;
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 1 / 1')).toBeInTheDocument();
    expect(requests(fetchMock, 'GET', '/admin/sheets').map((r) => r.url.searchParams.get('page'))).toEqual(['1', '2', '3', '1']);
  });
});

describe('Trang tạo Sheet', () => {
  it('bỏ trống -> lỗi dưới từng trường bắt buộc, không gọi API', async () => {
    const fetchMock = await signIn(() => undefined);
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Tạo Sheet' }));
    expect(await screen.findByText('Vui lòng nhập tiêu đề.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng chọn Composer.')).toBeInTheDocument();
    expect(screen.getByText('Vui lòng chọn cấp độ.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tiêu đề')).toHaveAttribute('aria-describedby', 'sheet-title-error');
    expect(requests(fetchMock, 'POST', '/admin/sheets')).toHaveLength(0);
  });

  it('YouTube: link hợp lệ hiện preview nocookie; link sai báo lỗi tại trường và ẩn preview', async () => {
    await signIn(() => undefined);
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    const input = screen.getByLabelText('Link YouTube (không bắt buộc)');

    await user.type(input, `https://youtu.be/${VIDEO_ID}`);
    const frame = await screen.findByTitle('Xem trước video YouTube');
    expect(frame).toHaveAttribute('src', `https://www.youtube-nocookie.com/embed/${VIDEO_ID}`);

    await user.clear(input);
    await user.type(input, 'https://vimeo.com/1');
    await user.tab();
    expect(screen.queryByTitle('Xem trước video YouTube')).not.toBeInTheDocument();
    const error = await screen.findByText(/Link YouTube không hợp lệ/);
    expect(error.closest('[role="alert"]')).toHaveAttribute('id', 'sheet-youtube-error');
  });

  it('Series lọc theo Composer; đổi Composer bỏ chọn Series; gửi đúng body rồi chuyển sang trang sửa', async () => {
    const fetchMock = await signIn((url, init) => {
      if (url.pathname === '/admin/sheets' && init.method === 'POST') return jsonResponse(201, SHEET);
      return undefined;
    });
    render(<SheetCreatePage />);
    const user = userEvent.setup();

    expect(screen.getByLabelText('Series (không bắt buộc)')).toBeDisabled();
    await user.type(screen.getByLabelText('Tiêu đề'), '  Für Elise ');
    await choose(user, 'Composer', 'Beethoven');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/series')).toHaveLength(1));
    expect(requests(fetchMock, 'GET', '/admin/series')[0]!.url.searchParams.get('composerId')).toBe(BEETHOVEN.id);
    await user.click(screen.getByLabelText('Series (không bắt buộc)'));
    expect(screen.queryByRole('option', { name: 'Nocturnes' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Bagatelles' }));
    expect(screen.getByLabelText('Series (không bắt buộc)')).toHaveTextContent('Bagatelles');

    // Đổi Composer -> Series cũ bị bỏ chọn.
    await choose(user, 'Composer', 'Chopin');
    await waitFor(() => expect(screen.getByLabelText('Series (không bắt buộc)')).toHaveTextContent('Không thuộc Series'));
    await choose(user, 'Composer', 'Beethoven');
    await choose(user, 'Series (không bắt buộc)', 'Bagatelles');

    await choose(user, 'Cấp độ', 'Cơ bản');
    await user.type(screen.getByLabelText('Độ khó 0–100 (không bắt buộc)'), '30');
    await user.click(await screen.findByRole('checkbox', { name: 'Cổ điển' }));
    await user.type(screen.getByLabelText('Lyrics & chords (markdown, không bắt buộc)'), '## Đoạn A');
    await user.type(screen.getByLabelText('Link YouTube (không bắt buộc)'), `youtu.be/${VIDEO_ID}`);
    await user.click(screen.getByRole('button', { name: 'Tạo Sheet' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/sheets/${SHEET.id}`));
    const [post] = requests(fetchMock, 'POST', '/admin/sheets');
    expect(JSON.parse(String(post!.init.body))).toEqual({
      title: 'Für Elise',
      subtitle: null,
      composerId: BEETHOVEN.id,
      seriesId: BAGATELLES.id,
      level: 'BEGINNER',
      difficultyScore: 30,
      difficultyNote: null,
      description: null,
      lyricsChords: '## Đoạn A',
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      genreIds: [CLASSICAL.id],
    });
  });

  it('đổi Composer mà không tải được Series -> bỏ chọn Series cũ, khoá ô Series, gửi seriesId null', async () => {
    const fetchMock = await signIn((url, init) => {
      if (url.pathname === '/admin/series' && url.searchParams.get('composerId') === CHOPIN.id) {
        return jsonResponse(500, errorBody('INTERNAL_ERROR'));
      }
      if (url.pathname === '/admin/sheets' && init.method === 'POST') return jsonResponse(201, SHEET);
      return undefined;
    });
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tiêu đề'), 'X');
    await choose(user, 'Cấp độ', 'Cơ bản');
    await choose(user, 'Composer', 'Beethoven');
    await choose(user, 'Series (không bắt buộc)', 'Bagatelles');

    await choose(user, 'Composer', 'Chopin');
    expect(await screen.findByText('Không tải được danh sách Series. Vui lòng thử lại.')).toBeInTheDocument();
    const seriesTrigger = screen.getByLabelText('Series (không bắt buộc)');
    expect(seriesTrigger).toHaveTextContent('Không thuộc Series');
    expect(seriesTrigger).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Tạo Sheet' }));
    await waitFor(() => expect(requests(fetchMock, 'POST', '/admin/sheets')).toHaveLength(1));
    const body = JSON.parse(String(requests(fetchMock, 'POST', '/admin/sheets')[0]!.init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ composerId: CHOPIN.id, seriesId: null });
  });

  it('tạo thành công -> nút gửi vẫn bị khoá trong lúc chuyển trang (không tạo trùng)', async () => {
    const fetchMock = await signIn((url, init) =>
      url.pathname === '/admin/sheets' && init.method === 'POST' ? jsonResponse(201, SHEET) : undefined,
    );
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tiêu đề'), 'X');
    await choose(user, 'Composer', 'Beethoven');
    await choose(user, 'Cấp độ', 'Cơ bản');
    await user.click(screen.getByRole('button', { name: 'Tạo Sheet' }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith(`/sheets/${SHEET.id}`));
    const button = screen.getByRole('button', { name: 'Đang lưu…' });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(requests(fetchMock, 'POST', '/admin/sheets')).toHaveLength(1);
  });

  it('độ khó ngoài 0–100 -> lỗi tại trường', async () => {
    await signIn(() => undefined);
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Độ khó 0–100 (không bắt buộc)'), '101');
    await user.tab();
    expect(await screen.findByText('Độ khó phải là số nguyên từ 0 đến 100.')).toBeInTheDocument();
  });

  it('lỗi VALIDATION_FAILED của API (seriesId) -> hiện dưới trường Series', async () => {
    await signIn((url, init) => {
      if (url.pathname === '/admin/sheets' && init.method === 'POST') {
        return jsonResponse(400, {
          error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ path: 'seriesId', message: 'Series không thuộc Composer đã chọn.' }] },
        });
      }
      return undefined;
    });
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tiêu đề'), 'X');
    await choose(user, 'Composer', 'Beethoven');
    await choose(user, 'Cấp độ', 'Nâng cao');
    await user.click(screen.getByRole('button', { name: 'Tạo Sheet' }));
    const error = await screen.findByText('Series không thuộc Composer đã chọn.');
    expect(error.closest('[role="alert"]')).toHaveAttribute('id', 'sheet-series-error');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('markdown: tab Xem trước render markdown, không render HTML thô', async () => {
    await signIn(() => undefined);
    render(<SheetCreatePage />);
    const user = userEvent.setup();
    await user.type(
      screen.getByLabelText('Lyrics & chords (markdown, không bắt buộc)'),
      '## Điệp khúc{Enter}{Enter}<b>đậm</b> **[[C] La** [[link](https://example.com)',
    );
    await user.click(screen.getByRole('tab', { name: 'Xem trước' }));
    const preview = await screen.findByTestId('markdown-preview');
    expect(within(preview).getByRole('heading', { level: 2, name: 'Điệp khúc' })).toBeInTheDocument();
    expect(within(preview).getByText('[C] La').tagName).toBe('STRONG');
    expect(preview.querySelector('b')).toBeNull();
    const link = within(preview).getByRole('link', { name: 'link' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    await user.click(screen.getByRole('tab', { name: 'Soạn' }));
    expect(screen.getByLabelText('Lyrics & chords (markdown, không bắt buộc)')).toHaveValue(
      '## Điệp khúc\n\n<b>đậm</b> **[C] La** [link](https://example.com)',
    );
  });
});

describe('Trang sửa Sheet', () => {
  it('tải Sheet, điền sẵn dữ liệu + preview; lưu -> PATCH đúng body và báo "Đã lưu"', async () => {
    const fetchMock = await signIn((url, init) => {
      if (url.pathname !== `/admin/sheets/${SHEET.id}`) return undefined;
      if (init.method === 'PATCH') return jsonResponse(200, { ...SHEET, title: 'Für Elise (bản dễ)', slug: 'fur-elise-ban-de' });
      return jsonResponse(200, SHEET);
    });
    render(<SheetEditPage id={SHEET.id} />);
    const title = await screen.findByLabelText('Tiêu đề');
    expect(title).toHaveValue('Für Elise');
    expect(screen.getByText(/#7/)).toHaveTextContent('Slug fur-elise');
    expect(screen.getByTitle('Xem trước video YouTube')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Series (không bắt buộc)')).toHaveTextContent('Bagatelles'));
    expect(await screen.findByRole('checkbox', { name: 'Cổ điển' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Pop' })).not.toBeChecked();

    const user = userEvent.setup();
    await user.clear(title);
    await user.type(title, 'Für Elise (bản dễ)');
    await user.click(screen.getByRole('checkbox', { name: 'Pop' }));
    await user.click(screen.getByRole('button', { name: 'Lưu' }));

    expect(await screen.findByText('Đã lưu.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Für Elise (bản dễ)');
    // Sửa tiếp -> "Đã lưu." biến mất.
    await user.type(screen.getByLabelText('Tiêu đề'), '!');
    expect(screen.queryByText('Đã lưu.')).not.toBeInTheDocument();
    const [patch] = requests(fetchMock, 'PATCH', `/admin/sheets/${SHEET.id}`);
    expect(JSON.parse(String(patch!.init.body))).toEqual({
      title: 'Für Elise (bản dễ)',
      subtitle: null,
      composerId: BEETHOVEN.id,
      seriesId: BAGATELLES.id,
      level: 'BEGINNER',
      difficultyScore: 30,
      difficultyNote: null,
      description: null,
      lyricsChords: '## Đoạn A',
      youtubeUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      genreIds: [CLASSICAL.id, POP.id],
    });
  });

  it('Sheet không tồn tại -> thông báo lỗi', async () => {
    await signIn(() => undefined);
    render(<SheetEditPage id="khong-co" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy Sheet');
  });
});
