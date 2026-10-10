'use client';

import { OrderTable } from '@/components/orders/order-table';

export default function OrdersPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Đơn hàng</h1>
        <p className="text-body-md text-muted-foreground">Tra cứu đơn mua Sheet. Bấm vào một hàng để xem chi tiết.</p>
      </div>
      <OrderTable />
    </section>
  );
}
