import { MIDI_MAX_BYTES, type Sheet } from '@piano-daily/shared';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { login, resetSessionForTests } from '@/lib/auth/session';
import { errorBody, jsonResponse, sessionBody, stubFetch, USER } from '../../test/helpers';
import { MidiUploader } from './midi-uploader';

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
  hasMidi: true,
  midi: {
    originalName: 'fur-elise.mid',
    size: 512,
    uploadedAt: '2026-09-29T03:00:00.000Z',
    durationSeconds: 92,
    noteCount: 40,
    noteJsonUrl: 'http://localhost:8333/piano-daily-public/public/sheets/x/MIDI_JSON/abc.json',
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

const midiFile = (name = 'fur-elise.mid') => new File(['MThd\x00\x00\x00\x06'], name, { type: 'audio/midi' });

async function signIn() {
  stubFetch(() => jsonResponse(200, sessionBody('access-1')));
  await login({ email: USER.email, password: 'pw' });
}

function renderUploader(sheet: Sheet = SHEET) {
  const onUploaded = vi.fn();
  render(<MidiUploader sheet={sheet} onUploaded={onUploaded} />);
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

describe('MidiUploader — validate phía client', () => {
  it('file không phải MIDI -> FormError, không gửi request', async () => {
    renderUploader();
    const png = new File(['\x89PNG'], 'anh.png', { type: 'image/png' });
    fireEvent.drop(screen.getByTestId('midi-dropzone'), { dataTransfer: { files: [png] } });
    expect(await screen.findByRole('alert')).toHaveTextContent('File không phải MIDI');
    expect(FakeXhr.instances).toHaveLength(0);
  });

  it('MIDI > 2MB -> FormError, không gửi request', async () => {
    renderUploader();
    const big = midiFile('lon.mid');
    Object.defineProperty(big, 'size', { value: MIDI_MAX_BYTES + 1 });
    await userEvent.setup().upload(screen.getByLabelText('Chọn file MIDI'), big);
    expect(await screen.findByRole('alert')).toHaveTextContent('vượt quá 2MB');
    expect(FakeXhr.instances).toHaveLength(0);
  });
});

describe('MidiUploader — upload', () => {
  it('gửi multipart type=MIDI; xong hiện thời lượng/số nốt, gọi onUploaded', async () => {
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file MIDI'), midiFile());
    const xhr = await lastXhr();
    expect(xhr.method).toBe('POST');
    expect(xhr.url).toBe(`http://localhost:4000/admin/sheets/${SHEET.id}/files`);
    expect(xhr.body?.get('type')).toBe('MIDI');

    act(() => xhr.respond(201, UPLOADED));
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith(UPLOADED));
    expect(screen.getByRole('status')).toHaveTextContent('1:32');
    expect(screen.getByRole('status')).toHaveTextContent('40 nốt');
  });

  it('Sheet đã có MIDI -> hiện tên file, thời lượng mm:ss, số nốt, nút Gỡ file', () => {
    renderUploader(UPLOADED);
    const preview = screen.getByTestId('midi-preview');
    expect(preview).toHaveTextContent('fur-elise.mid');
    expect(preview).toHaveTextContent('1:32');
    expect(preview).toHaveTextContent('40 nốt');
    expect(screen.getByRole('button', { name: 'Xoá' })).toBeInTheDocument();
  });

  it('lỗi server (422) -> FormError với lý do từ server', async () => {
    const onUploaded = renderUploader();
    await userEvent.setup().upload(screen.getByLabelText('Chọn file MIDI'), midiFile());
    const xhr = await lastXhr();
    act(() => xhr.respond(422, errorBody('FILE_PROCESSING_FAILED', 'File MIDI bị hỏng.')));
    expect(await screen.findByRole('alert')).toHaveTextContent('File MIDI bị hỏng.');
    expect(onUploaded).not.toHaveBeenCalled();
  });
});

describe('MidiUploader — gỡ file', () => {
  it('bấm Xoá rồi xác nhận -> gửi DELETE, cập nhật hasMidi=false, midi=null', async () => {
    const fetchMock = stubFetch((raw, init) => {
      const url = new URL(raw);
      if (url.pathname === `/admin/sheets/${SHEET.id}/files/midi` && init.method === 'DELETE') {
        return jsonResponse(204);
      }
      return jsonResponse(404, errorBody('NOT_FOUND'));
    });
    const onUploaded = renderUploader(UPLOADED);
    const user = userEvent.setup();
    const preview = screen.getByTestId('midi-preview');
    await user.click(within(preview).getByRole('button', { name: 'Xoá' }));
    await user.click(within(preview).getByRole('button', { name: 'Xác nhận xoá' }));

    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ ...UPLOADED, hasMidi: false, midi: null }));
    expect(
      fetchMock.mock.calls.some(
        ([input, init]) => String(input).endsWith(`/admin/sheets/${SHEET.id}/files/midi`) && init.method === 'DELETE',
      ),
    ).toBe(true);
  });

  it('gỡ file lỗi -> FormError, không gọi onUploaded', async () => {
    stubFetch(() => jsonResponse(404, errorBody('NOT_FOUND', 'Không tìm thấy file hiện hành của loại này.')));
    const onUploaded = renderUploader(UPLOADED);
    const user = userEvent.setup();
    const preview = screen.getByTestId('midi-preview');
    await user.click(within(preview).getByRole('button', { name: 'Xoá' }));
    await user.click(within(preview).getByRole('button', { name: 'Xác nhận xoá' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Không tìm thấy file hiện hành của loại này.');
    expect(onUploaded).not.toHaveBeenCalled();
  });
});
