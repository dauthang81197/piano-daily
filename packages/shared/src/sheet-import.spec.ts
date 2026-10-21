import { describe, expect, it } from 'vitest';
import { createSheetImportSchema, sheetImportBatchStatus, titleFromFileName } from './sheet-import';

const counts = (c: Partial<Record<'pending' | 'processing' | 'done' | 'failed' | 'cancelled', number>>) => {
  const full = { pending: 0, processing: 0, done: 0, failed: 0, cancelled: 0, ...c };
  return { ...full, total: Object.values(full).reduce((a, b) => a + b, 0) };
};

describe('titleFromFileName', () => {
  it('bỏ đuôi .pdf và đường dẫn, đổi _ - thành khoảng trắng', () => {
    expect(titleFromFileName('Fur_Elise-Beethoven.PDF')).toBe('Fur Elise Beethoven');
    expect(titleFromFileName('C:\\nhac\\Canon  in   D.pdf')).toBe('Canon in D');
  });
  it('giữ tiếng Việt và cắt gọn', () => {
    expect(titleFromFileName('Nối vòng tay lớn.pdf')).toBe('Nối vòng tay lớn');
    expect(titleFromFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(200);
  });
  it('rỗng thì có tên mặc định', () => {
    expect(titleFromFileName('.pdf')).toBe('Chưa đặt tên');
    expect(titleFromFileName('___.pdf')).toBe('Chưa đặt tên');
  });
});

describe('sheetImportBatchStatus', () => {
  it('tính trạng thái đợt', () => {
    expect(sheetImportBatchStatus(counts({}), false)).toBe('EMPTY');
    expect(sheetImportBatchStatus(counts({ pending: 1, done: 2 }), false)).toBe('RUNNING');
    expect(sheetImportBatchStatus(counts({ processing: 1 }), true)).toBe('RUNNING');
    expect(sheetImportBatchStatus(counts({ done: 3 }), false)).toBe('DONE');
    expect(sheetImportBatchStatus(counts({ done: 2, failed: 1 }), false)).toBe('DONE_WITH_ERRORS');
    expect(sheetImportBatchStatus(counts({ done: 1, cancelled: 2 }), true)).toBe('CANCELLED');
  });
});

describe('createSheetImportSchema', () => {
  it('mặc định Trung cấp, không đăng luôn', () => {
    expect(createSheetImportSchema.parse({})).toEqual({ level: 'INTERMEDIATE', publish: false });
  });
  it('từ chối trường lạ', () => {
    expect(createSheetImportSchema.safeParse({ isFree: true }).success).toBe(false);
  });
});
