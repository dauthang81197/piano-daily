/** Độ dài tối đa của slug sinh từ tên. */
export const SLUG_MAX_LENGTH = 80;

/**
 * Sinh slug từ văn bản: bỏ dấu tiếng Việt (NFD + bỏ combining mark, `đ/Đ` → `d`), lowercase,
 * gộp mọi ký tự ngoài `[a-z0-9]` thành một `-`, bỏ `-` ở đầu/cuối, cắt tối đa 80 ký tự.
 * Có thể trả chuỗi rỗng (vd. tên chỉ có ký tự đặc biệt): nơi gọi tự chọn slug dự phòng.
 */
export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '');
}
