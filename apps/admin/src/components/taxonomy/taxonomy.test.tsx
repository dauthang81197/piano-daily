import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import TaxonomyPage from '@/app/(admin)/taxonomy/page';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { GenreForm } from './genre-form';
import { SeriesForm } from './series-form';

const TCS = {
  id: '01920000-0000-7000-8000-000000000001',
  name: 'Trịnh Công Sơn',
  slug: 'trinh-cong-son',
  bio: null,
  avatar: null,
  seriesCount: 1,
};
const CHOPIN = { ...TCS, id: '01920000-0000-7000-8000-000000000002', name: 'Chopin', slug: 'chopin', seriesCount: 0 };

function page<T>(items: T[], total = items.length, pageNo = 1) {
  return { items, page: pageNo, pageSize: 20, total };
}

type Handler = (url: URL, init: RequestInit) => Response | undefined;

async function signIn(handler: Handler) {
  stubFetch(() => jsonResponse(200, sessionBody()));
  await login({ email: USER.email, password: 'pw' });
  return stubFetch((raw, init) => handler(new URL(raw), init) ?? jsonResponse(404, errorBody('NOT_FOUND')));
}

function requests(fetchMock: Awaited<ReturnType<typeof signIn>>, method: string, pathname: string) {
  return fetchMock.mock.calls
    .map(([input, init]) => ({ url: new URL(String(input)), init }))
    .filter(({ url, init }) => url.pathname === pathname && (init.method ?? 'GET') === method);
}

beforeEach(() => {
  resetSessionForTests();
});

