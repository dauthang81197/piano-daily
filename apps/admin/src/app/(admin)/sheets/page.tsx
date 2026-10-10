'use client';

import Link from 'next/link';
import { SheetTable } from '@/components/sheets/sheet-table';

export default function SheetsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Sheet</h1>
        <p className="text-body-md text-muted-foreground">Thư viện bài nhạc. Bấm vào một hàng để sửa thông tin Sheet.</p>
        <p className="text-sm">
          <Link href="/sheets/bulk-pricing" className="text-primary underline underline-offset-4">
            Đặt giá hàng loạt
          </Link>
        </p>
      </div>
      <SheetTable />
    </section>
  );
}
