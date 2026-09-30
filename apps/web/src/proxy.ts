import createMiddleware from 'next-intl/middleware';
import { type NextRequest, NextResponse } from 'next/server';
import { routing } from './i18n/routing';
import { hasLocalePrefix, LOCALE_COOKIE, resolveLocale } from './lib/locale';

const intlMiddleware = createMiddleware(routing);

/**
 * Chỉ path CHƯA có tiền tố `/vi|/en` bị redirect (cookie -> cf-ipcountry -> en). URL đã có tiền tố không bao giờ
 * bị redirect theo IP hay cookie; chúng đi qua next-intl (đặt cookie `NEXT_LOCALE`, 1 năm).
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!hasLocalePrefix(pathname)) {
    const locale = resolveLocale({
      cookie: request.cookies.get(LOCALE_COOKIE)?.value,
      country: request.headers.get('cf-ipcountry'),
    });
    const url = request.nextUrl.clone();
    url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
    return NextResponse.redirect(url, 307);
  }
  return intlMiddleware(request);
}

export const config = {
  // Loại `_next`, `api`, file tĩnh (có dấu chấm — gồm `sitemap.xml`, `robots.txt`).
  matcher: ['/((?!api(?:/|$)|_next|_vercel|sitemap\\.xml|robots\\.txt|.*\\..*).*)'],
};
