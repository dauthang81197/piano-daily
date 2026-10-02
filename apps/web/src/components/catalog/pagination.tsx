import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';

const item =
  'inline-flex min-w-10 items-center justify-center rounded-md border px-3 py-2 text-body-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/** Trang hiển thị: đầu, cuối, và lân cận trang hiện tại; `null` là dấu ba chấm. */
export function pageWindow(current: number, total: number): (number | null)[] {
  const pages = new Set([1, total, current - 1, current, current + 1].filter((p) => p >= 1 && p <= total));
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1]! > 1) out.push(null);
    out.push(p);
  });
  return out;
}

/** Phân trang theo số trang: mỗi trang một URL; không có gì để hiện khi chỉ có một trang. */
export function Pagination({
  page,
  pageSize,
  total,
  hrefFor,
}: {
  page: number;
  pageSize: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  const t = useTranslations('Pagination');
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  const idle = `${item} border-outline-variant text-on-surface hover:bg-surface-container-low`;
  return (
    <nav aria-label={t('label')} className="flex flex-wrap items-center justify-center gap-2">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className={idle}>
          {t('previous')}
        </Link>
      ) : null}
      {pageWindow(page, totalPages).map((p, i) =>
        p === null ? (
          <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-on-surface-variant">
            …
          </span>
        ) : (
          <Link
            key={p}
            href={hrefFor(p)}
            aria-label={t('page', { page: p })}
            aria-current={p === page ? 'page' : undefined}
            className={p === page ? `${item} border-primary bg-primary text-on-primary` : idle}
          >
            {p}
          </Link>
        ),
      )}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} rel="next" className={idle}>
          {t('next')}
        </Link>
      ) : null}
    </nav>
  );
}
