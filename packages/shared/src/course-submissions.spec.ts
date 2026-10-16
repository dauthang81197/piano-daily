import { describe, expect, it } from 'vitest';
import { parseDriveUrl, setSubmissionHiddenSchema, submissionUrlSchema, upsertSubmissionSchema } from './courses';

const ID = '1AbCdEfGhIjKlMnOp';
const DRIVE = `https://drive.google.com/file/d/${ID}/view`;
const YT = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

describe('parseDriveUrl', () => {
  it('nhận /file/d/ID, /open?id=, /uc?id= (thiếu scheme cũng được)', () => {
    expect(parseDriveUrl(`https://drive.google.com/file/d/${ID}/view?usp=sharing`)).toBe(ID);
    expect(parseDriveUrl(`drive.google.com/file/d/${ID}`)).toBe(ID);
    expect(parseDriveUrl(`https://drive.google.com/open?id=${ID}`)).toBe(ID);
    expect(parseDriveUrl(`https://drive.google.com/uc?export=download&id=${ID}`)).toBe(ID);
  });
  it('từ chối thư mục, domain giả, scheme lạ, user:pass, port, id ngắn', () => {
    for (const bad of [
      `https://drive.google.com/drive/folders/${ID}`,
      `https://drive.google.com.evil.com/file/d/${ID}/view`,
      `https://evil.com/file/d/${ID}/view`,
      `ftp://drive.google.com/file/d/${ID}/view`,
      `javascript:alert(1)`,
      `https://u:p@drive.google.com/file/d/${ID}/view`,
      `https://drive.google.com:8443/file/d/${ID}/view`,
      'https://drive.google.com/file/d/short/view',
      'https://drive.google.com/open',
      '',
      '   ',
    ]) {
      expect(parseDriveUrl(bad), bad).toBeNull();
    }
  });
});

describe('submissionUrlSchema', () => {
  it('chuẩn hoá YouTube và Drive, kèm kind', () => {
    expect(submissionUrlSchema.parse('  https://youtu.be/dQw4w9WgXcQ  ')).toEqual({ kind: 'YOUTUBE', url: YT });
    expect(submissionUrlSchema.parse(`https://drive.google.com/open?id=${ID}`)).toEqual({ kind: 'DRIVE', url: DRIVE });
  });
  it('link lạ bị từ chối', () => {
    for (const bad of ['https://vimeo.com/123', 'abc', 123, null, `https://x.com/?u=${YT}`]) {
      expect(submissionUrlSchema.safeParse(bad).success, String(bad)).toBe(false);
    }
  });
});

describe('upsertSubmissionSchema / setSubmissionHiddenSchema', () => {
  it('ghi chú được cắt khoảng trắng, rỗng/thiếu = null, quá 500 ký tự bị từ chối, trường thừa bị từ chối', () => {
    expect(upsertSubmissionSchema.parse({ url: YT, note: '  hi ' }).note).toBe('hi');
    expect(upsertSubmissionSchema.parse({ url: YT, note: '   ' }).note).toBeNull();
    expect(upsertSubmissionSchema.parse({ url: YT }).note).toBeNull();
    expect(upsertSubmissionSchema.safeParse({ url: YT, note: 'x'.repeat(501) }).success).toBe(false);
    expect(upsertSubmissionSchema.safeParse({ url: YT, note: 'a\u0000b' }).success).toBe(false);
    expect(upsertSubmissionSchema.safeParse({ url: YT, x: 1 }).success).toBe(false);
  });
  it('hidden phải là boolean', () => {
    expect(setSubmissionHiddenSchema.parse({ hidden: true })).toEqual({ hidden: true });
    expect(setSubmissionHiddenSchema.safeParse({ hidden: 'true' }).success).toBe(false);
    expect(setSubmissionHiddenSchema.safeParse({}).success).toBe(false);
  });
});
