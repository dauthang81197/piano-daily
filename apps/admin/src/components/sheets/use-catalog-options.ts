import { PAGE_SIZE_MAX } from '@piano-daily/shared';
import { useEffect, useState } from 'react';
import { genresApi, seriesApi } from '@/lib/api/catalog';
import type { ComposerOption } from '@/components/taxonomy/use-composer-options';

type Ref = { id: string; name: string };

function withEnsured(list: ComposerOption[], ensure: Ref[]): ComposerOption[] {
  const missing = ensure.filter((e) => !list.some((o) => o.value === e.id));
  return [...missing.map((e) => ({ value: e.id, label: e.name })), ...list];
}

/**
 * Series của một Composer cho dropdown (tối đa 100, theo tên); tải lại khi đổi Composer.
 * `ensure` (Series hiện tại của Sheet) luôn có mặt nếu thuộc đúng Composer đang chọn.
 */
export function useSeriesOptions(composerId: string, ensure?: (Ref & { composerId: string }) | null) {
  const [state, setState] = useState<{ composerId: string; options: ComposerOption[] | null; error: boolean }>({
    composerId,
    options: null,
    error: false,
  });

  useEffect(() => {
    if (!composerId) return;
    const controller = new AbortController();
    seriesApi
      .list({ composerId, pageSize: PAGE_SIZE_MAX }, controller.signal)
      .then((page) =>
        setState({ composerId, options: page.items.map((s) => ({ value: s.id, label: s.name })), error: false }),
      )
      .catch(() => {
        if (!controller.signal.aborted) setState({ composerId, options: null, error: true });
      });
    return () => controller.abort();
  }, [composerId]);

  const current = state.composerId === composerId ? state : { composerId, options: null, error: false };
  const list = composerId ? (current.options ?? []) : [];
  const ensured = ensure && ensure.composerId === composerId ? [ensure] : [];
  return {
    options: withEnsured(list, ensured),
    loading: Boolean(composerId) && current.options === null && !current.error,
    /** Danh sách đã tải xong cho Composer đang chọn (dùng để bỏ chọn Series không còn thuộc Composer). */
    loaded: Boolean(composerId) && current.options !== null,
    error: current.error,
  };
}

/** Genre cho danh sách chọn nhiều (tối đa 100, theo tên). `ensure`: Genre đang gắn với Sheet. */
export function useGenreOptions(ensure: Ref[] = []) {
  const [options, setOptions] = useState<ComposerOption[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    genresApi
      .list({ pageSize: PAGE_SIZE_MAX }, controller.signal)
      .then((page) => setOptions(page.items.map((g) => ({ value: g.id, label: g.name }))))
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, []);

  return { options: withEnsured(options ?? [], ensure), loading: options === null && !error, error };
}
