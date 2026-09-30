import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// `server-only` ném lỗi khi import ngoài môi trường react-server; trong test coi như no-op.
vi.mock('server-only', () => ({}));

afterEach(() => {
  cleanup();
});
