import type { FingerPose } from '../hands/hand-path';
import type { Key } from '../keyboard-layout';

/**
 * Toạ độ thế giới của cảnh 3D, đơn vị "một phím trắng = 1" (≈ 23,5 mm). Trục x chạy dọc bàn phím (cùng `Key.x`), y hướng
 * lên (mặt phím trắng là 0), z hướng về phía người chơi: mép trước của phím ở z = 0, phím kéo dài ra xa tới z = −WHITE_LENGTH.
 */
export const KEY_UNIT_MM = 23.5;
export const WHITE_LENGTH = 150 / KEY_UNIT_MM;
export const BLACK_LENGTH = 95 / KEY_UNIT_MM;
/** Độ dày phần thấy được của phím trắng (xuống dưới mặt phím). */
export const WHITE_DEPTH = 0.9;
/** Phím đen nhô cao hơn mặt phím trắng chừng này. */
export const BLACK_RISE = 0.55;
/** Phím lún xuống chừng này khi bị bấm. */
export const PRESS_DEPTH = 0.3;
/** Chiều dài vùng nốt rơi phía xa đầu phím. */
export const FALL_LENGTH = 14;
/**
 * Cổ tay đặt cao và lùi về phía người chơi chừng này so với mép trước phím. Giá trị dò trên `hand-right.glb` sao cho ngón
 * chỉ cần cong nhẹ ở tư thế nghỉ và vẫn với tới mọi phím trong tầm (xem `hand-animator.test.ts`).
 */
export const WRIST_Y = 3.3;
export const WRIST_Z = 2;

/** Vị trí z của mép trước và mép sau (xa người chơi) của một phím. */
export function keyZRange(key: Pick<Key, 'black'>): { front: number; back: number } {
  return key.black ? { front: -(WHITE_LENGTH - BLACK_LENGTH), back: -WHITE_LENGTH } : { front: 0, back: -WHITE_LENGTH };
}

/** Độ cao mặt phím khi nhả. */
export const keyTopY = (key: Pick<Key, 'black'>) => (key.black ? BLACK_RISE : 0);

/**
 * Vị trí z trong vùng nốt rơi theo toạ độ chuẩn hoá của `FallingNote` (0 = xa nhất, 1 = chạm đầu phím phía xa).
 */
export const fallZ = (v: number) => -WHITE_LENGTH - (1 - v) * FALL_LENGTH;

/**
 * Đầu ngón ở tư thế nghỉ thả lỏng, tính từ cổ tay (phím trắng; y lên, z về phía xa là âm). Đây là kết quả forward
 * kinematics của `REST_PARAMS` trên `hand-right.glb` (có test đối chiếu), để ngón nghỉ đúng dáng cong tự nhiên chứ không
 * bị kéo tới một điểm tuỳ ý rồi co gắt.
 */
export const REST_TIP: Record<1 | 2 | 3 | 4 | 5, { y: number; z: number }> = {
  1: { y: -3.17, z: -2.61 },
  2: { y: -2.68, z: -5.95 },
  3: { y: -2.71, z: -6.18 },
  4: { y: -2.75, z: -5.64 },
  5: { y: -2.62, z: -4.81 },
};
/** Ngón vươn: lơ lửng phía trên phím rồi chạm (lún theo lực nhấn). Ngón út chỉ với tới phím đen ở gần mép trước. */
const HOVER = 0.25;
const WHITE_TOUCH_Z = -1.9;
const BLACK_TOUCH_Z = -2.6;
/** Ngón cái ngắn nên chạm phím trắng sát mép trước hơn các ngón dài. */
const SHORT_FINGER_SHIFT: Partial<Record<1 | 2 | 3 | 4 | 5, number>> = { 1: 1.2 };

export function fingerTarget(
  finger: Pick<FingerPose, 'finger' | 'tipX' | 'reach' | 'press'> & { black: boolean; blackMix?: number },
): { x: number; y: number; z: number } {
  // `blackMix` (liên tục) tránh nhảy mục tiêu khi ngón chuyển giữa phím trắng và phím đen.
  const mix = finger.blackMix ?? (finger.black ? 1 : 0);
  const topY = BLACK_RISE * mix;
  const touchZ = WHITE_TOUCH_Z + (BLACK_TOUCH_Z - WHITE_TOUCH_Z) * mix + ((SHORT_FINGER_SHIFT[finger.finger] ?? 0) * (1 - mix));
  const keyY = topY + HOVER * (1 - finger.press) - PRESS_DEPTH * finger.press;
  const w = finger.reach;
  const restY = WRIST_Y + REST_TIP[finger.finger].y;
  const restZ = WRIST_Z + REST_TIP[finger.finger].z;
  return { x: finger.tipX, y: restY + (keyY - restY) * w, z: restZ + (touchZ - restZ) * w };
}
