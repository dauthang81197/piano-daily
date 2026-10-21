import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Sheet } from '@piano-daily/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { ApiError } from '@/lib/public-api';

const { auth, api, push, openAuth } = vi.hoisted(() => ({
  auth: { value: null as unknown },
  api: {
    createMySheet: vi.fn(),
    uploadMySheetFile: vi.fn(),
    publishMySheet: vi.fn(),
    unpublishMySheet: vi.fn(),
    getMySheet: vi.fn(),
    updateMySheet: vi.fn(),
    removeMySheetFile: vi.fn(),
    deleteMySheet: vi.fn(),
  },
  push: vi.fn(),
  openAuth: vi.fn(),
}));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push }),
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SheetUploadForm } from './sheet-upload-form';

const ID = '0195b0f0-0000-7000-8000-000000000001';
const composers = [{ id: 'c1', name: 'Ludwig van Beethoven' }];
const genres = [{ id: 'g1', name: 'Classical' }, { id: 'g2', name: 'Jazz' }];
const sheet = (over: Partial<Sheet> = {}): Sheet =>
  ({
    id: ID,
    slug: 'fur-elise',
    title: 'Für Elise',
    subtitle: null,
    level: 'BEGINNER',
    difficultyScore: 30,
    difficultyNote: null,
    description: 'Mô tả',
    lyricsChords: null,
    youtubeUrl: null,
    composer: { id: 'c1', name: 'Ludwig van Beethoven' },
    genres: [{ id: 'g1', name: 'Classical' }],
    status: 'DRAFT',
    pdf: null,
    midi: null,
    mp3: null,
    ...over,
  }) as Sheet;
const signIn = () => {
  auth.value = { status: 'authenticated', customer: { id: 'c' }, getToken: async () => 'tok', openAuth };
};
const file = (name: string, size = 10, type = 'application/octet-stream') => {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
};
const pick = async (label: RegExp, f: File) => {
  await userEvent.upload(screen.getByLabelText(label), f);
};
const view = (props: Partial<Parameters<typeof SheetUploadForm>[0]> = {}) =>
  render(withIntl(<SheetUploadForm mode="create" composers={composers} genres={genres} {...props} />));
const fillBasics = async (composer = 'Ludwig van Beethoven') => {
  await userEvent.type(screen.getByLabelText('Title'), 'Für Elise');
  await userEvent.type(screen.getByLabelText('Composer'), composer);
};

beforeEach(() => {
  vi.resetAllMocks();
});

