import { chmod, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PdfProcessingError, PdfProcessor } from '../../src/modules/media/pdf-processor';
import { corruptPdf, makePdf, PNG_1X1 } from '../fixtures/pdf';

const tempDirs = async () => (await readdir(tmpdir())).filter((name) => name.startsWith('pd-pdf-')).sort();

// Log cảnh báo của PdfProcessor (stderr pdftoppm) không cần hiện khi chạy test.
Logger.overrideLogger(false);

describe('PdfProcessor (pdftoppm + sharp thật)', () => {
  const processor = new PdfProcessor();

  it('PDF 3 trang -> 3 ảnh webp rộng 1400px, thumbnail 480px; dọn thư mục tạm', async () => {
    const before = await tempDirs();
    const result = await processor.render(makePdf(3));
    expect(result.pageCount).toBe(3);
    expect(result.pages).toHaveLength(3);
    for (const page of result.pages) {
      const meta = await sharp(page).metadata();
      expect(meta.format).toBe('webp');
      expect(meta.width).toBe(1400);
    }
    const thumb = await sharp(result.thumbnail).metadata();
    expect(thumb).toMatchObject({ format: 'webp', width: 480 });
    // Trang khác nhau cho ra ảnh khác nhau (đúng thứ tự trang, không lặp trang 1).
    expect(new Set(result.pages.map((p) => p.toString('base64'))).size).toBe(3);
    expect(await tempDirs()).toEqual(before);
  });

  it('quá số trang cho phép -> PdfProcessingError nêu giới hạn', async () => {
    const small = new PdfProcessor({ maxPages: 2 });
    await expect(small.render(makePdf(3))).rejects.toThrow(/hơn 2 trang/);
    await expect(small.render(makePdf(2))).resolves.toMatchObject({ pageCount: 2 });
  });

  it('PDF > 100 trang (giới hạn mặc định) -> PdfProcessingError', async () => {
    await expect(processor.render(makePdf(101))).rejects.toThrow(/hơn 100 trang/);
  }, 60_000);

  it.each([
    ['PDF hỏng', corruptPdf()],
    ['PNG', PNG_1X1],
  ])('%s -> PdfProcessingError, thư mục tạm được dọn', async (_label, input) => {
    const before = await tempDirs();
    const err = await processor.render(input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PdfProcessingError);
    expect((err as PdfProcessingError).reason).toMatch(/Không đọc được file PDF/);
    expect(await tempDirs()).toEqual(before);
  });

  describe('lỗi môi trường', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'pd-test-'));
    });
    afterAll(async () => {
      await rm(dir, { recursive: true, force: true });
    });

    it('pdftoppm chạy quá thời gian -> bị kill, PdfProcessingError "quá thời gian"', async () => {
      const slow = path.join(dir, 'slow-pdftoppm');
      await writeFile(slow, '#!/bin/sh\nsleep 10\n');
      await chmod(slow, 0o755);
      const started = Date.now();
      await expect(new PdfProcessor({ binary: slow, timeoutMs: 300 }).render(makePdf(1))).rejects.toThrow(/quá thời gian/);
      expect(Date.now() - started).toBeLessThan(5_000);
    });

    async function fakeBinary(name: string, script: string) {
      const file = path.join(dir, name);
      await writeFile(file, `#!/bin/sh\n${script}\n`);
      await chmod(file, 0o755);
      return file;
    }

    it('pdftoppm chết vì signal khác (không phải timeout) -> "Không đọc được file PDF"', async () => {
      const crash = await fakeBinary('crash-pdftoppm', 'kill -TERM $$');
      await expect(new PdfProcessor({ binary: crash }).render(makePdf(1))).rejects.toThrow(/Không đọc được file PDF/);
      const segv = await fakeBinary('killed-pdftoppm', 'kill -KILL $$');
      await expect(new PdfProcessor({ binary: segv }).render(makePdf(1))).rejects.toThrow(/Không đọc được file PDF/);
    });

    it('stderr vượt maxBuffer -> "Không đọc được file PDF" (không báo quá thời gian)', async () => {
      const noisy = await fakeBinary('noisy-pdftoppm', 'i=0; while [ $i -lt 2000 ]; do echo "Syntax Error: xxxxxxxxxxxxxxxx" >&2; i=$((i+1)); done; sleep 5');
      const err = await new PdfProcessor({ binary: noisy, maxBufferBytes: 1024 }).render(makePdf(1)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PdfProcessingError);
      expect((err as PdfProcessingError).reason).toMatch(/Không đọc được file PDF/);
    });

    it('sharp không đọc được ảnh trang -> PdfProcessingError "Không xử lý được ảnh trang PDF"', async () => {
      // Giả pdftoppm: tạo page-1.png là dữ liệu rác (tham số cuối là prefix đầu ra).
      const garbage = await fakeBinary('garbage-pdftoppm', 'for a; do last=$a; done; printf "not a png" > "$last-1.png"');
      const err = await new PdfProcessor({ binary: garbage }).render(makePdf(1)).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PdfProcessingError);
      expect((err as PdfProcessingError).reason).toMatch(/Không xử lý được ảnh trang PDF/);
    });

    it('không có pdftoppm -> lỗi hệ thống (không phải lỗi của file)', async () => {
      const err = await new PdfProcessor({ binary: path.join(dir, 'missing') }).render(makePdf(1)).catch((e: unknown) => e);
      expect(err).not.toBeInstanceOf(PdfProcessingError);
      expect((err as NodeJS.ErrnoException).code).toBe('ENOENT');
    });
  });
});
