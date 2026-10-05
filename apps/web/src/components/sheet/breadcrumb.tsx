import { Link } from '@/i18n/navigation';

export interface Crumb {
  label: string;
  href?: string | undefined;
}

const link =
  'rounded-sm underline-offset-4 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/** Breadcrumb: mọi mục là link trừ mục cuối (trang hiện tại, `aria-current="page"`). */
export function Breadcrumb({ items, label }: { items: Crumb[]; label: string }) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-on-surface-variant">
        {items.map((item, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${item.label}`} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className={link}>
                  {item.label}
                </Link>
              ) : (
                <span aria-current={last ? 'page' : undefined} className={last ? 'text-on-surface' : undefined}>
                  {item.label}
                </span>
              )}
              {last ? null : <span aria-hidden="true">›</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
