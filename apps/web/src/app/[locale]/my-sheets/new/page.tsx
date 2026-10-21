import type { Facets } from '@piano-daily/shared';
import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SheetUploadForm } from '@/components/member-sheets/sheet-upload-form';
import { PageHeader } from '@/components/ui/page-header';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { fetchFacets } from '@/lib/catalog';

// Không prerender lúc build (build không có API): gợi ý tác giả/thể loại lấy lúc yêu cầu (vẫn qua data cache có tag).
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const t = await getTranslations({ locale, namespace: 'MySheets' });
  return { title: t('newTitle'), robots: { index: false, follow: false } };
}

/** Gợi ý tác giả/thể loại từ danh mục công khai; lỗi API thì form vẫn dùng được (gõ tên tác giả mới, không chọn thể loại). */
async function options(): Promise<Pick<Facets, 'genres' | 'composers'>> {
  try {
    return await fetchFacets();
  } catch (error) {
    console.error('Không tải được gợi ý tác giả/thể loại cho form đăng bản nhạc', error);
    return { genres: [], composers: [] };
  }
}

export default async function NewMySheetPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const [t, facets] = await Promise.all([getTranslations({ locale, namespace: 'MySheets' }), options()]);
  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-8 px-margin-mobile py-section-gap md:px-margin-desktop">
      <PageHeader title={t('newTitle')}>
        <div>
          <Link href="/my-sheets" className="text-body-md text-primary underline underline-offset-4">
            {t('back')}
          </Link>
        </div>
      </PageHeader>
      <SheetUploadForm mode="create" composers={facets.composers} genres={facets.genres} />
    </main>
  );
}
