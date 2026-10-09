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
