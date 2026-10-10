'use client';

import { SettingsForm } from '@/components/settings/settings-form';

export default function SettingsPage() {
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-headline-md text-primary">Cài đặt</h1>
        <p className="text-body-md text-muted-foreground">
          Tên site, logo, SEO, link YouTube, công tắc thanh toán và mặc định của link tải.
        </p>
      </div>
      <SettingsForm />
    </section>
  );
}
