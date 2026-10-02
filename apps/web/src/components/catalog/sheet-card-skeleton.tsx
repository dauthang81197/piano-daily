/** Skeleton đúng hình dạng `SheetCard`. */
export function SheetCardSkeleton() {
  return (
    <div
      data-testid="sheet-card-skeleton"
      aria-hidden="true"
      className="animate-pulse rounded-md border border-outline-variant bg-surface-container-low"
    >
      <div className="aspect-[3/4] rounded-t-md bg-surface-container" />
      <div className="flex flex-col gap-2 p-4">
        <div className="h-6 w-3/4 rounded-sm bg-surface-container" />
        <div className="h-4 w-1/2 rounded-sm bg-surface-container" />
        <div className="h-3 w-2/3 rounded-sm bg-surface-container" />
      </div>
    </div>
  );
}
