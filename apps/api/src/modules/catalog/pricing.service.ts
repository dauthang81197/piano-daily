import { Injectable } from '@nestjs/common';
import { FileType, PURCHASABLE_FILE_TYPES, type PurchasableFileType, type Quote } from '@piano-daily/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { notFound } from './catalog.helpers';

export type PriceColumns = {
  isFree: boolean;
  pricePdfCents: number | null;
  priceMidiCents: number | null;
  priceMp3Cents: number | null;
  priceBundleCents: number | null;
};

export const PRICE_SELECT = {
  isFree: true,
  pricePdfCents: true,
  priceMidiCents: true,
  priceMp3Cents: true,
  priceBundleCents: true,
} as const;

const PRICE_OF: Record<PurchasableFileType, keyof PriceColumns> = {
  [FileType.PDF]: 'pricePdfCents',
  [FileType.MIDI]: 'priceMidiCents',
  [FileType.MP3]: 'priceMp3Cents',
};

/**
 * Tính báo giá thuần từ cột giá và các loại file hiện hành (AD-17): type mua được = có file và giá > 0;
 * BUNDLE cần ít nhất 2 type mua được, giá bundle > 0 và gồm mọi type mua được. Sheet free không có mục nào.
 */
export function computeQuote(sheetId: string, prices: PriceColumns, currentTypes: ReadonlySet<string>): Quote {
  if (prices.isFree) return { sheetId, currency: 'USD', free: true, items: [], bundle: null };
  const items = PURCHASABLE_FILE_TYPES.flatMap((fileType) => {
    const priceCents = prices[PRICE_OF[fileType]] as number | null;
    return currentTypes.has(fileType) && priceCents !== null && priceCents > 0 ? [{ fileType, priceCents }] : [];
  });
  const bundleCents = prices.priceBundleCents;
  const bundle =
    items.length >= 2 && bundleCents !== null && bundleCents > 0
      ? { priceCents: bundleCents, fileTypes: items.map((i) => i.fileType) }
      : null;
  return { sheetId, currency: 'USD', free: false, items, bundle };
}

/** Sheet có bán/tải được không: free, hoặc có ít nhất một type mua được. */
export function isMonetisable(quote: Quote): boolean {
  return quote.free || quote.items.length > 0;
}

/** Nguồn báo giá duy nhất (AD-17). Giá luôn đọc từ DB, không cache. */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Báo giá hiện tại của Sheet PUBLISHED; Sheet khác (Draft/Archived/không tồn tại) → 404. */
  async quote(sheetId: string): Promise<Quote> {
    const sheet = await this.prisma.sheet.findFirst({
      where: { id: sheetId, status: 'PUBLISHED' },
      select: {
        id: true,
        ...PRICE_SELECT,
        files: { where: { supersededAt: null, type: { in: [...PURCHASABLE_FILE_TYPES] } }, select: { type: true } },
      },
    });
    if (!sheet) throw notFound('Không tìm thấy Sheet.');
    return computeQuote(sheet.id, sheet, new Set(sheet.files.map((f) => f.type)));
  }
}
