'use client';

import { Menu, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import { HeaderAuth } from '@/components/auth/header-auth';
import { LanguageSwitcher } from './language-switcher';
import { PrimaryNav } from './nav-links';
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

  const Icon = open ? X : Menu;
  return (
    <div className="md:hidden">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? t('closeMenu') : t('openMenu')}
        onClick={() => setOpen((value) => !value)}
        className="flex size-11 items-center justify-center rounded-md border border-outline-variant text-on-surface hover:bg-surface-container-low focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary"
      >
        <Icon aria-hidden="true" className="size-5" />
      </button>
      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full max-h-[calc(100vh-4rem)] overflow-y-auto border-b border-outline-variant bg-surface px-margin-mobile py-4 shadow-md"
        >
          <PrimaryNav variant="stack" onNavigate={() => setOpen(false)} />
          <SearchForm className="mt-4" />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <HeaderAuth />
          </div>
        </div>
      ) : null}
    </div>
  );
}