describe('SheetUploadForm: đăng mới', () => {
  it('chưa đăng nhập: chỉ mời đăng nhập, không có form', async () => {
    auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
    view();
    expect(screen.getByRole('heading', { name: 'Log in to post a score' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Title')).toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(openAuth).toHaveBeenCalledWith('login');
  });

  it('thiếu PDF: báo lỗi, không gọi API', async () => {
    signIn();
    view();
    await fillBasics();
    await userEvent.click(screen.getByRole('button', { name: 'Post score' }));
    expect(screen.getByText('Choose a PDF file to post.')).toBeInTheDocument();
    expect(api.createMySheet).not.toHaveBeenCalled();
  });

  it('đăng đủ: tạo nháp (tác giả có sẵn gửi composerId, không có giá/HOT) → tải PDF rồi MIDI → đăng → chuyển tới trang bài', async () => {
    signIn();
    api.createMySheet.mockResolvedValue(sheet());
    api.uploadMySheetFile.mockImplementation(async () => sheet());
    api.publishMySheet.mockResolvedValue(sheet({ status: 'PUBLISHED' }));
    view();
    await fillBasics(' ludwig VAN beethoven ');
    await userEvent.selectOptions(screen.getByLabelText('Difficulty level'), 'INTERMEDIATE');
    await userEvent.click(screen.getByRole('checkbox', { name: 'Classical' }));
    await pick(/Score PDF/, file('a.pdf'));
    await pick(/MIDI file/, file('a.mid'));
    await userEvent.click(screen.getByRole('button', { name: 'Post score' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sheet/fur-elise'));
    expect(api.createMySheet).toHaveBeenCalledTimes(1);
    const body = api.createMySheet.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({ title: 'Für Elise', level: 'INTERMEDIATE', composerId: 'c1', genreIds: ['g1'] });
    expect(body).not.toHaveProperty('composerName');
    for (const forbidden of ['isHot', 'isFree', 'seriesId', 'status', 'pricePdfCents']) expect(body).not.toHaveProperty(forbidden);
    expect(api.uploadMySheetFile.mock.calls.map((c) => c[2])).toEqual(['PDF', 'MIDI']);
    expect(api.publishMySheet).toHaveBeenCalledTimes(1);
  });

  it('tác giả mới gửi composerName', async () => {
    signIn();
    api.createMySheet.mockResolvedValue(sheet());
    api.uploadMySheetFile.mockResolvedValue(sheet());
    api.publishMySheet.mockResolvedValue(sheet({ status: 'PUBLISHED' }));
    view();
    await fillBasics('Một tác giả mới');
    await pick(/Score PDF/, file('a.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Post score' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const body = api.createMySheet.mock.calls[0]![1] as Record<string, unknown>;
    expect(body).toMatchObject({ composerName: 'Một tác giả mới' });
    expect(body).not.toHaveProperty('composerId');
  });

  it('lưu bản nháp: tạo và tải file nhưng không đăng, về danh sách của tôi', async () => {
    signIn();
    api.createMySheet.mockResolvedValue(sheet());
    api.uploadMySheetFile.mockResolvedValue(sheet());
    view();
    await fillBasics();
    await pick(/Score PDF/, file('a.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Save as draft' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/my-sheets'));
    expect(api.publishMySheet).not.toHaveBeenCalled();
  });

  it('file quá lớn bị chặn ngay ở trình duyệt; sai theo máy chủ thì báo lỗi ở ô file và Thử lại chạy tiếp từ bước dở (không tạo nháp thứ hai, không tải lại file đã xong)', async () => {
    signIn();
    view();
    await pick(/MIDI file/, file('big.mid', 3 * 1024 * 1024));
    expect(screen.getByText('The file is too large.')).toBeInTheDocument();
    expect(api.uploadMySheetFile).not.toHaveBeenCalled();

    api.createMySheet.mockResolvedValue(sheet());
    api.uploadMySheetFile.mockImplementation(async (_t: string, _id: string, type: string) => {
      if (type === 'MIDI' && api.uploadMySheetFile.mock.calls.filter((c) => c[2] === 'MIDI').length === 1) throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'x');
      return sheet();
    });
    api.publishMySheet.mockResolvedValue(sheet({ status: 'PUBLISHED' }));
    await fillBasics();
    await pick(/Score PDF/, file('a.pdf'));
    await pick(/MIDI file/, file('a.mid', 100));
    await userEvent.click(screen.getByRole('button', { name: 'Post score' }));
    expect((await screen.findAllByText('The file format is not supported.')).length).toBeGreaterThan(0);
    expect(push).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Retry from the unfinished step' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/sheet/fur-elise'));
    expect(api.createMySheet).toHaveBeenCalledTimes(1);
    expect(api.uploadMySheetFile.mock.calls.filter((c) => c[2] === 'PDF')).toHaveLength(1);
    expect(api.uploadMySheetFile.mock.calls.filter((c) => c[2] === 'MIDI')).toHaveLength(2);
  });

  it('lỗi theo trường của máy chủ hiện ngay dưới trường; lỗi mạng hiện thông báo chung', async () => {
    signIn();
    api.createMySheet.mockRejectedValueOnce(new ApiError(400, 'VALIDATION_FAILED', 'x', [{ path: 'title', message: 'Vui lòng nhập tiêu đề.' }]));
    view();
    await fillBasics();
    await pick(/Score PDF/, file('a.pdf'));
    await userEvent.click(screen.getByRole('button', { name: 'Post score' }));
    expect(await screen.findByText('Vui lòng nhập tiêu đề.')).toBeInTheDocument();
    api.createMySheet.mockRejectedValueOnce(new ApiError(0, 'NETWORK_ERROR', 'x'));
    await userEvent.click(screen.getByRole('button', { name: 'Post score' }));
    expect(await screen.findByText('Could not reach the server.')).toBeInTheDocument();
  });
});

describe('SheetUploadForm: sửa bài', () => {
  const edit = () => view({ mode: 'edit', sheetId: ID });

  it('tải bài của tôi và điền sẵn; bài người khác (404) báo không tìm thấy', async () => {
    signIn();
    api.getMySheet.mockResolvedValue(sheet({ status: 'PUBLISHED' }));
    edit();
    expect(await screen.findByDisplayValue('Für Elise')).toBeInTheDocument();
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    expect(screen.getByTestId('sheet-status')).toHaveTextContent('Published');
    expect(screen.getByRole('checkbox', { name: 'Classical' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Unpublish to draft' })).toBeInTheDocument();
  });

  it('không tìm thấy', async () => {
    signIn();
    api.getMySheet.mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'x'));
    edit();
    expect(await screen.findByRole('alert')).toHaveTextContent('Score not found.');
  });

  it('lưu: gửi null cho ô đã xoá (xoá giá trị cũ), không gửi composer nếu không đổi, không có trường cấm', async () => {
    signIn();
    api.getMySheet.mockResolvedValue(sheet());
    api.updateMySheet.mockResolvedValue(sheet({ description: null }));
    edit();
    await screen.findByDisplayValue('Für Elise');
    await userEvent.clear(screen.getByLabelText('Description (optional)'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(api.updateMySheet).toHaveBeenCalled());
    const body = api.updateMySheet.mock.calls[0]![2] as Record<string, unknown>;
    expect(body).toMatchObject({ description: null, subtitle: null, difficultyNote: null, youtubeUrl: null, lyricsChords: null });
    expect(body).not.toHaveProperty('composerId');
    expect(body).not.toHaveProperty('composerName');
    expect(body).not.toHaveProperty('isHot');
    expect(await screen.findByText('Saved')).toBeInTheDocument();
  });

  it('đổi file tải lên ngay (có tiến trình); gỡ file; đăng, gỡ về nháp, xoá có xác nhận', async () => {
    signIn();
    api.getMySheet.mockResolvedValue(sheet({ pdf: { originalName: 'old.pdf', size: 1, uploadedAt: 'x' } as Sheet['pdf'] }));
    api.uploadMySheetFile.mockResolvedValue(sheet({ pdf: { originalName: 'new.pdf', size: 1, uploadedAt: 'x' } as Sheet['pdf'] }));
    api.publishMySheet.mockResolvedValue(sheet({ status: 'PUBLISHED' }));
    api.unpublishMySheet.mockResolvedValue(sheet({ status: 'DRAFT' }));
    api.removeMySheetFile.mockResolvedValue(undefined);
    api.deleteMySheet.mockResolvedValue(undefined);
    edit();
    expect(await screen.findByTestId('pdf-name')).toHaveTextContent('old.pdf');
    await pick(/Score PDF/, file('new.pdf'));
    await waitFor(() => expect(screen.getByTestId('pdf-name')).toHaveTextContent('new.pdf'));
    expect(api.uploadMySheetFile).toHaveBeenCalledWith('tok', ID, 'PDF', expect.objectContaining({ name: 'new.pdf' }), expect.any(Function));
    await userEvent.click(screen.getAllByRole('button', { name: 'Remove file' })[0]!);
    await waitFor(() => expect(api.removeMySheetFile).toHaveBeenCalledWith('tok', ID, 'pdf'));

    await userEvent.click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByTestId('sheet-status')).toHaveTextContent('Published'));
    await userEvent.click(screen.getByRole('button', { name: 'Unpublish to draft' }));
    await waitFor(() => expect(screen.getByTestId('sheet-status')).toHaveTextContent('Draft'));

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(api.deleteMySheet).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/my-sheets'));
    expect(api.deleteMySheet).toHaveBeenCalledWith('tok', ID);
  });

  it('bài bị admin gỡ: nêu rõ, không có nút Đăng/Gỡ, không lưu được', async () => {
    signIn();
    api.getMySheet.mockResolvedValue(sheet({ status: 'ARCHIVED' }));
    edit();
    expect(await screen.findByText(/removed by an administrator/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Unpublish to draft' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('đăng thất bại vì chưa có PDF xử lý xong: báo bằng chữ', async () => {
    signIn();
    api.getMySheet.mockResolvedValue(sheet());
    api.publishMySheet.mockRejectedValue(new ApiError(422, 'VALIDATION_FAILED', 'x'));
    edit();
    await userEvent.click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Upload a processed PDF before posting.')).toBeInTheDocument();
  });
});

