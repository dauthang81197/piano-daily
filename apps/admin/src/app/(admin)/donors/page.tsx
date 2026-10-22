'use client';

import { DonorManager } from '@/components/donors/donor-manager';

export default function DonorsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Người ủng hộ</h1>
        <p className="text-body-md text-muted-foreground">
          Danh sách nhập tay, hiện trong hộp thoại “Ủng hộ” trên header của web. Người bị ẩn chỉ còn thấy ở đây.
        </p>
      </div>
      <DonorManager />
    </section>
  );
}
