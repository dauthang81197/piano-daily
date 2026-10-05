import path from 'node:path';
import { z } from 'zod';

/** Biến rỗng (`FOO=`) được coi như thiếu. */
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

/** Cờ boolean: `true`/`1`/`yes`/`on` hoặc `false`/`0`/`no`/`off` (không phân biệt hoa thường). */
function booleanFlag(defaultValue: boolean) {
  return z.preprocess(
    emptyAsUndefined,
    z
      .union([z.boolean(), z.string()])
      .default(defaultValue)
      .transform((value, ctx) => {
        if (typeof value === 'boolean') return value;
        const v = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'on'].includes(v)) return true;
        if (['false', '0', 'no', 'off'].includes(v)) return false;
        ctx.issues.push({ code: 'custom', message: 'phải là true hoặc false', input: value });
        return z.NEVER;
      }),
  );
}

/** Tên bucket S3 (quy tắc chung của S3/R2: 3–63 ký tự thường, số, `-`, `.`). */
const bucketName = z.preprocess(
  emptyAsUndefined,
  z.string().regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, { error: 'tên bucket không hợp lệ' }),
);

const requiredString = z.preprocess(emptyAsUndefined, z.string().min(1));

/**
 * `.env` của app (apps/api/.env) rồi `.env` ở gốc repo; biến đã có trong môi trường luôn thắng.
 * Tính từ __dirname (src/config hoặc dist/config) để không phụ thuộc cwd — khớp prisma.config.ts.
 */
const API_DIR = path.resolve(__dirname, '../..');
export const ENV_FILE_PATHS = [path.join(API_DIR, '.env'), path.resolve(API_DIR, '../../.env')];

/** Object storage S3 (module `media`; SeaweedFS local, R2 production) — dùng chung với `prisma/seed.ts`. */
const storageEnvShape = {
  /** Endpoint S3 mà API gọi (vd. `http://seaweedfs:8333` trong compose, `https://<account>.r2.cloudflarestorage.com`). */
  S3_ENDPOINT: z.preprocess(emptyAsUndefined, z.url({ protocol: /^https?$/, error: 'phải là URL http(s)://' })),
  S3_REGION: z.preprocess(emptyAsUndefined, z.string().min(1).default('us-east-1')),
  S3_ACCESS_KEY_ID: requiredString,
  S3_SECRET_ACCESS_KEY: requiredString,
  /** Bucket public: thumbnail, ảnh trang (đọc ẩn danh, cache immutable). */
  S3_BUCKET_PUBLIC: bucketName,
  /** Bucket private: file gốc (PDF/MIDI/MP3) — không bao giờ có URL public. */
  S3_BUCKET_PRIVATE: bucketName,
  /** URL gốc mà trình duyệt dùng để đọc bucket public (vd. `http://localhost:8333/piano-daily-public`). Bỏ `/` cuối. */
  S3_PUBLIC_BASE_URL: z.preprocess(
    emptyAsUndefined,
    z.url({ protocol: /^https?$/, error: 'phải là URL http(s)://' }).transform((value) => value.replace(/\/+$/, '')),
  ),
  /** Path-style (`endpoint/bucket/key`) — cần cho SeaweedFS/MinIO. */
  S3_FORCE_PATH_STYLE: booleanFlag(true),
  /** Tự tạo bucket còn thiếu lúc khởi động. Chỉ dùng cho dev/test. */
  S3_AUTO_CREATE_BUCKETS: booleanFlag(false),
};

const bucketsDiffer = (env: { S3_BUCKET_PUBLIC: string; S3_BUCKET_PRIVATE: string }) =>
  env.S3_BUCKET_PUBLIC !== env.S3_BUCKET_PRIVATE;
const bucketsDifferIssue = {
  path: ['S3_BUCKET_PRIVATE'],
  error: 'phải khác S3_BUCKET_PUBLIC (file gốc không được nằm trong bucket public)',
};

export const storageEnvSchema = z.object(storageEnvShape).refine(bucketsDiffer, bucketsDifferIssue);

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
  /** Khoá ký access JWT (HS256). */
  JWT_ACCESS_SECRET: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(32, { error: 'cần ít nhất 32 ký tự' })
      .refine((v) => !v.startsWith('change-me'), { error: 'vẫn là giá trị mẫu, hãy sinh khoá ngẫu nhiên' }),
  ),
  /** Hạn refresh token (ngày); cookie `Max-Age` khớp với hạn này. */
  REFRESH_TOKEN_TTL_DAYS: z.preprocess(emptyAsUndefined, z.coerce.number().int().positive().max(365).default(30)),
  /**
   * Origin của admin app — origin duy nhất được CORS cho phép (kèm `credentials`).
   * Chuẩn hoá về dạng `scheme://host[:port]` (bỏ path, dấu `/` cuối) để so khớp đúng header `Origin`.
   */
  CORS_ADMIN_ORIGIN: z.preprocess(
    emptyAsUndefined,
    z
      .url({ protocol: /^https?$/, error: 'phải là URL http(s)://' })
      .transform((value) => new URL(value).origin),
  ),

  /**
   * Origin của web công khai — được CORS cho phép nhưng KHÔNG kèm `credentials`.
   * Chuẩn hoá về `scheme://host[:port]`.
   */
  CORS_WEB_ORIGIN: z.preprocess(
    emptyAsUndefined,
    z
      .url({ protocol: /^https?$/, error: 'phải là URL http(s)://' })
      .transform((value) => new URL(value).origin),
  ),
  /**
   * Secret web SSR gửi qua header `X-Internal-Secret` để bỏ qua throttle (AD-18).
   * Bắt buộc (deny-by-default): thiếu thì API không khởi động.
   */
  INTERNAL_API_SECRET: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(32, { error: 'cần ít nhất 32 ký tự' })
      .refine((v) => !v.startsWith('change-me'), { error: 'vẫn là giá trị mẫu, hãy sinh khoá ngẫu nhiên' }),
  ),

  /**
   * Muối băm `visitor_hash = sha256(ip + ua + VIEW_SALT)` của bộ đếm lượt xem (AD-11, Story 2.7).
   * Bắt buộc (thiếu muối thì hash IP/UA có thể bị dò ngược): thiếu thì API không khởi động.
   */
  VIEW_SALT: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(32, { error: 'cần ít nhất 32 ký tự' })
      .refine((v) => !v.startsWith('change-me'), { error: 'vẫn là giá trị mẫu, hãy sinh khoá ngẫu nhiên' }),
  ),

  /**
   * URL nội bộ của web (vd. `http://web:4100`) để API gọi `POST /api/revalidate` (Story 2.3).
   * Tuỳ chọn: thiếu thì tắt revalidate (lưới an toàn `revalidate: 600` của web vẫn chạy). Bỏ `/` cuối.
   */
  WEB_INTERNAL_URL: z.preprocess(
    emptyAsUndefined,
    z
      .url({ protocol: /^https?$/, error: 'phải là URL http(s)://' })
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
  ),

  ...storageEnvShape,
}).refine(bucketsDiffer, bucketsDifferIssue);

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
