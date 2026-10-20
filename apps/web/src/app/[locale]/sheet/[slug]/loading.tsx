import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton theo bố cục trang: tiêu đề + thẻ thông tin, player, hai trang ảnh. */
export default function Loading() {
  const t = useTranslations('Sheet');
  return (
    <main
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <Skeleton className="h-5 w-64 max-w-full" />
      <div className="flex flex-col gap-6 lg:flex-row lg:justify-between lg:gap-12">
        <div className="flex flex-col gap-4 lg:flex-1">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <Skeleton className="h-48 w-full rounded-xl lg:w-96" />
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="aspect-[3/4] w-full" />
        <Skeleton className="aspect-[3/4] w-full" />
      </div>
    </main>
  );
}
