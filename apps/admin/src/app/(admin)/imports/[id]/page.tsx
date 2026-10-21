'use client';

import Link from 'next/link';
import { use } from 'react';
import { ImportDetail } from '@/components/imports/import-detail';

export default function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Đợt import</h1>
        <p className="text-sm">
          <Link href="/imports" className="text-primary underline underline-offset-4">
            Quay lại danh sách import
          </Link>
        </p>
      </div>
      <ImportDetail id={id} />
    </section>
  );
}
