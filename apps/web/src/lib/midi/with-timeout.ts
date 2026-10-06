/** Hết hạn thì từ chối bằng `Error('timeout')`; kết quả đến muộn bị bỏ (promise gốc không bị huỷ). */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

/**
 * Như `withTimeout` cho tài nguyên cần giải phóng: nếu hết hạn (hoặc người gọi đã bỏ cuộc) mà tài nguyên đến muộn thì
 * `dispose()` nó ngay, thay vì để rò rỉ (ví dụ synth và AudioContext của Tone).
 */
export function withTimeoutDispose<T extends { dispose(): void }>(promise: Promise<T>, ms: number): Promise<T> {
  let abandoned = false;
  promise.then(
    (resource) => {
      if (abandoned) resource.dispose();
    },
    () => undefined,
  );
  return withTimeout(promise, ms).catch((err) => {
    abandoned = true;
    throw err;
  });
}
