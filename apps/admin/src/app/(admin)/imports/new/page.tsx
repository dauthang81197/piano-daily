'use client';

import Link from 'next/link';
import { ImportNewForm } from '@/components/imports/import-new-form';

export default function NewImportPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Import mới</h1>
        <p className="text-body-md text-muted-foreground">
          Mỗi PDF thành một Sheet: tiêu đề lấy từ tên file, MIDI được tạo tự động từ PDF. Hãy kiểm tra lại Sheet sau khi xong.
        </p>
        <p className="text-sm">
          <Link href="/imports" className="text-primary underline underline-offset-4">
            Quay lại danh sách import
          </Link>
        </p>
      </div>
      <ImportNewForm />
    </section>
  );
}
