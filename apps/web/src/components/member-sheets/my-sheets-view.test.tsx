import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MemberSheetListItem } from '@piano-daily/shared';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withIntl } from '@/components/layout/test-utils';
import { ApiError } from '@/lib/public-api';

const { auth, api, openAuth } = vi.hoisted(() => ({
  auth: { value: null as unknown },
  api: { listMySheets: vi.fn(), publishMySheet: vi.fn(), unpublishMySheet: vi.fn(), deleteMySheet: vi.fn() },
  openAuth: vi.fn(),
}));
vi.mock('@/components/auth/auth-provider', () => ({ useCustomer: () => auth.value }));
vi.mock('@/lib/customer-api', () => ({ customerApi: api }));
vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { MySheetsView } from './my-sheets-view';

const item = (over: Partial<MemberSheetListItem> = {}): MemberSheetListItem => ({
  id: '0195b0f0-0000-7000-8000-000000000001',
  slug: 'fur-elise',
  title: 'Für Elise',
  status: 'PUBLISHED',
  level: 'BEGINNER',
  composer: { id: 'c', name: 'Beethoven' },
  thumbnailUrl: null,
  pageCount: 2,
  hasMidi: true,
  hasMp3: false,
  viewCount: 7,
  createdAt: '2026-10-21T00:00:00.000Z',
  updatedAt: '2026-10-21T00:00:00.000Z',
  ...over,
});
const signIn = () => {
  auth.value = { status: 'authenticated', customer: { id: 'c' }, getToken: async () => 'tok', openAuth };
};
const view = () => render(withIntl(<MySheetsView />));

beforeEach(() => vi.resetAllMocks());

describe('MySheetsView', () => {
  it('chưa đăng nhập: mời đăng nhập, không gọi API', async () => {
    auth.value = { status: 'anonymous', customer: null, getToken: async () => null, openAuth };
    view();
    expect(screen.getByRole('heading', { name: 'Log in to post a score' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Log in' }));
    expect(openAuth).toHaveBeenCalledWith('login');
    expect(api.listMySheets).not.toHaveBeenCalled();
  });

  it('chưa có bài: trạng thái rỗng kèm nút đăng', async () => {
    signIn();
    api.listMySheets.mockResolvedValue([]);
    view();
    expect(await screen.findByText('You have not posted any score yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Post a score' })).toHaveAttribute('href', '/my-sheets/new');
  });

  it('liệt kê bài với trạng thái, thông tin, link xem (chỉ khi đã đăng) và sửa', async () => {
    signIn();
    api.listMySheets.mockResolvedValue([item(), item({ id: 'b', slug: 'nhap', title: 'Bản nháp', status: 'DRAFT' }), item({ id: 'c', slug: 'go', title: 'Bị gỡ', status: 'ARCHIVED' })]);
    view();
    const rows = await screen.findAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(within(rows[0]!).getByText('Published')).toBeInTheDocument();
    expect(within(rows[0]!).getByText(/Beethoven · Beginner · 2 pages · 7 views/)).toBeInTheDocument();
    expect(within(rows[0]!).getByRole('link', { name: 'View' })).toHaveAttribute('href', '/sheet/fur-elise');
    expect(within(rows[0]!).getByRole('link', { name: 'Edit' })).toHaveAttribute('href', '/my-sheets/0195b0f0-0000-7000-8000-000000000001');
    expect(within(rows[1]!).queryByRole('link', { name: 'View' })).toBeNull();
    expect(within(rows[1]!).getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(within(rows[2]!).getByText('Removed by admin')).toBeInTheDocument();
    expect(within(rows[2]!).queryByRole('button', { name: 'Publish' })).toBeNull();
    expect(within(rows[2]!).queryByRole('button', { name: 'Unpublish to draft' })).toBeNull();
  });

  it('gỡ về nháp: gọi API rồi tải lại danh sách', async () => {
    signIn();
    api.listMySheets.mockResolvedValueOnce([item()]).mockResolvedValueOnce([item({ status: 'DRAFT' })]);
    api.unpublishMySheet.mockResolvedValue({});
    view();
    await userEvent.click(await screen.findByRole('button', { name: 'Unpublish to draft' }));
    await waitFor(() => expect(api.unpublishMySheet).toHaveBeenCalledWith('tok', '0195b0f0-0000-7000-8000-000000000001'));
    expect(await screen.findByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(api.listMySheets).toHaveBeenCalledTimes(2);
  });

  it('xoá cần xác nhận; huỷ thì không gọi API; xác nhận thì xoá rồi tải lại', async () => {
    signIn();
    api.listMySheets.mockResolvedValueOnce([item()]).mockResolvedValueOnce([]);
    api.deleteMySheet.mockResolvedValue(undefined);
    view();
    await userEvent.click(await screen.findByRole('button', { name: 'Delete' }));
    expect(screen.getByText('Delete this score? This cannot be undone.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(api.deleteMySheet).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete for good' }));
    await waitFor(() => expect(api.deleteMySheet).toHaveBeenCalled());
    expect(await screen.findByText('You have not posted any score yet')).toBeInTheDocument();
  });

  it('lỗi tải hoặc thao tác: báo bằng chữ, không vỡ', async () => {
    signIn();
    api.listMySheets.mockRejectedValue(new ApiError(0, 'NETWORK_ERROR', 'x'));
    view();
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not reach the server.');
  });
});
