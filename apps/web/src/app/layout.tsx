import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { beVietnamPro, playfairDisplay } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Piano Daily',
  description: 'Thư viện sheet piano tuyển chọn.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={`${playfairDisplay.variable} ${beVietnamPro.variable}`}>
      <body className="min-h-screen bg-surface font-sans text-body-md text-on-surface antialiased">{children}</body>
    </html>
  );
}
