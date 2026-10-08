import type { PublicSheetDetail } from '@piano-daily/shared';
import { useTranslations } from 'next-intl';
import { publicApiUrl } from '@/lib/public-env';

type DownloadType = PublicSheetDetail['downloadTypes'][number];

const PATH: Record<DownloadType, string> = { PDF: 'pdf', MIDI: 'midi', MP3: 'mp3' };

/** `button-download` (UX-DR4): brass, dùng cho mọi nút tải; focus ring brass lấy từ `globals.css`. */
const button =
  'inline-flex min-h-11 items-center justify-center rounded-md bg-secondary px-6 py-2 text-body-md font-semibold text-on-secondary transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

/** Base URL API cho trình duyệt; thiếu cấu hình thì không có nút (không ném, như `ViewBeacon`). */
function apiBase(): string | null {
  try {
    return publicApiUrl();
  } catch {
    return null;
  }
}

/** Định dạng tải được của Sheet miễn phí, theo thứ tự PDF → MIDI → MP3; rỗng khi không free hoặc đang preview. */
export function availableDownloads(sheet: PublicSheetDetail, enabled: boolean): DownloadType[] {
  return enabled && sheet.isFree ? sheet.downloadTypes : [];
}

/**
 * Nút tải trực tiếp (Story 3.2, FR7): liên kết thường tới `GET /files/:sheetId/:type/download` (302 + `attachment`),
 * không modal. Chỉ render định dạng có thật; định dạng không có thì ẩn hẳn (UX-DR14).
 */
export function DownloadButtons({
  sheetId,
  title,
  types,
  className = 'flex flex-wrap gap-3',
}: {
  sheetId: string;
  title: string;
  types: DownloadType[];
  className?: string;
}) {
  const t = useTranslations('Sheet');
  const base = apiBase();
  if (!base || types.length === 0) return null;
  return (
    <ul className={className}>
      {types.map((type) => (
        <li key={type}>
          <a
            href={`${base}/files/${encodeURIComponent(sheetId)}/${PATH[type]}/download`}
            className={button}
            aria-label={t('downloadLabel', { format: t(`download.${type}`), title })}
          >
            {t(`download.${type}`)}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Khối call-out riêng cho MIDI/MP3 (UX-DR22). Không có định dạng nào trong hai loại này thì không hiện. */
export function AudioDownloadCallout({ sheetId, title, types }: { sheetId: string; title: string; types: DownloadType[] }) {
  const t = useTranslations('Sheet');
  const audio = types.filter((type) => type === 'MIDI' || type === 'MP3');
  if (audio.length === 0 || !apiBase()) return null;
  return (
    <section
      aria-labelledby="sheet-audio-downloads"
      className="flex flex-col gap-3 rounded-md border border-outline-variant bg-surface-container-low p-6"
    >
      <h2 id="sheet-audio-downloads" className="font-display text-headline-sm text-on-surface">
        {t('audioTitle')}
      </h2>
      <p className="text-body-md text-on-surface-variant">{t('audioHint')}</p>
      <DownloadButtons sheetId={sheetId} title={title} types={audio} />
    </section>
  );
}
