'use client';

import { KeyRound, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { buttonVariants } from '@/components/ui/button';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth/auth-provider';

/** Header khu quản trị: tên admin, link đổi mật khẩu, nút đăng xuất. */
export function AdminHeader() {
  const { user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <header className="flex items-center justify-end gap-4 border-b border-outline-variant bg-surface px-8 py-3">
      <span className="text-sm text-on-surface-variant">
        Xin chào, <span className="font-medium text-on-surface">{user?.name}</span>
      </span>
      <Link href="/account/password" className={buttonVariants({ variant: 'ghost' })}>
        <KeyRound aria-hidden="true" />
        Đổi mật khẩu
      </Link>
      <Button
        variant="outline"
        disabled={signingOut}
        onClick={() => {
          setSigningOut(true);
          // Lỗi mạng vẫn xoá phiên cục bộ; AuthGate đưa về /login.
          logout()
            .catch(() => {})
            .finally(() => setSigningOut(false));
        }}
      >
        <LogOut aria-hidden="true" />
        {signingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}
      </Button>
    </header>
  );
}
