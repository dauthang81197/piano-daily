import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton của `/courses`: khối giới thiệu và lưới thẻ nhánh. */
export default function Loading() {
  const t = useTranslations('Courses');
  return (
    <main
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto flex max-w-7xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <Skeleton className="h-48 w-full rounded-xl md:h-56" />
      <div className="grid gap-gutter md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </main>
  );
}
