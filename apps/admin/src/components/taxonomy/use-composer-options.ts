import { type Composer, PAGE_SIZE_MAX } from '@piano-daily/shared';
import { useEffect, useState } from 'react';
import { composersApi } from '@/lib/api/catalog';

export interface ComposerOption {
  value: string;
  label: string;
}

/**
 * Danh sách Composer cho dropdown (tối đa 100, theo tên). `ensure` luôn có mặt trong danh sách
 * (vd. Composer hiện tại của Series đang sửa) dù nằm ngoài 100 bản ghi đầu.
 */
export function useComposerOptions(ensure?: Pick<Composer, 'id' | 'name'> | null) {
  const [options, setOptions] = useState<ComposerOption[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    composersApi
      .list({ pageSize: PAGE_SIZE_MAX }, controller.signal)
      .then((page) => setOptions(page.items.map((c) => ({ value: c.id, label: c.name }))))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  const list = options ?? [];
  const withEnsured =
    ensure && !list.some((o) => o.value === ensure.id) ? [{ value: ensure.id, label: ensure.name }, ...list] : list;
  return { options: withEnsured, loading: options === null && !error, error };
}
