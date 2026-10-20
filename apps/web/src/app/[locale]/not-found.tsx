import { Compass } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  const t = useTranslations('NotFound');
  const locale = useLocale();
  return (
    <StatusPage icon={Compass} title={t('title')} description={t('description')}>
      <Button href={`/${locale}`}>{t('backHome')}</Button>
    </StatusPage>
  );
}
