'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { LEVELS } from '@/lib/levels';
import { LanguageSwitcher } from './language-switcher';
import { SearchForm } from './search-form';

/** Hamburger cho viewport `< md`: nút có `aria-expanded`, Esc đóng menu và trả focus về nút. */
export function MobileMenu() {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const linkClass =
    'block rounded-md px-3 py-2 text-body-md text-on-surface hover:bg-surface-container-low ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary';

  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t('closeMenu') : t('openMenu')}
        onClick={() => setOpen((value) => !value)}
        className="rounded-md border border-outline-variant px-3 py-2 text-body-md font-medium text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        <span aria-hidden="true">{open ? '✕' : '☰'}</span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full border-b border-outline-variant bg-surface px-margin-mobile py-4 shadow-md"
        >
          <nav aria-label={t('primary')} className="flex flex-col gap-1">
            <Link href="/" className={linkClass} onClick={() => setOpen(false)}>
              {t('home')}
            </Link>
            <Link href="/search" className={linkClass} onClick={() => setOpen(false)}>
              {t('search')}
            </Link>
            {LEVELS.map((level) => (
              <Link key={level} href={`/level/${level}`} className={linkClass} onClick={() => setOpen(false)}>
                {t(`levels.${level}`)}
              </Link>
            ))}
          </nav>
          <SearchForm className="mt-4" />
          <LanguageSwitcher className="mt-4" />
        </div>
      ) : null}
    </div>
  );
}
