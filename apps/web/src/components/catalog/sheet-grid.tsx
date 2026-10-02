import type { PublicSheetItem } from '@piano-daily/shared';
import { SheetCard } from './sheet-card';

/** 3/2/1 cột (lg/md/sm); dùng chung với skeleton để không nhảy bố cục. */
export const SHEET_GRID_CLASS = 'grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3';

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
