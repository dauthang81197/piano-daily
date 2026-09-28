'use client';

import { FileMusic, LayoutDashboard, type LucideIcon, Megaphone, Receipt, Settings, Tags } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

export type AdminNavItem = { href: string; label: string; icon: LucideIcon };

/** 6 mục điều hướng của khu quản trị (UX: sidebar admin). */
export const ADMIN_NAV_ITEMS: readonly AdminNavItem[] = [
  { href: '/', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/sheets', label: 'Sheet', icon: FileMusic },
  { href: '/taxonomy', label: 'Composer/Genre/Series', icon: Tags },
  { href: '/ads', label: 'Quảng cáo', icon: Megaphone },
  { href: '/orders', label: 'Đơn hàng', icon: Receipt },
  { href: '/settings', label: 'Cài đặt', icon: Settings },
];

export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="flex flex-col gap-1 px-6 py-6">
        <span className="font-display text-headline-sm text-primary">Piano Daily</span>
        <span className="text-label-caps uppercase text-secondary">Quản trị</span>
      </div>
      <nav aria-label="Điều hướng quản trị" className="flex-1 px-3">
        <ul className="flex flex-col gap-1">
          {ADMIN_NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const active = isNavItemActive(href, pathname);
            return (
              <li key={href}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors outline-none',
                    'focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-on-surface-variant hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <Icon aria-hidden="true" className="size-4 shrink-0" />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
