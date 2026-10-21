import type { SheetImportDetail, SheetImportItem } from '@piano-daily/shared';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ImportDetail } from './import-detail';
import { ImportNewForm } from './import-new-form';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }), usePathname: () => '/imports' }));
vi.mock('@/lib/api/imports', () => ({
  importsApi: { get: vi.fn(), create: vi.fn(), cancel: vi.fn(), cancelItem: vi.fn(), retryItem: vi.fn(), remove: vi.fn(), list: vi.fn() },
  uploadImportFile: vi.fn(),
}));
vi.mock('@/lib/api/catalog', () => ({
  composersApi: { list: vi.fn(async () => ({ items: [{ id: 'c1', name: 'Chopin' }], page: 1, pageSize: 100, total: 1 })) },
  genresApi: { list: vi.fn(async () => ({ items: [{ id: 'g1', name: 'Cổ điển' }], page: 1, pageSize: 100, total: 1 })) },
  seriesApi: { list: vi.fn(async () => ({ items: [], page: 1, pageSize: 100, total: 0 })) },
}));

const { importsApi, uploadImportFile } = await import('@/lib/api/imports');

const item = (over: Partial<SheetImportItem>): SheetImportItem => ({
  id: 'i1',
  originalName: 'a.pdf',
  status: 'PENDING',
  step: null,
  attempts: 0,
  errorCode: null,
  errorMessage: null,
  sheetId: null,
  sheetTitle: null,
  startedAt: null,
  finishedAt: null,
  createdAt: '2026-10-24T01:00:00.000Z',
  ...over,
});
const detail = (items: SheetImportItem[], over: Partial<SheetImportDetail> = {}): SheetImportDetail => {
  const count = (s: string) => items.filter((i) => i.status === s).length;
  return {
    id: 'b1',
    status: 'RUNNING',
    level: 'INTERMEDIATE',
    composerId: 'c0',
    composerName: 'Chưa rõ',
    genreIds: [],
    publish: false,
    counts: { total: items.length, pending: count('PENDING'), processing: count('PROCESSING'), done: count('DONE'), failed: count('FAILED'), cancelled: count('CANCELLED') },
    createdAt: '2026-10-24T01:00:00.000Z',
    items,
    ...over,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('ImportDetail', () => {
  it('hiện từng file với trạng thái, bước, lỗi và link tới Sheet; thanh tiến độ đúng', async () => {
    vi.mocked(importsApi.get).mockResolvedValue(
      detail([
        item({ id: 'i1', originalName: 'xong.pdf', status: 'DONE', attempts: 1, sheetId: 's1', sheetTitle: 'Xong' }),
        item({ id: 'i2', originalName: 'dang.pdf', status: 'PROCESSING', step: 'CONVERTING', attempts: 1 }),
        item({ id: 'i3', originalName: 'loi.pdf', status: 'FAILED', attempts: 1, errorCode: 'SCORE_UNREADABLE', errorMessage: 'Không nhận dạng được nốt nhạc trong file PDF này.' }),
        item({ id: 'i4', originalName: 'cho.pdf' }),
      ]),
    );
    render(<ImportDetail id="b1" />);
    expect(await screen.findByText('xong.pdf')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xong' })).toHaveAttribute('href', '/sheets/s1');
    expect(screen.getByText('Đang chuyển PDF sang MIDI')).toBeInTheDocument();
    expect(screen.getByText('Không nhận dạng được nốt nhạc trong file PDF này.')).toBeInTheDocument();
    expect(screen.getByText('Đang chờ')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Tiến độ import' })).toHaveAttribute('aria-valuenow', '2');
    expect(screen.getByText(/2\/4 file/)).toBeInTheDocument();
    // Còn việc chạy: không xoá được đợt.
    expect(screen.getByRole('button', { name: 'Xoá đợt' })).toBeDisabled();
  });

  it('thử lại dòng lỗi và huỷ dòng đang chờ', async () => {
    const user = userEvent.setup();
    const failed = item({ id: 'i3', originalName: 'loi.pdf', status: 'FAILED', attempts: 1, errorMessage: 'x' });
    vi.mocked(importsApi.get).mockResolvedValue(detail([failed, item({ id: 'i4', originalName: 'cho.pdf' })]));
    vi.mocked(importsApi.retryItem).mockResolvedValue(detail([item({ id: 'i3', originalName: 'loi.pdf' }), item({ id: 'i4', originalName: 'cho.pdf' })]));
    render(<ImportDetail id="b1" />);
    await user.click(await screen.findByRole('button', { name: 'Thử lại loi.pdf' }));
    expect(importsApi.retryItem).toHaveBeenCalledWith('b1', 'i3');
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Thử lại loi.pdf' })).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Huỷ cho.pdf' }));
    expect(importsApi.cancelItem).toHaveBeenCalledWith('b1', 'i4');
  });

  it('đợt đã xong: cho xoá và báo kết quả', async () => {
    vi.mocked(importsApi.get).mockResolvedValue(detail([item({ status: 'DONE', sheetId: 's1', sheetTitle: 'A' })], { status: 'DONE' }));
    render(<ImportDetail id="b1" />);
    expect(await screen.findByText('Hoàn tất')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xoá đợt' })).toBeEnabled();
  });

  it('lỗi tải hiện thông báo', async () => {
    vi.mocked(importsApi.get).mockRejectedValue(new Error('x'));
    render(<ImportDetail id="b1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Không tải được đợt import.');
  });
});

describe('ImportNewForm', () => {
  const pdf = (name: string) => new File(['%PDF-1.4'], name, { type: 'application/pdf' });

  it('mặc định Trung cấp, tạo đợt rồi tải từng file và chuyển sang trang theo dõi', async () => {
    const user = userEvent.setup();
    vi.mocked(importsApi.create).mockResolvedValue(detail([], { status: 'EMPTY' }));
    vi.mocked(uploadImportFile).mockImplementation(async (_b, file, onProgress) => {
      onProgress?.(100);
      return item({ originalName: file.name });
    });
    render(<ImportNewForm />);
    expect(screen.getByRole('button', { name: /Bắt đầu import/ })).toBeDisabled();
    await user.upload(document.getElementById('import-files') as HTMLInputElement, [pdf('a.pdf'), pdf('b.pdf')]);
    await user.click(screen.getByRole('button', { name: 'Bắt đầu import (2 file)' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/imports/b1'));
    expect(importsApi.create).toHaveBeenCalledWith({ level: 'INTERMEDIATE', composerId: null, genreIds: [], publish: false });
    expect(uploadImportFile).toHaveBeenCalledTimes(2);
  });

  it('bỏ qua file không phải PDF; file lỗi khi tải lên được báo, các file còn lại vẫn chuyển trang', async () => {
    const user = userEvent.setup({ applyAccept: false });
    vi.mocked(importsApi.create).mockResolvedValue(detail([], { status: 'EMPTY' }));
    vi.mocked(uploadImportFile).mockImplementation(async (_b, file) => {
      if (file.name === 'xau.pdf') throw Object.assign(new Error('x'), { name: 'ApiError' });
      return item({ originalName: file.name });
    });
    render(<ImportNewForm />);
    await user.upload(document.getElementById('import-files') as HTMLInputElement, [pdf('tot.pdf'), pdf('xau.pdf'), new File(['x'], 'a.txt', { type: 'text/plain' })]);
    expect(screen.getByRole('alert')).toHaveTextContent('Bỏ qua 1 file');
    await user.click(screen.getByRole('button', { name: 'Bắt đầu import (2 file)' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/imports/b1'));
  });
});
