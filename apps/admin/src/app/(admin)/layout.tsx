'use client';

import type { ReactNode } from 'react';
import { AdminHeader } from '@/components/admin-header';
import { AdminSidebar } from '@/components/admin-sidebar';
import { AuthGate } from '@/components/auth-gate';

/** Khung khu quản trị: mọi route trong nhóm `(admin)` nằm sau `AuthGate` (dữ liệu chỉ fetch phía client). */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-screen">
        <AdminSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <AdminHeader />
          <main className="flex-1 px-8 py-8">{children}</main>
        </div>
      </div>
    </AuthGate>
  );
}
