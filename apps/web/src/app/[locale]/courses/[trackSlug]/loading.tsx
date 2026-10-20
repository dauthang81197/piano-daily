import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton của trang khoá và trang bài học: tiêu đề, thẻ bên phải, khối nội dung. */
export default function Loading() {
  const t = useTranslations('Courses');
  return (
    <main
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <Skeleton className="h-5 w-64 max-w-full" />
      <div className="flex flex-col gap-6 lg:flex-row lg:justify-between lg:gap-12">
        <div className="flex flex-col gap-3 lg:flex-1">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-6 w-1/2" />
        </div>
        <Skeleton className="h-28 w-full rounded-xl lg:w-80" />
      </div>
      <Skeleton className="h-64 w-full rounded-xl" />
    </main>
  );
}
