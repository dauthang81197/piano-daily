'use client';

import { Dashboard } from '@/components/dashboard/dashboard';

export default function DashboardPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Dashboard</h1>
        <p className="text-body-md text-muted-foreground">Doanh thu, đơn hàng và lượt dùng theo múi giờ Việt Nam.</p>
      </div>
      <Dashboard />
    </section>
  );
}
