'use client';

import { PlanTable } from '@/components/plans/plan-table';

export default function PlansPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Gói thuê bao</h1>
        <p className="text-body-md text-muted-foreground">
          Cấu hình các gói hiện trên trang giá của site. Bật cưỡng chế dùng thử và gói ở mục Cài đặt. Thanh toán gói sẽ có ở bước sau;
          trong lúc đó có thể cấp gói thủ công cho khách.
        </p>
      </div>
      <PlanTable />
    </section>
  );
}
