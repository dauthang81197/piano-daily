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
/** Cổ tay đặt cao và lùi về phía người chơi chừng này so với mép trước phím. */
export const WRIST_Y = 3;
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

/** Điểm đầu ngón hướng tới: ngón nghỉ lơ lửng gần phím, ngón vươn thì chạm mặt phím (lún theo lực nhấn). */
const REST_Y = 0.9;
const REST_Z = -0.7;
const HOVER = 0.25;
const WHITE_TOUCH_Z = -1.9;
const BLACK_TOUCH_Z = -3.5;
/** Ngón cái chạm gần mép trước hơn một chút. */
const THUMB_TOUCH_SHIFT = 0.4;

export function fingerTarget(finger: Pick<FingerPose, 'finger' | 'tipX' | 'reach' | 'press' | 'black'>): { x: number; y: number; z: number } {
  const topY = finger.black ? BLACK_RISE : 0;
  const touchZ = (finger.black ? BLACK_TOUCH_Z : WHITE_TOUCH_Z) + (finger.finger === 1 && !finger.black ? THUMB_TOUCH_SHIFT : 0);
  const keyY = topY + HOVER * (1 - finger.press) - PRESS_DEPTH * finger.press;
  const w = finger.reach;
  return { x: finger.tipX, y: REST_Y + (keyY - REST_Y) * w, z: REST_Z + (touchZ - REST_Z) * w };
}
