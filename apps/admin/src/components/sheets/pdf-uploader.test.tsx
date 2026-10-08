import { PDF_MAX_BYTES, type Sheet } from '@piano-daily/shared';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccessToken, login, resetSessionForTests } from '@/lib/auth/session';
import { callsTo, errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { PdfUploader } from './pdf-uploader';
import { SheetEditPage } from './sheet-editor';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/sheets' }));

const SHEET: Sheet = {
  id: '01920000-0000-7000-8000-0000000000e1',
  publicId: 7,
  slug: 'fur-elise',
  title: 'Für Elise',
  subtitle: null,
  composer: { id: '01920000-0000-7000-8000-00000000000a', name: 'Beethoven' },
  series: null,
  level: 'BEGINNER',
  difficultyScore: null,
  difficultyNote: null,
  description: null,
  lyricsChords: null,
  youtubeUrl: null,
  genres: [],
  hasSheet: false,
  hasChords: false,
  hasMidi: false,
  hasMp3: false,
  hasVideo: false,
  pageCount: 0,
  thumbnailUrl: null,
  pages: [],
  pdf: null,
  midi: null,
  mp3: null,
  viewCount: 0,
  isHot: false,
  isFree: false,
  pricePdfCents: null,
  priceMidiCents: null,
  priceMp3Cents: null,
  priceBundleCents: null,
  status: 'DRAFT',
  firstPublishedAt: null,
  createdAt: '2026-09-29T01:00:00.000Z',
  updatedAt: '2026-09-29T02:30:00.000Z',
};

const BASE = 'http://localhost:8333/piano-daily-public/public/sheets/x';
const UPLOADED: Sheet = {
  ...SHEET,
  hasSheet: true,
  pageCount: 3,
  thumbnailUrl: `${BASE}/THUMBNAIL/abc.webp`,
  pages: [1, 2, 3].map((n) => ({ pageNumber: n, url: `${BASE}/PAGE_IMAGE/abc-p${n}.webp` })),
  pdf: { originalName: 'fur-elise.pdf', size: 1536, uploadedAt: '2026-09-29T03:00:00.000Z' },
};

/** XMLHttpRequest giả: test điều khiển tiến trình và response. */
class FakeXhr {
  static instances: FakeXhr[] = [];
  method = '';
  url = '';
  headers: Record<string, string> = {};
  body: FormData | null = null;
  status = 0;
  timeout = 0;
  responseText = '';
  upload: { onprogress: ((e: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  onloadend: (() => void) | null = null;

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: FormData) {
    this.body = body;
    FakeXhr.instances.push(this);
  }
  abort() {
    this.onabort?.();
    this.onloadend?.();
  }
  progress(loaded: number, total: number) {
    act(() => this.upload.onprogress?.({ lengthComputable: true, loaded, total } as ProgressEvent));
  }
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
    this.onloadend?.();
  }
}

const pdfFile = (name = 'fur-elise.pdf') => new File(['%PDF-1.4 fake'], name, { type: 'application/pdf' });

async function signIn() {
  stubFetch(() => jsonResponse(200, sessionBody('access-1')));
  await login({ email: USER.email, password: 'pw' });
}

function renderUploader(sheet: Sheet = SHEET) {
  const onUploaded = vi.fn();
  render(<PdfUploader sheet={sheet} onUploaded={onUploaded} />);
  return onUploaded;
}

async function lastXhr(count = 1) {
  await waitFor(() => expect(FakeXhr.instances).toHaveLength(count));
  return FakeXhr.instances[count - 1]!;
}

beforeEach(async () => {
  resetSessionForTests();
  FakeXhr.instances = [];
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  await signIn();
});

describe('PdfUploader — validate phía client', () => {
  it('file không phải PDF (kéo-thả PNG) -> FormError tại ô upload, không gửi request', async () => {
    renderUploader();
    const png = new File(['\x89PNG'], 'anh.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('pdf-dropzone'), { dataTransfer: { files: [png] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('File không phải PDF');
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('PDF > 20MB (chọn qua ô file) -> FormError, không gửi request', async () => {
    renderUploader();
    const big = pdfFile('lon.pdf');
    Object.defineProperty(big, 'size', { value: PDF_MAX_BYTES + 1 });
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('vượt quá 20MB');
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it.each([
    ['application/x-pdf', 'a.pdf'],
    ['application/octet-stream', 'b.PDF'],
    ['', 'c.pdf'],
  ])('MIME %j + đuôi .pdf -> chấp nhận (server kiểm magic bytes)', async (type, name) => {
    renderUploader();
    fireEvent.drop(screen.getByTestId('pdf-dropzone'), { dataTransfer: { files: [new File(['%PDF-1.4'], name, { type })] } });
    await lastXhr();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('MIME octet-stream nhưng không có đuôi .pdf -> từ chối, không request', async () => {
    renderUploader();
    const file = new File(['x'], 'tai-lieu.bin', { type: 'application/octet-stream' });
    fireEvent.drop(screen.getByTestId('pdf-dropzone'), { dataTransfer: { files: [file] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('File không phải PDF');
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('nút "Chọn file PDF" mở hộp chọn file (click vào input ẩn)', async () => {
    renderUploader();
    const input = screen.getByLabelText<HTMLInputElement>('Chọn file PDF');
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', 'application/pdf,.pdf');
    const click = vi.spyOn(input, 'click');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Chọn file PDF' }));
    expect(click).toHaveBeenCalled();
  });
});

describe('PdfUploader — upload', () => {
  it('gửi multipart có Bearer token; tiến trình % cập nhật; xong hiện thumbnail, số trang, tên file', async () => {
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    const xhr = await lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(`http://localhost:4000/admin/sheets/${SHEET.id}/files`);
    expect(xhr.headers.Authorization).toBe('Bearer access-1');
    expect(xhr.body?.get('type')).toBe('PDF');
    expect((xhr.body?.get('file') as File).name).toBe('fur-elise.pdf');

    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    xhr.progress(42, 100);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByRole('status')).toHaveTextContent('Đang upload… 42%');
    expect(screen.getByRole('button', { name: 'Chọn file PDF' })).toBeDisabled();
    xhr.progress(100, 100);
    expect(screen.getByRole('status')).toHaveTextContent('Đang tạo thumbnail');

    act(() => xhr.respond(201, UPLOADED));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(UPLOADED));
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    // Live region luôn có mặt, thông báo kết quả cho screen reader.
    expect(screen.getByRole('status')).toHaveTextContent('Đã tải lên 3 trang.');
  });

  it('live region role="status" có sẵn trước khi upload', () => {
    renderUploader();
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  it('thả hai file liên tiếp thật nhanh -> chỉ một upload', async () => {
    renderUploader();
    const zone = screen.getByTestId('pdf-dropzone');
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile('1.pdf')] } });
    fireEvent.drop(zone, { dataTransfer: { files: [pdfFile('2.pdf')] } });
    await lastXhr();
    await new Promise((r) => setTimeout(r, 20));
    expect(FakeXhr.instances).toHaveLength(1);
    expect((FakeXhr.instances[0]!.body?.get('file') as File).name).toBe('1.pdf');
  });

  it('XHR có timeout 5 phút; hết giờ -> FormError nói rõ quá thời gian', async () => {
    renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    const xhr = await lastXhr();
    expect(xhr.timeout).toBe(5 * 60 * 1000);
    act(() => xhr.ontimeout?.());
    expect(await screen.findByRole('alert')).toHaveTextContent('Upload quá lâu');
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('Sheet đã có PDF -> hiện thumbnail, số trang, tên file, dung lượng', () => {
    renderUploader(UPLOADED);
    const preview = screen.getByTestId('pdf-preview');
    expect(screen.getByRole('img', { name: /Trang đầu/ })).toHaveAttribute('src', UPLOADED.thumbnailUrl);
    expect(preview).toHaveTextContent('fur-elise.pdf');
    expect(preview).toHaveTextContent('3 trang');
    expect(preview).toHaveTextContent('1,5 KB');
  });

  it('lỗi server (422) -> FormError với lý do từ server', async () => {
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    const xhr = await lastXhr();
    act(() => xhr.respond(422, errorBody('FILE_PROCESSING_FAILED', 'Không đọc được file PDF (file có thể bị hỏng).')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không đọc được file PDF (file có thể bị hỏng).');
    expect(onUploaded).not.toHaveBeenCalled();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('lỗi mạng -> FormError NETWORK_ERROR', async () => {
    renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    const xhr = await lastXhr();
    act(() => xhr.onerror?.());
    expect(await screen.findByRole('alert')).toHaveTextContent('Không kết nối được máy chủ');
  });

  it('401 -> refresh một lần rồi gửi lại với token mới', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('/auth/refresh') ? jsonResponse(200, sessionBody('access-2')) : jsonResponse(404, errorBody('NOT_FOUND')),
    );
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    act(() => FakeXhr.instances[0]!.respond(401, errorBody('UNAUTHORIZED')));
    const retry = await lastXhr(2);
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    expect(retry.headers.Authorization).toBe('Bearer access-2');
    act(() => retry.respond(201, UPLOADED));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(UPLOADED));
  });

  it('refresh thành công nhưng lần gửi lại vẫn 401 -> xoá phiên, FormError, không gửi lần ba', async () => {
    const fetchMock = stubFetch((url) =>
      url.endsWith('/auth/refresh') ? jsonResponse(200, sessionBody('access-2')) : jsonResponse(404, errorBody('NOT_FOUND')),
    );
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    act(() => FakeXhr.instances[0]!.respond(401, errorBody('UNAUTHORIZED')));
    const retry = await lastXhr(2);
    act(() => retry.respond(401, errorBody('UNAUTHORIZED', 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.');
    expect(getAccessToken()).toBeNull();
    expect(callsTo(fetchMock, '/auth/refresh')).toHaveLength(1);
    await new Promise((r) => setTimeout(r, 20));
    expect(FakeXhr.instances).toHaveLength(2);
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('401 và refresh thất bại -> hết phiên, FormError, không gửi lại', async () => {
    stubFetch(() => jsonResponse(401, errorBody('UNAUTHORIZED')));
    renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    act(() => FakeXhr.instances[0]!.respond(401, errorBody('UNAUTHORIZED')));
    expect(await screen.findByRole('alert')).toHaveTextContent('Phiên đăng nhập đã hết hạn');
    expect(FakeXhr.instances).toHaveLength(1);
    expect(getAccessToken()).toBeNull();
  });
});

describe('Trang sửa Sheet + uploader', () => {
  it('upload xong: hiện thumbnail, các trường form đang sửa giữ nguyên', async () => {
    stubFetch((raw) => {
      const url = new URL(raw);
      if (url.pathname === `/admin/sheets/${SHEET.id}`) return jsonResponse(200, SHEET);
      return jsonResponse(200, { items: [], page: 1, pageSize: 100, total: 0 });
    });
    render(<SheetEditPage id={SHEET.id} />);
    const user = userEvent.setup();
    const title = await screen.findByLabelText('Tiêu đề');
    await user.clear(title);
    await user.type(title, 'Tiêu đề đang sửa');

    await user.upload(screen.getByLabelText('Chọn file PDF'), pdfFile());
    const xhr = await lastXhr();
    act(() => xhr.respond(201, UPLOADED));

    expect(await screen.findByRole('img', { name: /Trang đầu/ })).toHaveAttribute('src', UPLOADED.thumbnailUrl);
    expect(screen.getByTestId('pdf-preview')).toHaveTextContent('3 trang');
    expect(screen.getByLabelText('Tiêu đề')).toHaveValue('Tiêu đề đang sửa');
  });
});
