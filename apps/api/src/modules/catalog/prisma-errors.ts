import { Prisma } from '../../generated/client';

/** Lỗi Prisma đã biết với mã cho trước (P2002 unique, P2003 FK, P2025 không tìm thấy bản ghi). */
export function isPrismaError(err: unknown, code: 'P2002' | 'P2003' | 'P2025'): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;
}
