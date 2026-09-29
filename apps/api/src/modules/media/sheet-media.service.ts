import { createHash } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import { FileType, PDF_MIME_TYPE } from '@piano-daily/shared';
import { PdfProcessor } from './pdf-processor';
import { StorageService } from './storage.service';

const WEBP_MIME_TYPE = 'image/webp';

/** Một object đã ghi lên storage, đủ thông tin để `catalog` tạo dòng `SheetFile`. */
export interface StoredFile {
  type: FileType;
  storageKey: string;
  size: number;
  mimeType: string;
  originalName: string | null;
  pageNumber: number | null;
}

export interface StoredPdf {
  pdf: StoredFile;
  thumbnail: StoredFile;
  pages: StoredFile[];
  /** Mọi key đã ghi trong lần xử lý này — `catalog` xoá chúng nếu commit DB thất bại. */
  keys: string[];
}

export interface PdfUpload {
  buffer: Buffer;
  originalName: string | null;
}

/**
 * Ghi object thất bại giữa chừng. KHÔNG tự xoá: key có thể trùng bản hiện hành (upload lại đúng nội dung cũ),
 * nên `catalog` (chủ bảng `SheetFile`) quyết định xoá key nào qua `keys`.
 */
export class StorageWriteError extends Error {
  constructor(
    readonly keys: string[],
    cause: unknown,
  ) {
    super('Ghi object lên storage thất bại', { cause });
    this.name = 'StorageWriteError';
  }
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

/** `{public|private}/sheets/{sheetId}/{fileType}/{name}` (AD-6). */
function sheetKey(zone: 'public' | 'private', sheetId: string, type: FileType, name: string): string {
  return `${zone}/sheets/${sheetId}/${type}/${name}`;
}

/**
 * Pipeline file của Sheet (module `media`). Xử lý xong và ghi mọi object, rồi trả danh sách để `catalog`
 * commit DB (hoặc gọi `discard` để xoá nếu commit thất bại). Lỗi trong lúc ghi thì ném `StorageWriteError` kèm key đã ghi.
 */
@Injectable()
export class SheetMediaService {
  private readonly logger = new Logger(SheetMediaService.name);

  constructor(
    private readonly pdfProcessor: PdfProcessor,
    private readonly storage: StorageService,
  ) {}

  /**
   * Render PDF (ném `PdfProcessingError` nếu không xử lý được — khi đó chưa ghi object nào), rồi ghi
   * PDF gốc vào vùng private, thumbnail và ảnh từng trang vào vùng public.
   */
  async storePdf(sheetId: string, upload: PdfUpload): Promise<StoredPdf> {
    const rendered = await this.pdfProcessor.render(upload.buffer);
    const pdfHash = sha256(upload.buffer);

    const pdf: StoredFile = {
      type: FileType.PDF,
      storageKey: sheetKey('private', sheetId, FileType.PDF, `${pdfHash}.pdf`),
      size: upload.buffer.length,
      mimeType: PDF_MIME_TYPE,
      originalName: upload.originalName,
      pageNumber: null,
    };
    const thumbnail: StoredFile = {
      type: FileType.THUMBNAIL,
      storageKey: sheetKey('public', sheetId, FileType.THUMBNAIL, `${sha256(rendered.thumbnail)}.webp`),
      size: rendered.thumbnail.length,
      mimeType: WEBP_MIME_TYPE,
      originalName: null,
      pageNumber: null,
    };
    const pages: StoredFile[] = rendered.pages.map((image, index) => ({
      type: FileType.PAGE_IMAGE,
      storageKey: sheetKey('public', sheetId, FileType.PAGE_IMAGE, `${pdfHash}-p${index + 1}.webp`),
      size: image.length,
      mimeType: WEBP_MIME_TYPE,
      originalName: null,
      pageNumber: index + 1,
    }));

    const written: string[] = [];
    const put = async (file: StoredFile, body: Buffer) => {
      // Ghi nhận TRƯỚC khi gửi: request lỗi giữa chừng vẫn có thể đã tạo object.
      written.push(file.storageKey);
      if (file.storageKey.startsWith('private/')) await this.storage.putPrivate(file.storageKey, body, file.mimeType);
      else await this.storage.putPublic(file.storageKey, body, file.mimeType);
    };

    try {
      await put(pdf, upload.buffer);
      await put(thumbnail, rendered.thumbnail);
      // Ghi song song theo lô nhỏ để không mở quá nhiều kết nối cùng lúc.
      for (let i = 0; i < pages.length; i += 8) {
        await Promise.all(pages.slice(i, i + 8).map((page, j) => put(page, rendered.pages[i + j]!)));
      }
    } catch (err) {
      throw new StorageWriteError(written, err);
    }
    return { pdf, thumbnail, pages, keys: written };
  }

  /** Xoá các object vừa ghi (rollback). Không bao giờ ném: lỗi xoá chỉ được log (GC Story 1.8 dọn sau). */
  async discard(keys: readonly string[]): Promise<void> {
    if (!keys.length) return;
    try {
      await this.storage.deleteObjects(keys);
    } catch (err) {
      this.logger.error({ err, count: keys.length }, 'Không xoá được object khi rollback upload');
    }
  }
}
