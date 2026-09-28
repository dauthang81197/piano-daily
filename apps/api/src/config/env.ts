import path from 'node:path';
import { z } from 'zod';

/** Biến rỗng (`FOO=`) được coi như thiếu. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

/**
 * `.env` của app (apps/api/.env) rồi `.env` ở gốc repo; biến đã có trong môi trường luôn thắng.
 * Tính từ __dirname (src/config hoặc dist/config) để không phụ thuộc cwd — khớp prisma.config.ts.
 */
const API_DIR = path.resolve(__dirname, '../..');
export const ENV_FILE_PATHS = [path.join(API_DIR, '.env'), path.resolve(API_DIR, '../../.env')];

export const envSchema = z.object({
  NODE_ENV: z.preprocess(emptyAsUndefined, z.enum(['development', 'test', 'production']).default('development')),
  PORT: z.preprocess(emptyAsUndefined, z.coerce.number().int().min(1).max(65535).default(4000)),
  LOG_LEVEL: z.preprocess(
    emptyAsUndefined,
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  ),
  DATABASE_URL: z.preprocess(
    emptyAsUndefined,
    z.url({ protocol: /^postgres(ql)?$/, error: 'phải là URL postgresql://' }),
  ),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(readonly issues: { variable: string; problem: string }[]) {
    super(
      `Cấu hình môi trường không hợp lệ: ${issues.map((i) => `${i.variable} (${i.problem})`).join(', ')}`,
    );
    this.name = 'EnvValidationError';
  }

  get variables(): string[] {
    return this.issues.map((i) => i.variable);
  }
}

/**
 * Validate env bằng zod. Ném `EnvValidationError` nêu rõ tên từng biến thiếu/sai.
 * Không bao giờ đưa giá trị biến vào thông báo lỗi (tránh lộ secret).
 */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (result.success) return result.data;

  const issues = result.error.issues.map((issue) => {
    const variable = String(issue.path[0] ?? '(unknown)');
    const missing = raw[variable] === undefined || raw[variable] === '';
    return { variable, problem: missing ? 'thiếu' : issue.message };
  });
  throw new EnvValidationError(issues);
}
