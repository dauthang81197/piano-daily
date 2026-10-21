import { Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import type { FilterGroup, FilterItem } from '@/lib/filter-groups';
import { cn } from '@/lib/cn';

/** Số mục hiện sẵn mỗi nhóm; phần còn lại nằm sau "Xem tất cả" (mục đang chọn luôn hiện). */
export const FILTER_VISIBLE = 8;

function Item({ item }: { item: FilterItem }) {
  const t = useTranslations('Filters');
  return (
    <li>
      <Link
        href={item.href}
        scroll={false}
        aria-current={item.selected ? 'true' : undefined}
        className="flex min-h-11 items-center gap-3 rounded-md px-2 py-1.5 text-body-md text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        {/* Ô chọn chỉ là hình minh hoạ: trạng thái do `aria-current` và chữ ẩn bên dưới truyền đạt. */}
        <span
          aria-hidden="true"
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded-sm border',
            item.selected ? 'border-secondary-strong bg-secondary-strong text-on-secondary' : 'border-outline bg-surface-bright',
          )}
        >
          {item.selected ? <Check className="size-3.5" strokeWidth={3} /> : null}
        </span>
        <span className={cn('min-w-0 flex-1 break-words', item.selected && 'font-semibold')}>{item.label}</span>
        {item.count !== undefined ? <span className="shrink-0 text-caption tabular-nums text-on-surface-variant">{item.count.toLocaleString('en-US')}</span> : null}
        {item.selected ? <span className="sr-only">{t('selected')}</span> : null}
      </Link>
    </li>
  );
}

/**
 * Bộ lọc cột trái (server component): mỗi nhóm là danh sách link, mỗi nhóm chọn tối đa một mục. Nhóm dài hiện
 * `FILTER_VISIBLE` mục đầu và "Xem tất cả" bằng `<details>` (không cần JS).
 */
export function FilterSidebar({ groups }: { groups: FilterGroup[] }) {
  const t = useTranslations('Filters');
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => {
        const head = group.items.slice(0, FILTER_VISIBLE);
        const rest = group.items.slice(FILTER_VISIBLE);
        const pinned = rest.filter((item) => item.selected);
        const hidden = rest.filter((item) => !item.selected);
        return (
          <section key={group.id} aria-labelledby={`filter-${group.id}`} className="flex flex-col gap-1">
            <h3 id={`filter-${group.id}`} className="px-2 pb-1 text-body-md font-semibold text-on-surface">
              {group.title}
            </h3>
            <ul className="flex flex-col">
              {[...head, ...pinned].map((item) => (
                <Item key={item.key} item={item} />
              ))}
            </ul>
            {hidden.length > 0 ? (
              <details className="group/more">
                <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-md px-2 text-body-md font-semibold text-primary hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary [&::-webkit-details-marker]:hidden">
                  <span className="group-open/more:hidden">{t('showAll', { count: hidden.length })}</span>
                  <span className="hidden group-open/more:inline">{t('showLess')}</span>
                </summary>
                <ul className="flex flex-col">
                  {hidden.map((item) => (
                    <Item key={item.key} item={item} />
                  ))}
                </ul>
              </details>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
