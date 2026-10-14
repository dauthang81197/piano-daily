'use client';

import { type CustomerSession, type CustomerUser, type Entitlement, PAYWALL_REASONS } from '@piano-daily/shared';
import { useLocale } from 'next-intl';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { customerApi } from '@/lib/customer-api';
import { navigateTo } from '@/lib/navigate';
import { ApiError } from '@/lib/public-api';
import { AuthModal, type AuthTab } from './auth-modal';

export type DownloadResult = 'started' | 'needsLogin' | 'needsVerification' | 'paywall' | 'error';

type AuthState = {
  /** `loading` cho tới khi thử khôi phục phiên từ cookie refresh xong. */
  status: 'loading' | 'anonymous' | 'authenticated';
  customer: CustomerUser | null;
  /** Trạng thái dùng thử/gói của khách đang đăng nhập; `null` khi chưa tải được hoặc chưa đăng nhập. */
  entitlement: Entitlement | null;
  /** Access token còn hạn (tự làm mới); `null` khi chưa đăng nhập. Dùng cho các lời gọi API của khách ngoài tải file. */
  getToken: () => Promise<string | null>;
  /** Cập nhật trạng thái dùng thử/gói ngay (vd. sau khi mua gói thành công). */
  applyEntitlement: (next: Entitlement) => void;
  /** Mở modal đăng nhập (tab mặc định `login`). */
  openAuth: (tab?: AuthTab) => void;
  /** Nhận phiên mới sau đăng nhập; modal gọi. */
  acceptSession: (session: CustomerSession) => void;
  logout: () => Promise<void>;
  /** Xin signed URL rồi điều hướng tới file. Chưa đăng nhập → mở modal; chưa xác minh → mở modal ở tab xác minh. */
  download: (sheetId: string, fileType: string) => Promise<DownloadResult>;
};

const AuthContext = createContext<AuthState | null>(null);

/** `null` ngoài `AuthProvider` (vd. test hay trang không bọc): các component dùng nó tự ẩn hoặc lùi về hành vi khách. */
export function useCustomer(): AuthState | null {
  return useContext(AuthContext);
}

/**
 * Refresh token xoay vòng nên hai tab refresh cùng lúc thì tab chậm gửi token vừa bị thu hồi. Khoá liên tab (Web Locks)
 * xếp hàng các lần refresh: tab sau chạy khi cookie mới đã được trình duyệt lưu. Trình duyệt không có Web Locks thì chạy thẳng.
 */
function withRefreshLock<T>(fn: () => Promise<T>): Promise<T> {
  const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
  return locks ? locks.request('piano-daily:customer-refresh', fn) : fn();
}

/** Làm mới access token sớm hơn hạn 30 giây để request đang bay không hết hạn giữa chừng. */
const EXPIRY_MARGIN_MS = 30_000;

