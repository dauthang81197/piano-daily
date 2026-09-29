import { execFile } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { PDF_MAX_PAGES } from '@piano-daily/shared';
import sharp from 'sharp';

const execFileAsync = promisify(execFile);

/** Chiều rộng tối đa của ảnh trang và thumbnail (px). */
export const PAGE_IMAGE_MAX_WIDTH = 1400;
export const THUMBNAIL_WIDTH = 480;
export const WEBP_QUALITY = 80;
/** Thời gian tối đa cho `pdftoppm` (ms). */
export const PDFTOPPM_TIMEOUT_MS = 120_000;

export interface RenderedPdf {
  pageCount: number;
  /** Ảnh webp từng trang, theo thứ tự trang (index 0 = trang 1). */
  pages: Buffer[];
  /** Thumbnail webp (trang 1). */
  thumbnail: Buffer;
}

/** PDF không xử lý được (hỏng, không có trang, quá nhiều trang, quá thời gian). `reason` hiển thị được cho founder. */
export class PdfProcessingError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = 'PdfProcessingError';
  }
}

/** Token DI tuỳ chọn để ghi đè cấu hình (test). */
export const PDF_PROCESSOR_OPTIONS = Symbol('PDF_PROCESSOR_OPTIONS');

export interface PdfProcessorOptions {
  /** Đường dẫn/tên lệnh `pdftoppm` (mặc định tìm trong PATH). */
  binary?: string;
  timeoutMs?: number;
  maxPages?: number;
  /** Giới hạn byte stdout/stderr của `pdftoppm` (mặc định 1MB; stdout bị bỏ qua, stderr chỉ để log). */
  maxBufferBytes?: number;
}

/** Số ký tự stderr tối đa đưa vào log. */
const STDERR_LOG_LIMIT = 2000;
const UNREADABLE_PDF = 'Không đọc được file PDF (file có thể bị hỏng hoặc được bảo vệ bằng mật khẩu).';
const IMAGE_FAILED = 'Không xử lý được ảnh trang PDF. Hãy xuất lại file PDF rồi thử lại.';

/**
 * Render PDF thành ảnh webp: `pdftoppm` (execFile, không qua shell) trong thư mục tạm riêng, rồi sharp.
 * Chỉ render tối đa `maxPages + 1` trang: có trang thứ `maxPages + 1` nghĩa là PDF quá dài (không render hết).
 */
@Injectable()
export class PdfProcessor {
  private readonly binary: string;
  private readonly timeoutMs: number;
  private readonly maxPages: number;
  private readonly maxBufferBytes: number;
  private readonly logger = new Logger(PdfProcessor.name);

  constructor(@Optional() @Inject(PDF_PROCESSOR_OPTIONS) options: PdfProcessorOptions | null = null) {
    options ??= {};
    this.binary = options.binary ?? 'pdftoppm';
    this.timeoutMs = options.timeoutMs ?? PDFTOPPM_TIMEOUT_MS;
    this.maxPages = options.maxPages ?? PDF_MAX_PAGES;
    this.maxBufferBytes = options.maxBufferBytes ?? 1024 * 1024;
  }

  async render(pdf: Buffer): Promise<RenderedPdf> {
    const dir = await mkdtemp(path.join(tmpdir(), 'pd-pdf-'));
    try {
      const input = path.join(dir, 'input.pdf');
      await writeFile(input, pdf);
      const pngs = await this.rasterize(dir, input);
      if (pngs.length === 0) throw new PdfProcessingError('PDF không có trang nào.');
      if (pngs.length > this.maxPages) {
        throw new PdfProcessingError(`PDF có hơn ${this.maxPages} trang. Hãy tách file thành các phần tối đa ${this.maxPages} trang.`);
      }
      return await this.toWebp(dir, pngs);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** PNG → webp bằng sharp. Lỗi của sharp (ảnh hỏng, quá lớn…) thành `PdfProcessingError`. */
  private async toWebp(dir: string, pngs: string[]): Promise<RenderedPdf> {
    const pages: Buffer[] = [];
    let thumbnail: Buffer | undefined;
    try {
      for (const [index, file] of pngs.entries()) {
        const png = await readFile(path.join(dir, file));
        pages.push(
          await sharp(png)
            .resize({ width: PAGE_IMAGE_MAX_WIDTH, withoutEnlargement: true })
            .webp({ quality: WEBP_QUALITY })
            .toBuffer(),
        );
        if (index === 0) {
          thumbnail = await sharp(png).resize({ width: THUMBNAIL_WIDTH }).webp({ quality: WEBP_QUALITY }).toBuffer();
        }
      }
    } catch (err) {
      this.logger.error({ err, pageCount: pngs.length }, 'sharp không chuyển được ảnh trang PDF');
      throw new PdfProcessingError(IMAGE_FAILED);
    }
    return { pageCount: pages.length, pages, thumbnail: thumbnail! };
  }

  /** Chạy `pdftoppm`, trả tên file PNG theo thứ tự trang. */
  private async rasterize(dir: string, input: string): Promise<string[]> {
    const outPrefix = path.join(dir, 'page');
    try {
      await execFileAsync(
        this.binary,
        [
          '-png',
          '-l',
          String(this.maxPages + 1),
          // Chiều rộng cố định, chiều cao theo tỉ lệ trang: giới hạn bộ nhớ kể cả với trang khổ lớn.
          '-scale-to-x',
          String(PAGE_IMAGE_MAX_WIDTH),
          '-scale-to-y',
          '-1',
          input,
          outPrefix,
        ],
        // pdftoppm ghi ảnh ra file; stdout không dùng, stdout/stderr bị chặn ở `maxBuffer`.
        { timeout: this.timeoutMs, killSignal: 'SIGKILL', maxBuffer: this.maxBufferBytes, windowsHide: true },
      );
    } catch (err) {
      const e = err as NodeJS.ErrnoException & { killed?: boolean; signal?: string | null; stderr?: unknown };
      // Không có pdftoppm: lỗi cấu hình máy chủ, không phải lỗi của file.
      if (e.code === 'ENOENT') throw err;
      const stderr = typeof e.stderr === 'string' ? e.stderr.slice(0, STDERR_LOG_LIMIT) : '';
      this.logger.warn({ exitCode: e.code, signal: e.signal, stderr }, 'pdftoppm thất bại');
      // Chỉ SIGKILL do Node gửi khi hết `timeout` mới là "quá thời gian". Vượt maxBuffer cũng bị Node kill
      // (killed = true) nhưng mang code riêng; signal khác (crash, bị kill từ ngoài) coi như không đọc được file.
      const timedOut = e.killed === true && e.signal === 'SIGKILL' && e.code !== 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
      if (timedOut) {
        throw new PdfProcessingError('Xử lý PDF quá thời gian cho phép. Hãy thử file nhẹ hơn hoặc ít trang hơn.');
      }
      throw new PdfProcessingError(UNREADABLE_PDF);
    }
    const files = (await readdir(dir)).filter((f) => /^page-\d+\.png$/.test(f));
    return files.sort((a, b) => pageNumberOf(a) - pageNumberOf(b));
  }
}

function pageNumberOf(file: string): number {
  return Number(/-(\d+)\.png$/.exec(file)![1]);
}
