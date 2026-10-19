import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton đúng hình dạng `SheetCard` (ngang ở `< sm`, dọc từ `sm`). */
export function SheetCardSkeleton() {
  return (
    <Card data-testid="sheet-card-skeleton" aria-hidden="true" className="flex flex-row overflow-hidden sm:flex-col">
      <div className="w-28 shrink-0 p-3 sm:w-full sm:bg-surface-container sm:p-4">
        <Skeleton className="aspect-[4/5] w-full rounded-sm bg-surface-container-high" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="mt-auto h-4 w-2/3" />
      </div>
    </Card>
  );
}