/**
 * Giữ phiên đăng nhập của khách trong bộ nhớ: access token KHÔNG bao giờ vào localStorage/cookie; mất khi tải lại trang
 * và được khôi phục bằng cookie refresh HttpOnly (`POST /customer/auth/refresh`).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const router = useRouter();
  const [entitlement, setEntitlement] = useState<Entitlement | null>(null);
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [customer, setCustomer] = useState<CustomerUser | null>(null);
  const [modalTab, setModalTab] = useState<AuthTab | null>(null);
  const session = useRef<{ accessToken: string; expiresAt: number } | null>(null);
  const customerIdRef = useRef<string | null>(null);
  const pendingRefresh = useRef<Promise<string | null> | null>(null);
  /** Lượt tải bị chặn vì chưa đăng nhập: tự chạy lại ngay sau khi đăng nhập xong. */
  const pendingDownload = useRef<{ sheetId: string; fileType: string } | null>(null);
  const downloadRef = useRef<AuthState['download'] | null>(null);

  const accept = useCallback((next: CustomerSession) => {
    session.current = { accessToken: next.accessToken, expiresAt: Date.now() + next.expiresIn * 1000 };
    setCustomer(next.user);
    setStatus('authenticated');
  }, []);

  const clear = useCallback(() => {
    session.current = null;
    setCustomer(null);
    setEntitlement(null);
    setStatus('anonymous');
  }, []);

  /** Một lần refresh tại một thời điểm (refresh token xoay vòng nên hai lần đồng thời sẽ tự loại nhau). */
  const refresh = useCallback((): Promise<string | null> => {
    pendingRefresh.current ??= withRefreshLock(() => customerApi.refresh())
      .then((next) => {
        accept(next);
        return next.accessToken;
      })
      .catch(() => {
        clear();
        return null;
      })
      .finally(() => {
        pendingRefresh.current = null;
      });
    return pendingRefresh.current;
  }, [accept, clear]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const validToken = useCallback(async (): Promise<string | null> => {
    const current = session.current;
    if (current && current.expiresAt - Date.now() > EXPIRY_MARGIN_MS) return current.accessToken;
    return refresh();
  }, [refresh]);

  /** Tải lại trạng thái dùng thử/gói; lỗi thì giữ giá trị cũ (chỉ là thông tin hiển thị, không quyết định quyền tải). */
  const loadEntitlement = useCallback(async () => {
    const token = await validToken();
    if (!token) return;
    const asked = customerIdRef.current;
    try {
      const next = await customerApi.entitlement(token);
      // Bỏ kết quả trễ nếu trong lúc chờ đã đăng xuất hoặc đổi khách (không để trạng thái người trước hiện cho người sau).
      if (customerIdRef.current === asked) setEntitlement(next);
    } catch {
      /* giữ nguyên */
    }
  }, [validToken]);

  const customerId = customer?.id ?? null;
  customerIdRef.current = customerId;
  useEffect(() => {
    if (customerId) void loadEntitlement();
  }, [customerId, loadEntitlement]);

  const openAuth = useCallback((tab: AuthTab = 'login') => setModalTab(tab), []);

  const logout = useCallback(async () => {
    try {
      await customerApi.logout();
    } finally {
      clear();
    }
  }, [clear]);

  const download = useCallback<AuthState['download']>(
    async (sheetId, fileType) => {
      const token = await validToken();
      if (!token) {
        pendingDownload.current = { sheetId, fileType };
        setModalTab('login');
        return 'needsLogin';
      }
      try {
        const { url } = await customerApi.download(token, sheetId, fileType);
        navigateTo(url);
        void loadEntitlement();
        return 'started';
      } catch (err) {
        // 402: hết dùng thử / hết lượt / cần gói → chuyển sang trang chọn gói kèm lý do.
        // Chỉ ba mã paywall mới chuyển sang trang giá; 402 khác là lỗi chung (không gán nhầm thành hết dùng thử).
        if (err instanceof ApiError && err.status === 402 && (PAYWALL_REASONS as readonly string[]).includes(err.code)) {
          void loadEntitlement();
          router.push(`/pricing?reason=${err.code}`);
          return 'paywall';
        }
        if (err instanceof ApiError && err.code === 'EMAIL_NOT_VERIFIED') {
          setModalTab('verify');
          return 'needsVerification';
        }
        if (err instanceof ApiError && err.status === 401) {
          clear();
          pendingDownload.current = { sheetId, fileType };
          setModalTab('login');
          return 'needsLogin';
        }
        return 'error';
      }
    },
    [clear, loadEntitlement, router, validToken],
  );

  downloadRef.current = download;

  /** Phiên mới từ modal: nếu có lượt tải đang chờ thì chạy tiếp để khách không phải bấm lại nút Tải. */
  const acceptSession = useCallback(
    (next: CustomerSession) => {
      accept(next);
      const pending = pendingDownload.current;
      pendingDownload.current = null;
      if (pending) setTimeout(() => void downloadRef.current?.(pending.sheetId, pending.fileType), 0);
    },
    [accept],
  );

  const value = useMemo<AuthState>(
    () => ({ status, customer, entitlement, getToken: validToken, applyEntitlement: setEntitlement, openAuth, acceptSession, logout, download }),
    [status, customer, entitlement, validToken, openAuth, acceptSession, logout, download],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      {modalTab ? (
        <AuthModal
          key={modalTab}
          initialTab={modalTab}
          defaultEmail={customer?.email ?? ''}
          locale={locale === 'en' ? 'en' : 'vi'}
          onSession={acceptSession}
          onClose={() => {
            pendingDownload.current = null;
            setModalTab(null);
          }}
        />
      ) : null}
    </AuthContext.Provider>
  );
}
