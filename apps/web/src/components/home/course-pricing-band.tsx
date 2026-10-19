import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/** Hai khối mời học và xem gói; khối khoá học ẩn khi chưa có khoá nào công khai. */
export function CoursePricingBand({ locale, showCourses }: { locale: string; showCourses: boolean }) {
  const t = useTranslations('Home');
  return (
    <section className={`mx-auto grid w-full max-w-7xl gap-gutter px-margin-mobile md:px-margin-desktop ${showCourses ? 'md:grid-cols-2' : ''}`}>
      {showCourses ? (
        <Card className="flex flex-col items-start gap-4 bg-surface-container-low p-8">
          <h2 className="font-display text-headline-md text-on-surface">{t('coursesTitle')}</h2>
          <p className="text-body-lg text-on-surface-variant">{t('coursesBody')}</p>
          <Button href={`/${locale}/courses`}>{t('coursesCta')}</Button>
        </Card>
      ) : null}
      <Card className="flex flex-col items-start gap-4 bg-surface-container-low p-8">
        <h2 className="font-display text-headline-md text-on-surface">{t('pricingTitle')}</h2>
        <p className="text-body-lg text-on-surface-variant">{t('pricingBody')}</p>
        <Button href={`/${locale}/pricing`} variant="secondary">
          {t('pricingCta')}
        </Button>
      </Card>
    </section>
  );
}
