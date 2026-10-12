/** Trình duyệt tạo được ngữ cảnh WebGL (không giữ ngữ cảnh: canvas tạm bị bỏ ngay). */
export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

/** Người dùng yêu cầu giảm chuyển động. */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

/** Chỉ hiện công tắc bàn tay khi có WebGL và người dùng không yêu cầu giảm chuyển động. */
export function canShowHands(): boolean {
  return !prefersReducedMotion() && hasWebGL();
}
