/** URL API cho code chạy trong browser (inline lúc build). KHÔNG dùng để gửi secret. */
export function publicApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error('Thiếu biến môi trường NEXT_PUBLIC_API_URL');
  return url.replace(/\/+$/, '');
}

/** PayPal client ID cho nút thanh toán trong browser (công khai theo thiết kế; KHÔNG BAO GIỜ đặt client secret ở đây). */
export function paypalClientId(): string {
  const id = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID?.trim();
  if (!id) throw new Error('Thiếu biến môi trường NEXT_PUBLIC_PAYPAL_CLIENT_ID');
  return id;
}

/** Google OAuth Client ID cho nút đăng nhập Google của khách; `null` khi chưa cấu hình (ẩn nút, đăng ký email vẫn chạy). */
export function googleClientId(): string | null {
  return process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() || null;
}

/**
 * Hiện tính năng thanh toán (bảng giá, nút mua/tải có phí, modal thanh toán, trạng thái gói) hay không. Mặc định ẨN: chỉ bật khi
 * `NEXT_PUBLIC_PAYMENTS_ENABLED=true` lúc build. Chỉ ẩn phía giao diện; API và dữ liệu không đổi.
 */
export function paymentsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PAYMENTS_ENABLED === 'true';
}
