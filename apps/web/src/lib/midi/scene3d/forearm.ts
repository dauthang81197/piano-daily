/**
 * Hình học cẳng tay và tay áo (thuần, không import `three`: `piano-scene.ts` dựng `LatheGeometry` từ các điểm này). Khung tay:
 * cổ tay ở gốc, trục z hướng về phía người chơi (cẳng tay đi theo +z), đơn vị "một phím trắng = 1".
 *
 * Kích thước cổ tay đo từ các đỉnh lưới của `hand-right.glb` theo lát z (−0,4…0,8): nửa rộng ≈ 1,1, nửa cao ≈ 0,8, tâm
 * ≈ (0,05; −0,1). Lưới mở nghiêng: mặt lưng bàn tay kết thúc sớm (z ≈ 0,7) còn mặt lòng bàn tay tới z ≈ 0,95, nên cẳng tay
 * bắt đầu ở 0,5 để chồng lên mép và không lộ mặt cắt cổ tay.
 */
export const WRIST_CENTER = { x: 0.05, y: -0.1 } as const;
export const WRIST_HALF_WIDTH = 1.13;
export const WRIST_HALF_HEIGHT = 0.78;
/** Tỉ lệ cao/rộng của mặt cắt (elip): giữ không đổi dọc cẳng tay. */
export const FOREARM_ASPECT = WRIST_HALF_HEIGHT / WRIST_HALF_WIDTH;
/** Cẳng tay bắt đầu chồng lên mép lưới ở z này và dài tới z này. */
export const FOREARM_START_Z = 0.5;
export const FOREARM_END_Z = 10.5;
/** Nửa rộng ở khuỷu (đầu xa cổ tay): cẳng tay nở dần từ cổ tay. */
export const FOREARM_END_HALF_WIDTH = 1.6;
/** Tay áo bắt đầu cách cổ tay ít nhất chừng này và rộng hơn cẳng tay chừng này. */
export const SLEEVE_START_Z = 3.6;
export const SLEEVE_THICKNESS = 0.22;
/** Viền cổ tay áo loe ra rồi thu về chừng này (dài theo z). */
export const SLEEVE_HEM = 0.35;

export interface ProfilePoint {
  /** Nửa rộng (bán kính theo trục x) tại khoảng cách `z` từ cổ tay. */
  radius: number;
  z: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

/** Nửa rộng của cẳng tay tại `z`: nở dần và mượt từ cổ tay tới khuỷu. */
export function forearmRadius(z: number): number {
  const t = Math.min(1, Math.max(0, (z - FOREARM_START_Z) / (FOREARM_END_Z - FOREARM_START_Z)));
  return WRIST_HALF_WIDTH + (FOREARM_END_HALF_WIDTH - WRIST_HALF_WIDTH) * smooth(t);
}

/** Các điểm của cẳng tay từ cổ tay tới khuỷu (`samples + 1` điểm), kết thúc bằng nắp đóng để không thấy lỗ hổng. */
export function forearmProfile(samples = 14): ProfilePoint[] {
  samples = Math.max(1, Math.floor(samples));
  const points: ProfilePoint[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const z = FOREARM_START_Z + ((FOREARM_END_Z - FOREARM_START_Z) * i) / samples;
    points.push({ radius: forearmRadius(z), z });
  }
  points.push({ radius: 0, z: FOREARM_END_Z });
  return points;
}

/** Các điểm của tay áo: viền loe nhẹ ở đầu gần cổ tay, rồi rộng hơn cẳng tay `SLEEVE_THICKNESS` tới khuỷu, kết thúc bằng nắp đóng. */
export function sleeveProfile(samples = 8): ProfilePoint[] {
  samples = Math.max(1, Math.floor(samples));
  const start = SLEEVE_START_Z;
  const points: ProfilePoint[] = [
    // Mép trong của viền (áp sát da) rồi loe ra thành miệng áo.
    { radius: forearmRadius(start) + 0.02, z: start },
    { radius: forearmRadius(start + SLEEVE_HEM) + SLEEVE_THICKNESS + 0.08, z: start + SLEEVE_HEM * 0.5 },
    { radius: forearmRadius(start + SLEEVE_HEM) + SLEEVE_THICKNESS, z: start + SLEEVE_HEM },
  ];
  for (let i = 1; i <= samples; i += 1) {
    const z = start + SLEEVE_HEM + ((FOREARM_END_Z - start - SLEEVE_HEM) * i) / samples;
    points.push({ radius: forearmRadius(z) + SLEEVE_THICKNESS, z });
  }
  points.push({ radius: 0, z: FOREARM_END_Z });
  return points;
}
