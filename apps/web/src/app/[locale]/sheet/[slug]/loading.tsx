import { useTranslations } from 'next-intl';

/** Skeleton: tiêu đề, dòng meta và khung ảnh trang. */
export default function Loading() {
  const t = useTranslations('Sheet');
  return (
    <main
      aria-busy="true"
      aria-label={t('loading')}
      className="mx-auto flex max-w-7xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop"
    >
      <div className="h-5 w-64 animate-pulse rounded-sm bg-surface-container" />
      <div className="h-12 w-2/3 animate-pulse rounded-sm bg-surface-container" />
      <div className="h-6 w-1/2 animate-pulse rounded-sm bg-surface-container" />
      <div className="aspect-[3/4] w-full max-w-3xl animate-pulse rounded-md bg-surface-container" />
    </main>
  );
}
