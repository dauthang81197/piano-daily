import { describe, expect, it } from 'vitest';
import {
  FileType,
  hasMidiMagic,
  hasMp3Magic,
  hasPdfMagic,
  MIDI_MAX_BYTES,
  MP3_MAX_BYTES,
  PDF_MAX_BYTES,
  PDF_MAX_PAGES,
  uploadFileTypeSchema,
} from './file';

describe('FileType', () => {
  it('đủ 6 loại', () => {
    expect(Object.values(FileType)).toEqual(['PDF', 'MIDI', 'MP3', 'MIDI_JSON', 'THUMBNAIL', 'PAGE_IMAGE']);
  });

  it('giới hạn dung lượng', () => {
    expect(PDF_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(MIDI_MAX_BYTES).toBe(2 * 1024 * 1024);
    expect(MP3_MAX_BYTES).toBe(20 * 1024 * 1024);
    expect(PDF_MAX_PAGES).toBe(100);
  });
});

describe('uploadFileTypeSchema', () => {
  it('nhận PDF, MIDI, MP3 (Story 1.7)', () => {
    expect(uploadFileTypeSchema.parse('PDF')).toBe('PDF');
    expect(uploadFileTypeSchema.parse('MIDI')).toBe('MIDI');
    expect(uploadFileTypeSchema.parse('MP3')).toBe('MP3');
    for (const bad of ['MIDI_JSON', 'THUMBNAIL', 'PAGE_IMAGE', 'pdf', 'midi', '', undefined]) {
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

describe('hasMidiMagic', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it('bắt đầu bằng MThd', () => {
    expect(hasMidiMagic(bytes('MThd\x00\x00\x00\x06...'))).toBe(true);
  });

  it.each(['', 'MTh', ' MThd', 'RIFF', '\x89PNG\r\n'])('từ chối %j', (s) => {
    expect(hasMidiMagic(bytes(s))).toBe(false);
  });
});

describe('hasMp3Magic', () => {
  const bytes = (s: string) => new TextEncoder().encode(s);

  it('tag ID3 ở đầu', () => {
    expect(hasMp3Magic(bytes('ID3\x03\x00...'))).toBe(true);
  });

  it('frame sync MPEG (0xFF Ex)', () => {
    expect(hasMp3Magic(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toBe(true);
    expect(hasMp3Magic(Uint8Array.from([0xff, 0xe0, 0x00, 0x00]))).toBe(true);
  });

  it.each([
    ['rỗng', Uint8Array.from([])],
    ['1 byte 0xFF', Uint8Array.from([0xff])],
    ['0xFF nhưng không phải frame sync', Uint8Array.from([0xff, 0x00, 0x00])],
    ['PNG', bytes('\x89PNG\r\n')],
    ['ID sai (không phải ID3)', bytes('IDX\x03')],
  ])('từ chối %s', (_label, b) => {
    expect(hasMp3Magic(b)).toBe(false);
  });
});
