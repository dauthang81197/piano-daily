'use client';

import { TriangleAlert } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect } from 'react';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

/** Lỗi runtime của một trang: vẫn trong khung site (header/footer), có "Thử lại" (tải lại dữ liệu của đoạn) và "Về trang chủ". */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations('Error');
  const locale = useLocale();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <StatusPage icon={TriangleAlert} title={t('title')} description={t('description')}>
      <Button onClick={() => retry()}>{t('retry')}</Button>
      <Button href={`/${locale}`} variant="secondary">
        {t('backHome')}
      </Button>
    </StatusPage>
  );
}
