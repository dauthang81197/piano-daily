export const SEARCH_MAX_TERMS = 8;
export const SEARCH_MAX_TERM_LENGTH = 50;

/**
 * Chuẩn hoá từ khoá người dùng thành chuỗi `to_tsquery('simple', …)`: `từ:* & từ:*` (khớp tiền tố, AND).
 * Chuẩn hoá NFC + lowercase, tách theo ký tự không phải chữ/số Unicode, tối đa 8 từ, mỗi từ ≤ 50 ký tự.
 * Mọi ký tự toán tử tsquery (`& | ! ( ) : * ' \`) bị loại ở bước tách nên input không chèn được cú pháp.
 * Trả `null` khi không còn từ nào (coi như không có `q`). Bỏ dấu do SQL `piano_unaccent` đảm nhiệm.
 */
export function buildSearchQuery(q: string): string | null {
  const terms = q
    .normalize('NFC')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .slice(0, SEARCH_MAX_TERMS)
    .map((term) => Array.from(term).slice(0, SEARCH_MAX_TERM_LENGTH).join(''));
  return terms.length ? terms.map((term) => `${term}:*`).join(' & ') : null;
}

/** `q` toàn số 1–9 chữ số thì là ID công khai (`public_id`), khớp thêm bên cạnh khớp văn bản. */
export function parsePublicIdQuery(q: string): number | null {
  const trimmed = q.trim();
  return /^[0-9]{1,9}$/.test(trimmed) ? Number(trimmed) : null;
}
