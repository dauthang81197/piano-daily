/** Điểm lặp A/B (giây) do người dùng đặt; `null` = chưa đặt (A mặc định là đầu bài, B mặc định là cuối bài). */
export interface LoopState {
  on: boolean;
  a: number | null;
  b: number | null;
}

export const LOOP_OFF: LoopState = { on: false, a: null, b: null };

/** Đoạn lặp thực sự áp vào lõi: `null` khi tắt hoặc đoạn không hợp lệ (A phải cách B ít nhất 0.1 giây). */
export function loopRange(state: LoopState, duration: number): { start: number; end: number } | null {
  if (!state.on || duration <= 0) return null;
  const start = Math.max(0, state.a ?? 0);
  const end = Math.min(duration, state.b ?? duration);
  return end - start >= 0.1 ? { start, end } : null;
}

/** Đặt điểm A tại `position`; nếu B đã đặt mà nằm trước A thì bỏ B (đoạn không hợp lệ). Đặt điểm nào cũng bật lặp. */
export function setPointA(state: LoopState, position: number): LoopState {
  const a = Math.max(0, position);
  return { on: true, a, b: state.b !== null && state.b - a < 0.1 ? null : state.b };
}

/** Đặt điểm B tại `position`; nếu A đã đặt mà nằm sau B thì bỏ A. */
export function setPointB(state: LoopState, position: number): LoopState {
  const b = Math.max(0, position);
  return { on: true, b, a: state.a !== null && b - state.a < 0.1 ? null : state.a };
}

/** Nút Lặp: bật/tắt, giữ nguyên A/B đã đặt. */
export const toggleLoop = (state: LoopState): LoopState => ({ ...state, on: !state.on });

/** Xoá A/B và tắt lặp. */
export const clearLoop = (): LoopState => LOOP_OFF;
