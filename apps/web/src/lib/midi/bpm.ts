import type { NoteHeader } from './note-json';

/** BPM gốc mặc định khi note-JSON không có thông tin tempo (chuẩn MIDI: 120). */
export const DEFAULT_BPM = 120;
/** BPM phát lúc mới mở bài (người học chủ động tăng dần); kẹp vào khoảng tốc độ cho phép nếu tempo gốc lệch quá xa. */
export const START_BPM = 70;
/** Tốc độ phát tối thiểu/tối đa so với bản gốc. */
export const MIN_RATE = 0.25;
export const MAX_RATE = 2;

/** BPM gốc = tempo ĐẦU TIÊN của bài (bài nhiều tempo: mọi tempo đều nhân cùng hệ số tốc độ). */
export function baseBpm(header: Pick<NoteHeader, 'tempos'> | undefined): number {
  const first = header?.tempos[0]?.bpm;
  return first && Number.isFinite(first) && first > 0 ? first : DEFAULT_BPM;
}

export const clampRate = (rate: number): number => Math.min(MAX_RATE, Math.max(MIN_RATE, rate));

/** BPM hiển thị cho một tốc độ: `round(gốc × tốc độ)`. */
export const displayBpm = (base: number, rate: number): number => Math.round(base * rate);

/** Tốc độ ứng với một BPM đích (đã kẹp vào khoảng cho phép). */
export const rateForBpm = (base: number, bpm: number): number => clampRate(bpm / base);

/**
 * Đổi BPM hiển thị đi `delta` đơn vị (±1 mỗi lần bấm). Nếu tốc độ mới trùng tốc độ cũ (đã chạm biên, hoặc BPM gốc quá
 * lớn khiến 1 BPM nhỏ hơn độ phân giải) thì trả `null` để người gọi không làm gì.
 */
export function stepBpm(base: number, rate: number, delta: 1 | -1): number | null {
  const next = rateForBpm(base, displayBpm(base, rate) + delta);
  return next === rate ? null : next;
}

/** Nút −/+ còn dùng được không (chưa chạm biên 0.25×/2×). */
export const canStepBpm = (base: number, rate: number, delta: 1 | -1): boolean => (delta === 1 ? rate < MAX_RATE : rate > MIN_RATE) && stepBpm(base, rate, delta) !== null;
