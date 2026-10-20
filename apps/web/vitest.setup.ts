import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// `server-only` ném lỗi khi import ngoài môi trường react-server; trong test coi như no-op.
vi.mock('server-only', () => ({}));

// Các test hiện có kiểm tra luồng thanh toán: mặc định bật; test riêng cho trạng thái ẩn dùng `vi.stubEnv`.
process.env.NEXT_PUBLIC_PAYMENTS_ENABLED = 'true';

afterEach(() => {
  cleanup();
});
