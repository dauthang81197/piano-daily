'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect, useState } from 'react';
import { FormError } from '@/components/form-error';
import { LoadingScreen } from '@/components/loading-screen';
import { Button } from '@/components/ui/button';
import { isApiError } from '@/lib/api/http';
import { useAuth } from '@/lib/auth/auth-provider';
import { loginUrlFor } from '@/lib/auth/redirect';

/**
 * Bảo vệ route admin (AD-13): khi chưa xác định được phiên chỉ hiện trạng thái đang tải, không render nội dung.
 * - Mount với phiên `unknown` -> khôi phục bằng `/auth/refresh` (cookie httpOnly).
 * - Phiên `anonymous` -> chuyển `/login?next=<route>` (hoặc `/login` sau đăng xuất / đổi mật khẩu).
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { state, restore } = useAuth();
  const router = useRouter();
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (state.status !== 'unknown') return;
    let cancelled = false;
    restore().catch((err: unknown) => {
      if (cancelled) return;
      setRestoreError(
        isApiError(err) && err.code === 'NETWORK_ERROR'
          ? err.message
          : 'Không xác minh được phiên đăng nhập. Vui lòng thử lại.',
      );
    });
    return () => {
      cancelled = true;
    };
  }, [state.status, restore, attempt]);

  useEffect(() => {
    if (state.status !== 'anonymous') return;
    router.replace(loginUrlFor(state.reason, `${window.location.pathname}${window.location.search}`));
  }, [state, router]);

  if (state.status === 'authenticated') return <>{children}</>;

  if (state.status === 'unknown' && restoreError) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-margin-mobile">
        <FormError>{restoreError}</FormError>
        <div>
          <Button
            onClick={() => {
              setRestoreError(null);
              setAttempt((n) => n + 1);
            }}
          >
            Thử lại
          </Button>
        </div>
      </main>
    );
  }

  return <LoadingScreen />;
}
