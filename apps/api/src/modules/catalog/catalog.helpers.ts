import { HttpStatus, Injectable, type PipeTransform } from '@nestjs/common';
import { ErrorCode, type ListQuery, slugify } from '@piano-daily/shared';
import { AppException } from '../../common/http-exception.filter';
import type { Prisma } from '../../generated/client';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `:id` không phải UUID thì coi như không tồn tại: 404 `NOT_FOUND` (không để lỗi cast của Postgres thành 500). */
@Injectable()
export class UuidParamPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!UUID_PATTERN.test(value)) throw notFound();
    return value.toLowerCase();
  }
}

export function notFound(message?: string): AppException {
  return new AppException(ErrorCode.NOT_FOUND, HttpStatus.NOT_FOUND, message);
}

export function inUse(message: string): AppException {
  return new AppException(ErrorCode.RESOURCE_IN_USE, HttpStatus.CONFLICT, message);
}

/**
 * Tìm theo tên không phân biệt hoa thường và dấu: `name ILIKE %q%` hoặc `slug LIKE %slugify(q)%`
 * (slug là bản không dấu của tên lúc tạo).
 */
export function nameSearch(q: string | undefined): { OR: { name?: Prisma.StringFilter; slug?: Prisma.StringFilter }[] } | undefined {
  if (!q) return undefined;
  const or: { name?: Prisma.StringFilter; slug?: Prisma.StringFilter }[] = [
    { name: { contains: q, mode: 'insensitive' } },
  ];
  const slugQ = slugify(q);
  if (slugQ) or.push({ slug: { contains: slugQ } });
  return { OR: or };
}

/** `skip/take` và sắp xếp theo tên (id để thứ tự ổn định khi trùng tên). */
export function pagination({ page, pageSize }: ListQuery) {
  return {
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: [{ name: 'asc' as const }, { id: 'asc' as const }],
  };
}
