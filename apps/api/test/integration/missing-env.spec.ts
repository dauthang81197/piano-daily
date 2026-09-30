import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const apiDir = path.resolve(__dirname, '../..');
const mainJs = path.join(apiDir, 'dist/main.js');

describe('Khởi động API khi thiếu biến môi trường', () => {
  it('DATABASE_URL rỗng -> thoát mã ≠ 0, một dòng log JSON nêu tên biến, không kèm stack', () => {
    expect(existsSync(mainJs), 'cần build api trước (turbo test phụ thuộc build)').toBe(true);

    // Env tối thiểu: không kế thừa NODE_ENV/LOG_LEVEL/PORT (có thể sai) từ shell của dev.
    // `DATABASE_URL=''` được giữ nguyên vì dotenv không ghi đè biến đã có trong môi trường;
    // các biến khác trong .env (nếu có) là giá trị hợp lệ từ .env.example.
    const result = spawnSync(process.execPath, [mainJs], {
      cwd: apiDir,
      env: {
        PATH: process.env.PATH ?? '',
        DATABASE_URL: '',
        JWT_ACCESS_SECRET: 'test-only-jwt-access-secret-0123456789abcdef',
        CORS_ADMIN_ORIGIN: 'http://localhost:3001',
        CORS_WEB_ORIGIN: 'http://localhost:4100',
        INTERNAL_API_SECRET: 'test-only-internal-api-secret-0123456789abcdef',
        S3_ENDPOINT: 'http://localhost:8333',
        S3_ACCESS_KEY_ID: 'piano',
        S3_SECRET_ACCESS_KEY: 'piano-secret',
        S3_BUCKET_PUBLIC: 'piano-daily-public',
        S3_BUCKET_PRIVATE: 'piano-daily-private',
        S3_PUBLIC_BASE_URL: 'http://localhost:8333/piano-daily-public',
      },
      encoding: 'utf8',
      timeout: 15_000,
    });

    expect(result.status).not.toBe(0);
    const line = JSON.parse(result.stderr.trim().split('\n').at(-1) ?? '{}');
    expect(line.invalidEnv).toEqual(['DATABASE_URL']);
    expect(line.msg).toContain('DATABASE_URL');
    expect(result.stderr).not.toMatch(/\s+at\s/);
  });
});
