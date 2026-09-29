import { useEffect, useState } from 'react';

/** Giá trị trễ `delayMs` sau lần thay đổi cuối (ô tìm kiếm không gọi API theo từng phím). */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
