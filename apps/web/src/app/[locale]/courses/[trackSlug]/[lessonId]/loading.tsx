import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton của trang bài học: tiêu đề, khối video/nội dung và mục lục bên phải từ `lg`. */
export default function Loading() {
  const t = useTranslations('Courses');
  return (
    <main
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto flex max-w-7xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <Skeleton className="h-5 w-64 max-w-full" />
      <div className="flex flex-col gap-gutter lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-col gap-6 lg:flex-1">
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="aspect-video w-full rounded-xl" />
          <Skeleton className="h-32 w-full" />
        </div>
        <Skeleton className="h-72 w-full rounded-xl lg:w-80 lg:shrink-0" />
      </div>
    </main>
  );
}
