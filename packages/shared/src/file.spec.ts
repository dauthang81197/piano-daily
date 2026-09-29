import { describe, expect, it } from 'vitest';
import { FileType, hasPdfMagic, PDF_MAX_BYTES, PDF_MAX_PAGES, uploadFileTypeSchema } from './file';

describe('FileType', () => {
  it('đủ 5 loại', () => {
    expect(Object.values(FileType)).toEqual(['PDF', 'MIDI', 'MP3', 'THUMBNAIL', 'PAGE_IMAGE']);
  });

  it('giới hạn PDF', () => {
    expect(PDF_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(PDF_MAX_PAGES).toBe(100);
  });
});

describe('uploadFileTypeSchema', () => {
  it('chỉ nhận PDF ở Story 1.6', () => {
    expect(uploadFileTypeSchema.parse('PDF')).toBe('PDF');
    for (const bad of ['MIDI', 'MP3', 'THUMBNAIL', 'PAGE_IMAGE', 'pdf', '', undefined]) {
      expect(uploadFileTypeSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe('hasPdfMagic', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it('bắt đầu bằng %PDF-', () => {
    expect(hasPdfMagic(bytes('%PDF-1.7\n...'))).toBe(true);
  });

  it.each(['', '%PDF', ' %PDF-1.4', '\x89PNG\r\n', 'PDF-1.4'])('từ chối %j', (s) => {
    expect(hasPdfMagic(bytes(s))).toBe(false);
  });
});
