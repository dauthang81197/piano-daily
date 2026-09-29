'use client';

import { TaxonomyTabs } from '@/components/taxonomy/taxonomy-tabs';

export default function TaxonomyPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Composer, Genre và Series</h1>
        <p className="text-body-md text-muted-foreground">
          Phân loại của thư viện. Slug được tạo tự động từ tên và giữ nguyên khi đổi tên.
        </p>
      </div>
      <TaxonomyTabs />
    </section>
  );
}
