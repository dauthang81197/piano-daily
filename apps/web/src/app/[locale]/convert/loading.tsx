import { useTranslations } from 'next-intl';
import { Skeleton } from '@/components/ui/skeleton';

/** Skeleton: tiêu đề và thẻ form. */
export default function Loading() {
  const t = useTranslations('Convert');
  return (
    <main
      aria-busy="true"
      aria-label={t('loadingPage')}
      className="mx-auto flex max-w-5xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-6 w-1/2" />
      </div>
      <Skeleton className="h-80 w-full rounded-xl" />
    </main>
  );
}
