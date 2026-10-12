/** Các nốt bắt đầu trong khoảng này (giây) kể từ nốt đầu nhóm được coi là một lần đánh (hợp âm). */
export const ONSET_WINDOW = 0.04;

/**
 * Gom chỉ số nốt thành các nhóm cùng lúc đánh, theo thứ tự thời gian. Mỗi nhóm sắp theo cao độ tăng dần.
 * `indices` mặc định là mọi nốt.
 */
export function groupOnsets(
  notes: readonly { time: number; midi: number }[],
  indices: readonly number[] = notes.map((_, i) => i),
): number[][] {
  const order = [...indices].sort((a, b) => notes[a]!.time - notes[b]!.time || notes[a]!.midi - notes[b]!.midi || a - b);
  const groups: number[][] = [];
  let start = -Infinity;
  for (const i of order) {
    const time = notes[i]!.time;
    if (groups.length === 0 || time - start > ONSET_WINDOW) {
      groups.push([i]);
      start = time;
    } else {
      groups[groups.length - 1]!.push(i);
    }
  }
  for (const g of groups) g.sort((a, b) => notes[a]!.midi - notes[b]!.midi || a - b);
  return groups;
}
