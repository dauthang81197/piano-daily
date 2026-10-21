'use client';

import { ImportList } from '@/components/imports/import-list';

export default function ImportsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Import Sheet</h1>
        <p className="text-body-md text-muted-foreground">
          Tải lên nhiều PDF, hệ thống chuyển sang MIDI và tạo Sheet ở nền. Mở một đợt để xem file nào đã xong.
        </p>
      </div>
      <ImportList />
    </section>
  );
}
