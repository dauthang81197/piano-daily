import { useTranslations } from 'next-intl';
import { SearchForm } from '@/components/layout/search-form';
import { Button } from '@/components/ui/button';

/** Đầu trang chủ: tiêu đề serif, ô tìm lớn và 2 nút dẫn vào thư viện / khoá học. */
export function Hero({ locale }: { locale: string }) {
  const t = useTranslations('Home');
  return (
    <section className="flex flex-col items-center gap-6 px-margin-mobile pb-12 pt-16 text-center md:px-margin-desktop md:pb-16 md:pt-24">
      <p className="text-label-caps uppercase text-secondary">{t('eyebrow')}</p>
      <h1 className="font-display text-display-lg-mobile text-primary md:text-display-lg">{t('title')}</h1>
      <p className="max-w-prose text-body-lg text-on-surface-variant">{t('tagline')}</p>
      <SearchForm large className="w-full max-w-xl" />
      <div className="flex flex-wrap justify-center gap-3">
        <Button href={`/${locale}/level/beginner`} size="lg">
          {t('ctaStart')}
        </Button>
        <Button href={`/${locale}/courses`} size="lg" variant="secondary">
          {t('ctaCourses')}
        </Button>
      </div>
    </section>
  );
}
