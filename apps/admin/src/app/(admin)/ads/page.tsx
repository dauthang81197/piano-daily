'use client';

import { AdTable } from '@/components/ads/ad-table';

export default function AdsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Quảng cáo</h1>
        <p className="text-body-md text-muted-foreground">
          Bật hoặc tắt quảng cáo theo từng vị trí mà không cần deploy. Việc hiển thị trên site công khai nằm ở bước tiếp theo.
        </p>
      </div>
      <AdTable />
    </section>
  );
}
