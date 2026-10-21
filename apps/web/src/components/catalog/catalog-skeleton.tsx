import { Skeleton } from '@/components/ui/skeleton';
import { SheetCardSkeleton } from './sheet-card-skeleton';
import { SHEET_GRID_CLASS } from './sheet-grid';

/** Skeleton của các trang lưới Sheet: cột bộ lọc (từ `lg`; dưới `lg` là một nút) và lưới cùng số cột với lưới thật. */
export function CatalogSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-6 px-margin-mobile py-8 md:px-margin-desktop md:py-10 lg:flex-row lg:items-start lg:gap-10">
      <div className="w-full lg:w-72 lg:shrink-0">
        <Skeleton className="h-11 w-full lg:hidden" />
        <div className="hidden flex-col gap-6 lg:flex">
          {[4, 8, 6].map((rows, group) => (
            <div key={group} className="flex flex-col gap-2">
              <Skeleton className="h-5 w-28" />
              {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-gutter">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-12 w-full max-w-xl" />
        <div className={SHEET_GRID_CLASS}>
          {Array.from({ length: 12 }, (_, i) => (
            <SheetCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </div>
  );
}
