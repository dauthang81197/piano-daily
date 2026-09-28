import path from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';
import { PrismaClient } from '../src/generated/client';

/**
 * Seed idempotent: upsert 1 SUPER_ADMIN từ `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`.
 * Nếu email đã tồn tại thì giữ nguyên (không đổi mật khẩu).
 * Chạy: `pnpm --filter @piano-daily/api db:seed` (= `prisma db seed`).
 */

loadDotenv({ path: path.join(__dirname, '../.env'), quiet: true });
loadDotenv({ path: path.join(__dirname, '../../../.env'), quiet: true });

const BCRYPT_COST = 12;

const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

const seedEnvSchema = z.object({
  DATABASE_URL: z.preprocess(emptyAsUndefined, z.string()),
  ADMIN_EMAIL: z.preprocess(emptyAsUndefined, z.string().trim().toLowerCase().pipe(z.email())),
  ADMIN_PASSWORD: z.preprocess(
    emptyAsUndefined,
    z
      .string()
      .min(12, { error: 'cần ít nhất 12 ký tự' })
      .max(128)
      .refine((v) => !v.startsWith('change-me'), { error: 'vẫn là giá trị mẫu' }),
  ),
  ADMIN_NAME: z.preprocess(emptyAsUndefined, z.string().trim().min(1)),
});

function readEnv(): z.infer<typeof seedEnvSchema> {
  const result = seedEnvSchema.safeParse(process.env);
  if (result.success) return result.data;
  const problems = result.error.issues.map((issue) => {
    const variable = String(issue.path[0] ?? '(unknown)');
    const raw = process.env[variable];
    return `${variable} (${raw === undefined || raw === '' ? 'thiếu' : issue.message})`;
  });
  throw new Error(`Không thể seed: biến môi trường không hợp lệ: ${problems.join(', ')}`);
}

/** Che email khi log: `ad***@example.com`. */
function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

async function main(): Promise<void> {
  const env = readEnv();
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  try {
    const existing = await prisma.user.findUnique({
      where: { email: env.ADMIN_EMAIL },
      select: { role: true, isActive: true },
    });
    if (existing) {
      if (existing.role !== 'SUPER_ADMIN' || !existing.isActive) {
        console.warn(
          `Seed: CẢNH BÁO — user ${maskEmail(env.ADMIN_EMAIL)} đã tồn tại nhưng không phải SUPER_ADMIN đang hoạt động ` +
            `(role=${existing.role}, is_active=${existing.isActive}); seed không sửa user này.`,
        );
      } else {
        console.log(`Seed: SUPER_ADMIN ${maskEmail(env.ADMIN_EMAIL)} đã tồn tại, giữ nguyên.`);
      }
      return;
    }
    const passwordHash = await bcrypt.hash(env.ADMIN_PASSWORD, BCRYPT_COST);
    // upsert (update rỗng) để an toàn khi hai lần seed chạy đồng thời.
    await prisma.user.upsert({
      where: { email: env.ADMIN_EMAIL },
      update: {},
      create: { email: env.ADMIN_EMAIL, passwordHash, name: env.ADMIN_NAME, role: 'SUPER_ADMIN' },
    });
    console.log(`Seed: đã tạo SUPER_ADMIN ${maskEmail(env.ADMIN_EMAIL)}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
