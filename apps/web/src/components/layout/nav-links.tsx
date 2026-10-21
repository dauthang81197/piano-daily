'use client';

import { useTranslations } from 'next-intl';
import { Link, usePathname } from '@/i18n/navigation';
import { cn } from '@/lib/cn';
import { paymentsEnabled } from '@/lib/public-env';

/** Link đang ở đúng trang hoặc trang con của nó (`/level/beginner` khớp `/level/beginner?page=2` và con). */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Nhóm trang thuộc mục "Bản nhạc": danh sách, tìm kiếm, theo level/thể loại/tác giả và chi tiết Sheet. */
const SCORES_PREFIXES = ['/search', '/level', '/genre', '/composer', '/sheet'] as const;

const barLink =
  'whitespace-nowrap rounded-md px-3 py-2.5 text-body-md text-on-surface transition-colors hover:text-primary ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';
const stackLink =
  'block min-h-11 rounded-md px-3 py-3 text-body-md text-on-surface hover:bg-surface-container-low ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/**
 * Điều hướng chính: Bản nhạc, Khoá học (+ Bảng giá khi thanh toán bật, + Trang chủ ở dạng `stack` cho mobile).
 * Link của trang hiện tại có `aria-current="page"` và tô brass; "Bản nhạc" sáng ở mọi trang thuộc nhóm Sheet.
 */
export function PrimaryNav({
  variant,
  onNavigate,
  className,
}: {
  variant: 'bar' | 'stack';
  onNavigate?: () => void;
  className?: string;
}) {
  const t = useTranslations('Nav');
  const pathname = usePathname();
  const items: { href: string; label: string; match: readonly string[] }[] = [
    ...(variant === 'stack' ? [{ href: '/', label: t('home'), match: ['/'] }] : []),
    { href: '/search', label: t('scores'), match: SCORES_PREFIXES },
    { href: '/courses', label: t('courses'), match: ['/courses'] },
    ...(paymentsEnabled() ? [{ href: '/pricing', label: t('pricing'), match: ['/pricing'] }] : []),
  ];
  return (
    <nav aria-label={t('primary')} className={cn(variant === 'bar' ? 'flex items-center gap-1' : 'flex flex-col gap-1', className)}>
      {items.map((item) => {
        const active = item.match.some((prefix) => isActivePath(pathname, prefix));
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            onClick={onNavigate}
            className={cn(variant === 'bar' ? barLink : stackLink, active && 'font-semibold text-secondary-strong')}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
