import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { PrismaClient } from '../generated/client';
import { BCRYPT_COST } from '../modules/identity/password.service';

/**
 * Tạo SUPER_ADMIN đầu tiên cho production (image không có `tsx` nên không chạy được `prisma db seed`, và seed còn thêm
 * Sheet mẫu). Idempotent: email đã tồn tại thì giữ nguyên, không đổi mật khẩu. Không in mật khẩu hay email đầy đủ.
 *   docker compose -f docker-compose.prod.yml exec -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... api node dist/scripts/create-admin.js
 */

const inputSchema = z.object({
  ADMIN_EMAIL: z.string().trim().toLowerCase().pipe(z.email({ error: 'không phải email hợp lệ' })),
  ADMIN_PASSWORD: z
    .string()
    .min(12, { error: 'cần ít nhất 12 ký tự' })
    .max(128, { error: 'tối đa 128 ký tự' })
    .refine((v) => !v.startsWith('change-me'), { error: 'vẫn là giá trị mẫu' }),
  ADMIN_NAME: z.string().trim().min(1).max(100).default('Founder'),
});

export type CreateAdminInput = { email: string; password: string; name: string };
export type CreateAdminResult = 'created' | 'exists' | 'exists-not-admin';

/** Che email khi log: `ad***@example.com`. */
export function maskEmail(email: string): string {
  const [local = '', domain = ''] = email.split('@');
  return `${local.slice(0, 2)}***@${domain}`;
}

/** Đọc và kiểm tra biến môi trường; lỗi nêu tên biến, không bao giờ nêu giá trị. */
export function readCreateAdminInput(env: NodeJS.ProcessEnv): CreateAdminInput {
  const parsed = inputSchema.safeParse({
    ADMIN_EMAIL: env.ADMIN_EMAIL ?? '',
    ADMIN_PASSWORD: env.ADMIN_PASSWORD ?? '',
    ADMIN_NAME: env.ADMIN_NAME || undefined,
  });
  if (!parsed.success) {
    const problems = parsed.error.issues.map((issue) => {
      const variable = String(issue.path[0]);
      return `${variable} (${env[variable] ? issue.message : 'thiếu'})`;
    });
    throw new Error(`Biến môi trường không hợp lệ: ${problems.join(', ')}`);
  }
  return { email: parsed.data.ADMIN_EMAIL, password: parsed.data.ADMIN_PASSWORD, name: parsed.data.ADMIN_NAME };
}

type UserDelegate = Pick<PrismaClient['user'], 'findUnique' | 'upsert'>;

export async function createAdmin(prisma: { user: UserDelegate }, input: CreateAdminInput): Promise<CreateAdminResult> {
  const existing = await prisma.user.findUnique({ where: { email: input.email }, select: { role: true, isActive: true } });
  if (existing) return existing.role === 'SUPER_ADMIN' && existing.isActive ? 'exists' : 'exists-not-admin';
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  // upsert (update rỗng) để an toàn khi hai lệnh chạy đồng thời.
  await prisma.user.upsert({
    where: { email: input.email },
    update: {},
    create: { email: input.email, passwordHash, name: input.name, role: 'SUPER_ADMIN' },
  });
  return 'created';
}

async function main(): Promise<void> {
  const input = readCreateAdminInput(process.env);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thiếu DATABASE_URL');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString, connectionTimeoutMillis: 5_000 }) });
  try {
    const result = await createAdmin(prisma, input);
    const who = maskEmail(input.email);
    if (result === 'created') console.log(`Đã tạo SUPER_ADMIN ${who}. Đăng nhập tại trang admin bằng email và mật khẩu vừa đặt.`);
    else if (result === 'exists') console.log(`SUPER_ADMIN ${who} đã tồn tại, giữ nguyên (không đổi mật khẩu).`);
    else {
      console.error(`CẢNH BÁO: user ${who} đã tồn tại nhưng không phải SUPER_ADMIN đang hoạt động; không sửa.`);
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error(`Không tạo được admin: ${err instanceof Error ? err.message : 'lỗi không xác định'}`);
    process.exit(1);
  });
}
