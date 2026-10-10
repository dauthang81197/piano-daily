'use client';

import Link from 'next/link';
import { BulkPricingForm } from '@/components/sheets/bulk-pricing-form';

export default function BulkPricingPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Đặt giá hàng loạt</h1>
        <p className="text-body-md text-muted-foreground">
          Chọn tiêu chí, nhập giá cần đổi (ô để trống giữ nguyên giá cũ), xem trước rồi xác nhận. Chỉ áp dụng cho Sheet
          Draft và Đã publish.
        </p>
        <p className="text-sm">
          <Link href="/sheets" className="text-primary underline underline-offset-4">
            Quay lại danh sách Sheet
          </Link>
        </p>
      </div>
      <BulkPricingForm />
    </section>
  );
}
