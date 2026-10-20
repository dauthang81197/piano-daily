'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Dải tag Genre cuộn ngang ở mobile; cuộn tag đang chọn (`aria-current="true"`) vào vùng nhìn.
 * Chỉ nhận `children` (serializable) để `GenreTags` vẫn là server component và truyền được hàm `hrefFor`.
 */
export function GenreScroller({ selectedKey, className, children }: { selectedKey: string | undefined; className?: string; children: ReactNode }) {
  const list = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="true"]');
    // Chỉ chỉnh `scrollLeft` của dải tag (không dùng scrollIntoView để khỏi kéo cả trang theo chiều dọc).
    // Không có lựa chọn thì trả về đầu dải.
    el.scrollLeft = current ? Math.max(0, current.offsetLeft - (el.clientWidth - current.offsetWidth) / 2) : 0;
  }, [selectedKey]);
  return (
    <ul ref={list} className={className}>
      {children}
    </ul>
  );
}
