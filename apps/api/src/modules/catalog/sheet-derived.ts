import type { Prisma } from '../../generated/client';

/**
 * Tính lại các trường dẫn xuất của Sheet (`has_*`, `page_count`) — nơi DUY NHẤT ghi các cột này.
 * Phải chạy trong cùng transaction với thao tác ghi vừa làm thay đổi dữ liệu nguồn; khoá dòng Sheet
 * bằng `SELECT … FOR UPDATE` để hai lần ghi đồng thời không tính chồng lên nhau.
 *
 * Story 1.5: `has_chords` = lyrics & chords không rỗng, `has_video` = có `youtube_url`.
 * `has_sheet`, `has_midi`, `has_mp3`, `page_count` giữ nguyên (Story 1.6–1.7 bổ sung từ SheetFile).
 */
export async function recomputeDerived(sheetId: string, tx: Prisma.TransactionClient): Promise<void> {
  const rows = await tx.$queryRaw<{ lyrics_chords: string | null; youtube_url: string | null }[]>`
    SELECT lyrics_chords, youtube_url FROM sheets WHERE id = ${sheetId}::uuid FOR UPDATE`;
  const row = rows[0];
  if (!row) return;
  await tx.sheet.update({
    where: { id: sheetId },
    data: {
      hasChords: Boolean(row.lyrics_chords?.trim()),
      hasVideo: Boolean(row.youtube_url),
    },
  });
}
