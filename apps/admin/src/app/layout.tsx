import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth/auth-provider';
import { cn } from '@/lib/utils';
import { beVietnamPro, playfairDisplay } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Piano Daily — Quản trị',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi" className={cn(playfairDisplay.variable, beVietnamPro.variable)}>
      <body className="min-h-screen font-sans text-body-md antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
