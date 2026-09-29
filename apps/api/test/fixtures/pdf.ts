/**
 * Sinh PDF hợp lệ tối giản bằng code (không commit file nhị phân): `pageCount` trang A4,
 * mỗi trang in "Trang N" và một khung, để pdftoppm render ra ảnh khác nhau theo trang.
 * `label` đổi nội dung (và do đó hash) giữa các fixture cùng số trang.
 */
export function makePdf(pageCount: number, label = 'fixture'): Buffer {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length; // số hiệu object (bắt đầu từ 1)
  };

  const catalogId = add(''); // điền sau khi biết id của Pages
  const pagesId = add('');
  const fontId = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  const pageIds: number[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const text = `BT /F1 36 Tf 72 720 Td (Trang ${n} - ${label.replace(/[()\\]/g, '')}) Tj ET 50 50 495 742 re S`;
    const contentId = add(`<< /Length ${Buffer.byteLength(text)} >>\nstream\n${text}\nendstream`);
    pageIds.push(
      add(
        `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
      ),
    );
  }
  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xrefAt = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) out += `${String(offset).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

/** Bắt đầu bằng `%PDF-` nhưng nội dung là rác. */
export function corruptPdf(): Buffer {
  return Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(2048, 0x41), Buffer.from('\nnot a pdf at all\n')]);
}

/** PNG 1x1 thật (đổi đuôi thành .pdf trong test). */
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
