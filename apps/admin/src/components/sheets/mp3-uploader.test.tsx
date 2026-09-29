import { MP3_MAX_BYTES, type Sheet } from '@piano-daily/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { Mp3Uploader } from './mp3-uploader';

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
  status: 'DRAFT',
  firstPublishedAt: null,
  createdAt: '2026-09-29T01:00:00.000Z',
  updatedAt: '2026-09-29T02:30:00.000Z',
};

const UPLOADED: Sheet = {
  ...SHEET,
  hasMp3: true,
  mp3: {
    originalName: 'fur-elise.mp3',
    size: 4096,
    uploadedAt: '2026-09-29T03:00:00.000Z',
    previewUrl: 'http://localhost:9000/piano-daily-private/private/sheets/x/MP3/abc.mp3?X-Amz-Signature=sig',
  },
};

/** XMLHttpRequest giả: test điều khiển tiến trình và response (mẫu theo `pdf-uploader.test.tsx`). */
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
  respond(status: number, body: unknown) {
    this.status = status;
    this.responseText = JSON.stringify(body);
    this.onload?.();
    this.onloadend?.();
  }
}

const mp3File = (name = 'fur-elise.mp3') => new File(['ID3\x03\x00'], name, { type: 'audio/mpeg' });

async function signIn() {
  stubFetch(() => jsonResponse(200, sessionBody('access-1')));
  await login({ email: USER.email, password: 'pw' });
}

function renderUploader(sheet: Sheet = SHEET) {
  const onUploaded = vi.fn();
  render(<Mp3Uploader sheet={sheet} onUploaded={onUploaded} />);
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

describe('Mp3Uploader — validate phía client', () => {
  it('file không phải MP3 -> FormError, không gửi request', async () => {
    renderUploader();
    const png = new File(['\x89PNG'], 'anh.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('mp3-dropzone'), { dataTransfer: { files: [png] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('File không phải MP3');
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('MP3 > 20MB -> FormError, không gửi request', async () => {
    renderUploader();
    const big = mp3File('lon.mp3');
    Object.defineProperty(big, 'size', { value: MP3_MAX_BYTES + 1 });
    await userEvent.setup().upload(screen.getByLabelText('Chọn file MP3'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('vượt quá 20MB');
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('Mp3Uploader — upload', () => {
  it('gửi multipart type=MP3; xong gọi onUploaded', async () => {
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file MP3'), mp3File());
    const xhr = await lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.body?.get('type')).toBe('MP3');

    act(() => xhr.respond(201, UPLOADED));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(UPLOADED));
    expect(screen.getByRole('status')).toHaveTextContent('Đã tải lên MP3.');
  });

  it('Sheet đã có MP3 -> hiện <audio> trỏ previewUrl, tên file, nút Gỡ file', () => {
    renderUploader(UPLOADED);
    const preview = screen.getByTestId('mp3-preview');
    expect(preview).toHaveTextContent('fur-elise.mp3');
    const audio = preview.querySelector('audio');
    expect(audio).toHaveAttribute('src', UPLOADED.mp3!.previewUrl);
    expect(audio).toHaveAttribute('controls');
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeInTheDocument();
  });

  it('lỗi server (415) -> FormError với lý do từ server', async () => {
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file MP3'), mp3File());
    const xhr = await lastXhr();
    act(() => xhr.respond(415, errorBody('UNSUPPORTED_FILE_TYPE', 'File không phải MP3.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('File không phải MP3.');
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

describe('Mp3Uploader — gỡ file', () => {
  it('bấm Xoá rồi xác nhận -> gửi DELETE, cập nhật hasMp3=false, mp3=null', async () => {
    const fetchMock = stubFetch((raw, init) => {
      const url = new URL(raw);
      if (url.pathname === `/admin/sheets/${SHEET.id}/files/mp3` && init.method === 'DELETE') {
        return jsonResponse(204);
      }
      return jsonResponse(404, errorBody('NOT_FOUND'));
    });
    const onUploaded = renderUploader(UPLOADED);
    const user = userEvent.setup();
    const preview = screen.getByTestId('mp3-preview');
    await user.click(within(preview).getByRole('button', { name: 'Xoá' }));
    await user.click(within(preview).getByRole('button', { name: 'Xác nhận xoá' }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ ...UPLOADED, hasMp3: false, mp3: null }));
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith(`/admin/sheets/${SHEET.id}/files/mp3`) && init.method === 'DELETE',
      ),
    ).toBe(true);
  });

  it('gỡ file lỗi -> FormError, không gọi onUploaded', async () => {
    stubFetch(() => jsonResponse(500, errorBody('INTERNAL_ERROR', 'Đã xảy ra lỗi không mong muốn.')));
    const onUploaded = renderUploader(UPLOADED);
    const user = userEvent.setup();
    const preview = screen.getByTestId('mp3-preview');
    await user.click(within(preview).getByRole('button', { name: 'Xoá' }));
    await user.click(within(preview).getByRole('button', { name: 'Xác nhận xoá' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Đã xảy ra lỗi không mong muốn.');
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
