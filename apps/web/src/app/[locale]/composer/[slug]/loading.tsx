import { useTranslations } from 'next-intl';
import { CatalogSkeleton } from '@/components/catalog/catalog-skeleton';

/** Skeleton theo bố cục hai cột (bộ lọc | lưới). */
export default function Loading() {
  const t = useTranslations('Composer');
  return <CatalogSkeleton label={t('loading')} />;
}
