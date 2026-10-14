import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { LessonView } from '@/components/courses/lesson-view';
import { routing } from '@/i18n/routing';
import { fetchLesson } from '@/lib/courses';
import { pageMetadata } from '@/lib/seo';

// Không prerender lúc build (build không có API); dữ liệu vẫn qua data cache có tag `courses`.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; trackSlug: string; lessonId: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, trackSlug, lessonId } = await params;
  if (!hasLocale(routing.locales, locale)) return {};
  const lesson = await fetchLesson(trackSlug, lessonId);
  if (!lesson) return {};
  // Mô tả meta chỉ lấy đầu nội dung (nội dung tới 20.000 ký tự), bỏ ký hiệu Markdown thô.
  const summary = lesson.content.slice(0, 600).replace(/[#*_`>[\]()-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160);
  return pageMetadata({
    locale,
    path: `/courses/${encodeURIComponent(lesson.track.slug)}/${lesson.id}`,
    title: `${lesson.title} | ${lesson.track.title}`,
    description: summary || `${lesson.title} (${lesson.track.title})`,
  });
}

export default async function LessonPage({ params }: Props) {
  const { locale, trackSlug, lessonId } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const lesson = await fetchLesson(trackSlug, lessonId);
  if (!lesson) notFound();
  return <LessonView lesson={lesson} />;
}
