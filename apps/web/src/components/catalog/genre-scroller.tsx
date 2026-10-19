'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Dải tag Genre cuộn ngang ở mobile; cuộn tag đang chọn (`aria-current="true"`) vào vùng nhìn.
 * Chỉ nhận `children` (serializable) để `GenreTags` vẫn là server component và truyền được hàm `hrefFor`.
 */
export function GenreScroller({ selectedKey, className, children }: { selectedKey: string | undefined; className?: string; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const current = list.current?.querySelector<HTMLElement>('[aria-current="true"]');
    // `block: 'nearest'` để chỉ cuộn ngang trong dải tag, không kéo cả trang.
    current?.scrollIntoView?.({ inline: 'center', block: 'nearest' });
  }, [selectedKey]);
  return (
    <ul ref={list} className={className}>
      {children}
    </ul>
  );
}
