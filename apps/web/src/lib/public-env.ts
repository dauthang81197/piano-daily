/** URL API cho code chạy trong browser (inline lúc build). KHÔNG dùng để gửi secret. */
export function publicApiUrl(): string {
  const url = process.env.NEXT_PUBLIC_API_URL;
  if (!url) throw new Error('Thiếu biến môi trường NEXT_PUBLIC_API_URL');
  return url.replace(/\/+$/, '');
}
