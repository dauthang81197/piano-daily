import type { Prisma } from '../../generated/client';

/**
 * Tính lại các trường dẫn xuất của Sheet (`has_*`, `page_count`) — nơi DUY NHẤT ghi các cột này.
 * Phải chạy trong cùng transaction với thao tác ghi vừa làm thay đổi dữ liệu nguồn; khoá dòng Sheet
 * bằng `SELECT … FOR UPDATE` để hai lần ghi đồng thời không tính chồng lên nhau.
 *
 * - `has_chords` = lyrics & chords không rỗng; `has_video` = có `youtube_url` (Story 1.5).
 * - `has_sheet` = có PDF hiện hành; `page_count` = số PAGE_IMAGE hiện hành (Story 1.6).
 * - `has_midi`, `has_mp3` giữ nguyên (Story 1.7).
 */
export async function recomputeDerived(sheetId: string, tx: Prisma.TransactionClient): Promise<void> {
  const rows = await tx.$queryRaw<{ lyrics_chords: string | null; youtube_url: string | null }[]>`
    SELECT lyrics_chords, youtube_url FROM sheets WHERE id = ${sheetId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) return;
  // Tuần tự: cùng một kết nối của transaction.
  const pdfCount = await tx.sheetFile.count({ where: { sheetId, type: 'PDF', supersededAt: null } });
  const pageCount = await tx.sheetFile.count({ where: { sheetId, type: 'PAGE_IMAGE', supersededAt: null } });
  await tx.sheet.update({
    where: { id: sheetId },
    data: {
      hasChords: Boolean(row.lyrics_chords?.trim()),
      hasVideo: Boolean(row.youtube_url),
      hasSheet: pdfCount > 0,
      pageCount,
    },
  });
}
