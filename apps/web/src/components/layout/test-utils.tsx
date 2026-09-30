import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import en from '@/messages/en.json';
import vi from '@/messages/vi.json';

export function withIntl(ui: ReactNode, locale: 'vi' | 'en' = 'en') {
  return (
    <NextIntlClientProvider locale={locale} messages={locale === 'vi' ? vi : en}>
      {ui}
    </NextIntlClientProvider>
  );
}
