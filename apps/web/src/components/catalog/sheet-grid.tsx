import type { PublicSheetItem } from '@piano-daily/shared';
import { SheetCard } from './sheet-card';

/** 1 cột dưới `sm`, từ `sm` tự chia cột theo bề rộng (thẻ ≥ 15rem); dùng chung với skeleton để không nhảy bố cục. */
export const SHEET_GRID_CLASS = 'grid grid-cols-1 gap-gutter sm:grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]';

export function SheetGrid({ items }: { items: PublicSheetItem[] }) {
  return (
    <ul className={SHEET_GRID_CLASS}>
      {items.map((sheet) => (
        <li key={sheet.id}>
          <SheetCard sheet={sheet} />
        </li>
      ))}
    </ul>
  );
}
