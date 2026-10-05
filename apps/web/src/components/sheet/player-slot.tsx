/**
 * Vị trí của MIDI player trong bố cục trang chi tiết (giữa meta và ảnh trang).
 * Cố ý trả `null` cho tới Story 2.8: không hiện khối giả. 2.8 thay thân component này, thứ tự bố cục giữ nguyên.
 */
export function PlayerSlot(_props: { midi: { noteJsonUrl: string; durationSeconds: number; noteCount: number } | null }) {
  return null;
}