describe('Trang /taxonomy — tab Composer', () => {
  it('có 3 tab; list Composer; tìm "trinh" gọi API với q (debounce) và chỉ hiện kết quả khớp', async () => {
    const fetchMock = await signIn((url) => {
      if (url.pathname !== '/admin/composers') return undefined;
      const q = url.searchParams.get('q');
      return jsonResponse(200, q === 'trinh' ? page([TCS]) : page([CHOPIN, TCS]));
    });
    render(<TaxonomyPage />);

    for (const name of ['Composer', 'Genre', 'Series']) expect(screen.getByRole('tab', { name })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Danh sách Composer' });
    expect(await within(table).findByText('Chopin')).toBeInTheDocument();
    expect(within(table).getByText('trinh-cong-son')).toBeInTheDocument();
    expect(screen.getByText('2 Composer')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tìm Composer theo tên'), 'trinh');
    await waitFor(() => expect(within(table).queryByText('Chopin')).not.toBeInTheDocument());
    expect(within(table).getByText('Trịnh Công Sơn')).toBeInTheDocument();

    const lists = requests(fetchMock, 'GET', '/admin/composers');
    // Một lần lúc mở trang + một lần sau debounce (không gọi theo từng phím).
    expect(lists).toHaveLength(2);
    expect(Object.fromEntries(lists[1]!.url.searchParams)).toEqual({ q: 'trinh', page: '1', pageSize: '20' });
  });

  it('phân trang: bấm "Trang sau" gọi page=2', async () => {
    const fetchMock = await signIn((url) => {
      if (url.pathname !== '/admin/composers') return undefined;
      const pageNo = Number(url.searchParams.get('page'));
      return jsonResponse(200, page(pageNo === 2 ? [TCS] : [CHOPIN], 21, pageNo));
    });
    render(<TaxonomyPage />);
    expect(await screen.findByText('Trang 1 / 2')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Trang sau' }));
    expect(await screen.findByText('Trang 2 / 2')).toBeInTheDocument();
    expect(await screen.findByText('Trịnh Công Sơn')).toBeInTheDocument();
    expect(requests(fetchMock, 'GET', '/admin/composers').at(-1)!.url.searchParams.get('page')).toBe('2');
  });

  it('tạo: tên rỗng -> lỗi ngay dưới trường, không gọi API; hợp lệ -> POST rồi tải lại bảng', async () => {
    const fetchMock = await signIn((url, init) => {
      if (url.pathname !== '/admin/composers') return undefined;
      if (init.method === 'POST') return jsonResponse(201, { ...CHOPIN, name: 'Bach', slug: 'bach' });
      return jsonResponse(200, page([TCS]));
    });
    render(<TaxonomyPage />);
    await screen.findByText('Trịnh Công Sơn');
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tạo Composer' });
    await user.type(within(dialog).getByLabelText('Tên'), '   ');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    const nameInput = within(dialog).getByLabelText('Tên');
    const error = await within(dialog).findByText('Vui lòng nhập tên.');
    expect(error.closest('[role="alert"]')).toHaveAttribute('id', 'composer-name-error');
    expect(nameInput).toHaveAttribute('aria-describedby', 'composer-name-error');
    expect(requests(fetchMock, 'POST', '/admin/composers')).toHaveLength(0);

    await user.clear(nameInput);
    await user.type(nameInput, '  Bach ');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [post] = requests(fetchMock, 'POST', '/admin/composers');
    expect(JSON.parse(String(post!.init.body))).toEqual({ name: 'Bach', bio: null });
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/composers')).toHaveLength(2));
  });

  it('lỗi VALIDATION_FAILED từ API có details -> hiện dưới đúng trường', async () => {
    await signIn((url, init) => {
      if (url.pathname !== '/admin/composers') return undefined;
      if (init.method === 'POST') {
        return jsonResponse(400, {
          error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ path: 'name', message: 'Tên đã bị từ chối.' }] },
        });
      }
      return jsonResponse(200, page([]));
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên'), 'Bach');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    expect(await within(dialog).findByText('Tên đã bị từ chối.')).toBeInTheDocument();
  });

  it('click hàng mở form sửa; xoá bị 409 RESOURCE_IN_USE -> FormError với thông điệp của API, dialog vẫn mở', async () => {
    const message = 'Composer đang có 1 Series nên không thể xoá. Hãy xoá hoặc chuyển các Series đó sang Composer khác trước.';
    const fetchMock = await signIn((url, init) => {
      if (url.pathname === `/admin/composers/${TCS.id}` && init.method === 'DELETE') {
        return jsonResponse(409, errorBody('RESOURCE_IN_USE', message));
      }
      if (url.pathname === '/admin/composers') return jsonResponse(200, page([TCS]));
      return undefined;
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('row', { name: 'Sửa Composer Trịnh Công Sơn' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sửa Composer' });
    expect(within(dialog).getByLabelText('Tên')).toHaveValue('Trịnh Công Sơn');

    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }));
    expect(requests(fetchMock, 'DELETE', `/admin/composers/${TCS.id}`)).toHaveLength(0);
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận xoá' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
    expect(requests(fetchMock, 'DELETE', `/admin/composers/${TCS.id}`)).toHaveLength(1);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('sửa: PATCH với tên mới', async () => {
    const fetchMock = await signIn((url, init) => {
      if (url.pathname === `/admin/composers/${TCS.id}` && init.method === 'PATCH') {
        return jsonResponse(200, { ...TCS, name: 'Trịnh Công Sơn (1939–2001)' });
      }
      if (url.pathname === '/admin/composers') return jsonResponse(200, page([TCS]));
      return undefined;
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('row', { name: 'Sửa Composer Trịnh Công Sơn' }));
    const dialog = await screen.findByRole('dialog');
    const input = within(dialog).getByLabelText('Tên');
    await user.clear(input);
    await user.type(input, 'Trịnh Công Sơn (1939–2001)');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const [patch] = requests(fetchMock, 'PATCH', `/admin/composers/${TCS.id}`);
    expect(JSON.parse(String(patch!.init.body))).toEqual({ name: 'Trịnh Công Sơn (1939–2001)', bio: null });
  });
});

describe('SeriesForm', () => {
  it('chưa chọn Composer -> lỗi dưới trường; chọn Composer rồi tạo -> POST {name, composerId}', async () => {
    const fetchMock = await signIn((url, init) => {
      if (url.pathname === '/admin/composers') return jsonResponse(200, page([CHOPIN, TCS]));
      if (url.pathname === '/admin/series' && init.method === 'POST') {
        return jsonResponse(201, { id: 's-1', name: 'Tình ca', slug: 'tinh-ca', composer: { id: TCS.id, name: TCS.name } });
      }
      return undefined;
    });
    let done = 0;
    render(<SeriesForm item={null} onDone={() => (done += 1)} onCancel={() => undefined} />);
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Tên'), 'Tình ca');
    await user.click(screen.getByRole('button', { name: 'Tạo' }));
    expect(await screen.findByText('Vui lòng chọn Composer.')).toBeInTheDocument();
    expect(requests(fetchMock, 'POST', '/admin/series')).toHaveLength(0);

    await user.click(screen.getByLabelText('Composer'));
    await user.click(await screen.findByRole('option', { name: 'Trịnh Công Sơn' }));
    expect(screen.getByLabelText('Composer')).toHaveTextContent('Trịnh Công Sơn');
    await user.click(screen.getByRole('button', { name: 'Tạo' }));

    await waitFor(() => expect(done).toBe(1));
    const [post] = requests(fetchMock, 'POST', '/admin/series');
    expect(JSON.parse(String(post!.init.body))).toEqual({ name: 'Tình ca', composerId: TCS.id });
    expect(requests(fetchMock, 'GET', '/admin/composers')[0]!.url.searchParams.get('pageSize')).toBe('100');
  });

  it('sửa: Composer hiện tại được chọn sẵn', async () => {
    await signIn((url) => (url.pathname === '/admin/composers' ? jsonResponse(200, page([CHOPIN])) : undefined));
    render(
      <SeriesForm
        item={{ id: 's-1', name: 'Tình ca', slug: 'tinh-ca', composer: { id: TCS.id, name: TCS.name } }}
        onDone={() => undefined}
        onCancel={() => undefined}
      />,
    );
    await waitFor(() => expect(screen.getByLabelText('Composer')).toHaveTextContent('Trịnh Công Sơn'));
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeInTheDocument();
  });
});

describe('Composer — xoá thành công, lùi trang, lỗi server', () => {
  it('xoá 204 -> đóng dialog, tải lại; trang trống với page>1 -> GET trang thấp hơn', async () => {
    let deleted = false;
    const fetchMock = await signIn((url, init) => {
      if (url.pathname === `/admin/composers/${TCS.id}` && init.method === 'DELETE') {
        deleted = true;
        return jsonResponse(204);
      }
      if (url.pathname !== '/admin/composers') return undefined;
      const pageNo = Number(url.searchParams.get('page'));
      if (pageNo === 2) return jsonResponse(200, page(deleted ? [] : [TCS], deleted ? 20 : 21, 2));
      return jsonResponse(200, page([CHOPIN], deleted ? 20 : 21, 1));
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await screen.findByText('Trang 1 / 2');
    await user.click(screen.getByRole('button', { name: 'Trang sau' }));
    await user.click(await screen.findByRole('row', { name: 'Sửa Composer Trịnh Công Sơn' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Xoá' }));
    await user.click(within(dialog).getByRole('button', { name: 'Xác nhận xoá' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requests(fetchMock, 'DELETE', `/admin/composers/${TCS.id}`)).toHaveLength(1);
    expect(await screen.findByText('Trang 1 / 1')).toBeInTheDocument();
    expect(await screen.findByText('Chopin')).toBeInTheDocument();
    const pages = requests(fetchMock, 'GET', '/admin/composers').map((r) => r.url.searchParams.get('page'));
    expect(pages).toEqual(['1', '2', '2', '1']);
  });

  it('PATCH 404 NOT_FOUND -> alert "không còn tồn tại"', async () => {
    await signIn((url, init) => {
      if (url.pathname === `/admin/composers/${TCS.id}` && init.method === 'PATCH') {
        return jsonResponse(404, errorBody('NOT_FOUND', 'Không tìm thấy Composer.'));
      }
      if (url.pathname === '/admin/composers') return jsonResponse(200, page([TCS]));
      return undefined;
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('row', { name: 'Sửa Composer Trịnh Công Sơn' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('không còn tồn tại');
  });

  it('VALIDATION_FAILED với details ngoài form -> alert lỗi validate chung', async () => {
    await signIn((url, init) => {
      if (url.pathname !== '/admin/composers') return undefined;
      if (init.method === 'POST') {
        return jsonResponse(400, {
          error: { code: 'VALIDATION_FAILED', message: 'x', details: [{ path: 'slug', message: 'Sai.' }] },
        });
      }
      return jsonResponse(200, page([]));
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: 'Tạo mới' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Tên'), 'Bach');
    await user.click(within(dialog).getByRole('button', { name: 'Tạo' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Dữ liệu chưa hợp lệ. Vui lòng kiểm tra lại các trường.',
    );
  });
});

describe('GenreForm', () => {
  function stubGenres() {
    return signIn((url, init) => {
      if (url.pathname === '/admin/genres' && init.method === 'POST') {
        return jsonResponse(201, { id: 'g-1', name: 'Pop', slug: 'pop', icon: null });
      }
      if (url.pathname === '/admin/genres/g-1' && init.method === 'PATCH') {
        return jsonResponse(200, { id: 'g-1', name: 'Pop', slug: 'pop', icon: null });
      }
      return undefined;
    });
  }

  it('chọn icon -> POST icon:<tên>', async () => {
    const fetchMock = await stubGenres();
    let done = 0;
    render(<GenreForm item={null} onDone={() => (done += 1)} onCancel={() => undefined} />);
    const user = userEvent.setup();
    await user.type(screen.getByLabelText('Tên'), 'Nhạc phim');
    await user.click(screen.getByLabelText('Icon (không bắt buộc)'));
    await user.click(await screen.findByRole('option', { name: 'film' }));
    await user.click(screen.getByRole('button', { name: 'Tạo' }));
    await waitFor(() => expect(done).toBe(1));
    const [post] = requests(fetchMock, 'POST', '/admin/genres');
    expect(JSON.parse(String(post!.init.body))).toEqual({ name: 'Nhạc phim', icon: 'film' });
  });

  it('sửa: icon hiện tại được chọn sẵn; chọn "Không có icon" -> PATCH icon:null', async () => {
    const fetchMock = await stubGenres();
    let done = 0;
    render(
      <GenreForm
        item={{ id: 'g-1', name: 'Pop', slug: 'pop', icon: 'music' }}
        onDone={() => (done += 1)}
        onCancel={() => undefined}
      />,
    );
    const trigger = screen.getByLabelText('Icon (không bắt buộc)');
    expect(trigger).toHaveTextContent('music');
    const user = userEvent.setup();
    await user.click(trigger);
    await user.click(await screen.findByRole('option', { name: 'Không có icon' }));
    await user.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(done).toBe(1));
    const [patch] = requests(fetchMock, 'PATCH', '/admin/genres/g-1');
    expect(JSON.parse(String(patch!.init.body))).toEqual({ name: 'Pop', icon: null });
  });
});

describe('Tab Series — lọc theo Composer', () => {
  it('chọn Composer -> GET composerId=<id>&page=1; "Tất cả Composer" bỏ composerId', async () => {
    const fetchMock = await signIn((url) => {
      if (url.pathname === '/admin/composers') return jsonResponse(200, page([CHOPIN, TCS]));
      if (url.pathname === '/admin/series') return jsonResponse(200, page([]));
      return undefined;
    });
    render(<TaxonomyPage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: 'Series' }));
    const filter = await screen.findByLabelText('Composer');
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/series')).toHaveLength(1));

    await user.click(filter);
    await user.click(await screen.findByRole('option', { name: 'Chopin' }));
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/series')).toHaveLength(2));
    const filtered = requests(fetchMock, 'GET', '/admin/series')[1]!.url.searchParams;
    expect(filtered.get('composerId')).toBe(CHOPIN.id);
    expect(filtered.get('page')).toBe('1');

    await user.click(screen.getByLabelText('Composer'));
    await user.click(await screen.findByRole('option', { name: 'Tất cả Composer' }));
    await waitFor(() => expect(requests(fetchMock, 'GET', '/admin/series')).toHaveLength(3));
    const all = requests(fetchMock, 'GET', '/admin/series')[2]!.url.searchParams;
    expect(all.has('composerId')).toBe(false);
    expect(all.get('page')).toBe('1');
  });
});
