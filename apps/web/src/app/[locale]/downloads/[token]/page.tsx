import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { downloadButtonClass } from '@/components/sheet/download-button-class';
import { routing } from '@/i18n/routing';
import { fetchDownloadStatus } from '@/lib/catalog';
import { publicApiUrl } from '@/lib/public-env';

// Token và lượt tải theo từng request: tuyệt đối không render tĩnh hay cache.
export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ locale: string; token: string }> };

const DAY_MS = 86_400_000;
const FORMAT_KEY = { PDF: 'PDF', MIDI: 'MIDI', MP3: 'MP3' } as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  const robots = { index: false, follow: false } as const;
  if (!hasLocale(routing.locales, locale)) return { robots };
  const t = await getTranslations({ locale, namespace: 'Downloads' });
  // Không `alternates`/hreflang và không đưa token vào metadata: trang này không bao giờ được index.
  return { title: t('title'), robots };
}

/** Base URL API cho trình duyệt; thiếu cấu hình thì không có nút (không ném). */
function apiBase(): string | null {
  try {
    return publicApiUrl();
  } catch {
    return null;
  }
}

export default async function DownloadsPage({ params }: Props) {
  const { locale, token } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);

  const status = await fetchDownloadStatus(token);
  if (!status) notFound();

  const t = await getTranslations('Downloads');
  const sheetT = await getTranslations('Sheet');
  const contact = process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim();

  if (status.status !== 'ACTIVE') {
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
        <h1 className="font-display text-headline-md text-on-surface">{t('invalidTitle')}</h1>
        <p className="text-body-md text-on-surface-variant">{t('invalidBody')}</p>
        <p className="text-body-md text-on-surface-variant">
          {contact
            ? t.rich('contactWithEmail', {
                email: contact,
                mail: (chunks) => (
                  <a href={`mailto:${contact}`} className="font-semibold text-secondary underline">
                    {chunks}
                  </a>
                ),
              })
            : t('contactFallback')}
        </p>
      </main>
    );
  }

  const base = apiBase();
  // Ít nhất 1 ngày khi token còn hiệu lực (làm tròn lên).
  const days = Math.max(1, Math.ceil((new Date(status.expiresAt).getTime() - Date.now()) / DAY_MS));
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-gutter px-margin-mobile py-section-gap md:px-margin-desktop">
      <p role="status" className="text-body-md font-semibold text-on-surface">
        {t('success')}
      </p>
      <h1 className="font-display text-headline-md text-on-surface">{status.sheetTitle}</h1>
      <section aria-labelledby="downloads-files" className="flex flex-col gap-3">
        <h2 id="downloads-files" className="font-display text-headline-sm text-on-surface">
          {t('filesHeading')}
        </h2>
        {base && (
          <ul className="flex flex-wrap gap-3">
            {status.files.map((file) => (
              // Liên kết thường (không prefetch): mỗi lần bấm trừ một lượt.
              <li key={file.fileType}>
                <a
                  href={`${base}/downloads/${encodeURIComponent(token)}/${file.fileType.toLowerCase()}`}
                  className={downloadButtonClass}
                  aria-label={sheetT('downloadLabel', { format: sheetT(`download.${FORMAT_KEY[file.fileType]}`), title: status.sheetTitle })}
                >
                  {sheetT(`download.${FORMAT_KEY[file.fileType]}`)}
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-body-md text-on-surface-variant">{t('validity', { days, downloads: status.remainingDownloads })}</p>
      <p className="text-body-md text-on-surface-variant">{t('saveHint')}</p>
    </main>
  );
}
