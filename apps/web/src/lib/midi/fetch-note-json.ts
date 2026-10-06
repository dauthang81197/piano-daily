/** Quá thời gian này mà chưa tải xong note-JSON thì coi như lỗi (để người dùng thử lại). */
export const NOTE_JSON_TIMEOUT_MS = 15_000;

/** Tải note-JSON công khai (CORS GET từ bucket public, không credentials), có timeout. */
export async function fetchNoteJson(url: string, timeoutMs = NOTE_JSON_TIMEOUT_MS): Promise<unknown> {
  const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`Tải note-JSON thất bại: ${res.status}`);
  return res.json();
}
