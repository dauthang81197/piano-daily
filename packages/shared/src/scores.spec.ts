import { describe, expect, it } from 'vitest';
import { detectScoreFileKind, scoreConversionSchema, scoreTransposeSchema } from './scores';

const bytes = (...n: number[]) => Uint8Array.from(n);
const text = (s: string) => new TextEncoder().encode(s);

describe('detectScoreFileKind', () => {
  it('nhận PDF, PNG, JPEG, TIFF (cả hai thứ tự byte), MXL bằng magic bytes', () => {
    expect(detectScoreFileKind(text('%PDF-1.7\n...'))).toBe('pdf');
    expect(detectScoreFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe('png');
    expect(detectScoreFileKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('jpeg');
    expect(detectScoreFileKind(bytes(0x49, 0x49, 0x2a, 0x00))).toBe('tiff');
    expect(detectScoreFileKind(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe('tiff');
    expect(detectScoreFileKind(bytes(0x50, 0x4b, 0x03, 0x04, 0))).toBe('mxl');
  });

  it('nhận MusicXML (kể cả có BOM và khoảng trắng đầu)', () => {
    expect(detectScoreFileKind(text('<?xml version="1.0"?><score-partwise/>'))).toBe('musicxml');
    expect(detectScoreFileKind(text('﻿  \n<?xml version="1.0"?>'))).toBe('musicxml');
    expect(detectScoreFileKind(text('<score-partwise version="3.1"></score-partwise>'))).toBe('musicxml');
  });

  it('từ chối file lạ, rỗng và file chỉ giả đuôi', () => {
    expect(detectScoreFileKind(new Uint8Array())).toBeNull();
    expect(detectScoreFileKind(text('MZ\u0090\u0000'))).toBeNull();
    expect(detectScoreFileKind(text('hello world'))).toBeNull();
    expect(detectScoreFileKind(text('<html></html>'))).toBeNull();
    expect(detectScoreFileKind(bytes(0x25, 0x50, 0x44))).toBeNull();
  });
});

describe('scoreTransposeSchema', () => {
  it('chỉ nhận số nguyên −12..12 (chuỗi số cũng được)', () => {
    expect(scoreTransposeSchema.parse('2')).toBe(2);
    expect(scoreTransposeSchema.parse(-12)).toBe(-12);
    expect(() => scoreTransposeSchema.parse(13)).toThrow();
    expect(() => scoreTransposeSchema.parse(1.5)).toThrow();
    expect(() => scoreTransposeSchema.parse('abc')).toThrow();
  });
});

describe('scoreConversionSchema', () => {
  it('parse bản ghi đã xong và đã lỗi', () => {
    const base = { id: '0195b0f0-0000-7000-8000-000000000000', originalName: 'a.pdf', transpose: 0, createdAt: '2026-10-20T00:00:00.000Z', expiresAt: '2026-10-20T06:00:00.000Z' };
    expect(scoreConversionSchema.parse({ ...base, status: 'DONE', error: null, result: { noteJsonUrl: 'http://x/n.json', midiUrl: 'http://x/m.mid', durationSeconds: 3, noteCount: 5 } }).status).toBe('DONE');
    expect(scoreConversionSchema.parse({ ...base, status: 'FAILED', result: null, error: 'SCORE_UNREADABLE' }).error).toBe('SCORE_UNREADABLE');
    expect(() => scoreConversionSchema.parse({ ...base, status: 'DONE', result: null, error: 'LẠ' })).toThrow();
  });
});
