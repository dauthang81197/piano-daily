import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { SheetDetail } from '@/components/sheet/sheet-detail';
import { routing } from '@/i18n/routing';
import { fetchPreviewSheet } from '@/lib/catalog';

// Dữ liệu Draft và token theo từng request: tuyệt đối không render tĩnh hay cache.
export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const firstToken = (raw: string | string[] | undefined) => (Array.isArray(raw) ? raw[0] : raw)?.trim() || undefined;

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { locale, id } = await params;
  const robots = { index: false, follow: false } as const;
  const token = firstToken((await searchParams).token);
  if (!hasLocale(routing.locales, locale) || !UUID.test(id) || !token) return { robots };
  // Lỗi hạ tầng ở bước metadata không được làm mất `noindex`; trang chính sẽ tự xử lý lỗi.
  const sheet = await fetchPreviewSheet(id, token).catch(() => null);
  if (!sheet) return { robots };
  const t = await getTranslations({ locale, namespace: 'Preview' });
  // Không `alternates`/hreflang: trang này không bao giờ được index.
  return { title: t('title', { title: sheet.title }), robots };
}

export default async function PreviewSheetPage({ params, searchParams }: Props) {
  const { locale, id } = await params;
  const token = firstToken((await searchParams).token);
  if (!hasLocale(routing.locales, locale) || !UUID.test(id) || !token) notFound();
  setRequestLocale(locale);

  const sheet = await fetchPreviewSheet(id, token);
  // Mọi lỗi token (sai, hết hạn, khác Sheet) và Sheet không tồn tại đều là 404 giống nhau.
  if (!sheet) notFound();

  const t = await getTranslations('Preview');
  return (
    <>
      <div role="status" className="border-b-2 border-secondary bg-surface-container-high px-margin-mobile py-2 text-center text-body-md font-semibold text-on-surface md:px-margin-desktop">
        {t('banner')}
      </div>
      {/* Cùng `SheetDetail` của trang công khai; cố ý KHÔNG có `ViewBeacon` nên không đếm lượt xem. */}
      <SheetDetail sheet={sheet} />
    </>
  );
}
