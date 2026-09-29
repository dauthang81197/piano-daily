'use client';

import { SheetTable } from '@/components/sheets/sheet-table';

export default function SheetsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Sheet</h1>
        <p className="text-body-md text-muted-foreground">Thư viện bài nhạc. Bấm vào một hàng để sửa thông tin Sheet.</p>
      </div>
      <SheetTable />
    </section>
  );
}
