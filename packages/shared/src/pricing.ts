import { z } from 'zod';
import { FileType } from './file';

/** Giá tối đa của một mục: 1000 USD (cents). Phải trùng CHECK trong migration `sheet_pricing`. */
export const MAX_PRICE_CENTS = 100_000;

/** Các loại file bán được (AD-17). */
export const PURCHASABLE_FILE_TYPES = [FileType.PDF, FileType.MIDI, FileType.MP3] as const;
export type PurchasableFileType = (typeof PURCHASABLE_FILE_TYPES)[number];

export const PRICE_ERROR = 'Giá phải là số cents nguyên từ 0 đến 100000 (tối đa 1000 USD).';

/** Giá cents: số nguyên 0…MAX; `null` = không đặt giá. */
export const priceCentsSchema = z
  .number({ error: PRICE_ERROR })
  .int({ error: PRICE_ERROR })
  .min(0, { error: PRICE_ERROR })
  .max(MAX_PRICE_CENTS, { error: PRICE_ERROR });

export const USD_INPUT_ERROR = 'Nhập giá USD hợp lệ, ví dụ 4.99 (tối đa 2 chữ số thập phân, từ 0 đến 1000).';

/**
 * Đổi chuỗi USD ("4.99", "5", "0.5") sang cents bằng xử lý chuỗi, không dùng float.
 * Chuỗi rỗng → `null`; không hợp lệ hoặc vượt `MAX_PRICE_CENTS` → `undefined`.
 */
export function parseUsdToCents(input: string): number | null | undefined {
  const text = input.trim();
  if (!text) return null;
  const match = /^(\d{1,4})(?:\.(\d{1,2}))?$/.exec(text);
  if (!match) return undefined;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || '0');
  return cents > MAX_PRICE_CENTS ? undefined : cents;
}

/** Cents → chuỗi USD hai chữ số thập phân ("499" → "4.99"), không dùng float. */
export function formatUsd(cents: number): string {
  const whole = Math.trunc(cents / 100);
  const frac = String(cents % 100).padStart(2, '0');
  return `${whole}.${frac}`;
}

const purchasableTypeSchema = z.enum(PURCHASABLE_FILE_TYPES);

/** Báo giá công khai của một Sheet (`GET /sheets/:id/quote`). Sheet free: `free` true, không có mục nào. */
export const quoteSchema = z.object({
  sheetId: z.string(),
  currency: z.literal('USD'),
  free: z.boolean(),
  items: z.array(z.object({ fileType: purchasableTypeSchema, priceCents: priceCentsSchema })),
  bundle: z.object({ priceCents: priceCentsSchema, fileTypes: z.array(purchasableTypeSchema).min(2) }).nullable(),
});
export type Quote = z.infer<typeof quoteSchema>;
