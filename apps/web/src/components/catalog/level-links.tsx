import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LEVELS } from '@/lib/levels';

/** Gợi ý xem theo 4 Level (dùng ở trạng thái rỗng); `label` là câu dẫn đã dịch. */
export function LevelLinks({ label }: { label: string }) {
  const nav = useTranslations('Nav');
  return (
    <>
      <p className="pt-2 text-body-md text-on-surface-variant">{label}</p>
      <ul className="flex flex-wrap justify-center gap-2">
        {LEVELS.map((value) => (
          <li key={value}>
            <Link
              href={`/level/${value}`}
              className="inline-flex min-h-11 items-center rounded-full border border-outline-variant px-4 py-2 text-body-md text-primary hover:bg-surface-container focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {nav(`levels.${value}`)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
