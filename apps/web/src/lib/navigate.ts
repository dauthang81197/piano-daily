/** Điều hướng toàn trang tới URL (vd. signed URL tải file). Tách riêng để test thay thế được `window.location.assign`. */
export function navigateTo(url: string): void {
  window.location.assign(url);
}
