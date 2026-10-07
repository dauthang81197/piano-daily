import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';
import { routing } from '@/i18n/routing';
import { fetchSheetDetail } from '@/lib/catalog';

/**
 * Kiểm tra tồn tại ở layout để Next trả HTTP 404 thật: `notFound()` trong trang xảy ra sau khi shell đã flush nên
 * trạng thái đã là 200 (soft 404). Cùng cách với `LevelLayout`. Fetch cùng URL/tag với trang nên Next gộp request.
 */
export default async function SheetLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  // Locale lạ thì 404 ngay, không tốn một lần gọi API.
  if (!hasLocale(routing.locales, locale)) notFound();
  if (!(await fetchSheetDetail(slug))) notFound();
  return children;
}
