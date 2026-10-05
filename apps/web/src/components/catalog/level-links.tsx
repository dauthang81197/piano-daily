import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { LEVELS } from '@/lib/levels';

/** Gợi ý xem theo 4 Level (dùng ở trạng thái rỗng); `label` là câu dẫn đã dịch. */
export function LevelLinks({ label }: { label: string }) {
  const nav = useTranslations('Nav');
  return (
    <>
      <p className="pt-2 text-body-md text-on-surface-variant">{label}</p>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {LEVELS.map((value) => (
          <li key={value}>
            <Link
              href={`/level/${value}`}
              className="w-fit rounded-sm text-body-md text-primary underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
            >
              {nav(`levels.${value}`)}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
