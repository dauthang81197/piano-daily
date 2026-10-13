import { WHITE_LENGTH } from './keyboard-geometry';

/**
 * Cài đặt góc nhìn và màu của cảnh 3D (người xem tự chỉnh, lưu theo trình duyệt). Thuần và không import `three`, nên
 * nằm trong bundle ban đầu của player mà không kéo thư viện 3D (xem `midi-player-bundle.test.ts`).
 */
export interface ViewSettings {
  /** Góc nâng của camera so với mặt phím (độ). */
  elevation: number;
  /** Góc xoay quanh điểm nhìn (độ), 0 là nhìn thẳng từ phía người chơi. */
  azimuth: number;
  /** Độ gần: lớn hơn 1 là gần hơn. */
  zoom: number;
  /** Màu bàn tay, dạng `#rrggbb`. */
  handColor: string;
  /** Màu thanh nốt rơi của phím trắng (cũng là màu phím đang bấm). */
  noteWhiteColor: string;
  /** Màu thanh nốt rơi của phím đen. */
  noteBlackColor: string;
}

export const VIEW_LIMITS = {
  elevation: { min: 20, max: 80, step: 1 },
  azimuth: { min: -40, max: 40, step: 1 },
  zoom: { min: 0.6, max: 1.6, step: 0.05 },
} as const;

/** Mặc định trùng đúng giao diện trước khi có cài đặt: nghiêng 54°, nhìn thẳng, màu brass và da. */
export const DEFAULT_VIEW_SETTINGS: Readonly<ViewSettings> = {
  elevation: 54,
  azimuth: 0,
  zoom: 1,
  handColor: '#dcae8c',
  noteWhiteColor: '#b8893a',
  noteBlackColor: '#8c6a2c',
};

export const VIEW_STORAGE_KEY = 'piano-daily:view-settings';

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const NUMERIC_KEYS = ['elevation', 'azimuth', 'zoom'] as const;
const COLOR_KEYS = ['handColor', 'noteWhiteColor', 'noteBlackColor'] as const;

/** `#rrggbb` hợp lệ (không phân biệt hoa thường). */
export const isHexColor = (value: unknown): value is string => typeof value === 'string' && HEX_COLOR.test(value);

/**
 * Đưa dữ liệu bất kỳ (JSON đã lưu, giá trị người dùng) về `ViewSettings` hợp lệ: số được kẹp vào giới hạn (NaN, thiếu hoặc
 * không phải số thì lấy mặc định), màu sai định dạng thì lấy mặc định, màu hợp lệ chuyển về chữ thường. Không bao giờ ném.
 */
export function sanitizeViewSettings(raw: unknown): ViewSettings {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const result: ViewSettings = { ...DEFAULT_VIEW_SETTINGS };
  for (const key of NUMERIC_KEYS) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = Math.min(VIEW_LIMITS[key].max, Math.max(VIEW_LIMITS[key].min, value));
    }
  }
  for (const key of COLOR_KEYS) {
    const value = source[key];
    if (isHexColor(value)) result[key] = value.toLowerCase();
  }
  return result;
}

export function isDefaultViewSettings(settings: ViewSettings): boolean {
  const a = sanitizeViewSettings(settings);
  return (Object.keys(DEFAULT_VIEW_SETTINGS) as (keyof ViewSettings)[]).every((k) => a[k] === DEFAULT_VIEW_SETTINGS[k]);
}

export interface CameraPlacement {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/** Điểm camera nhìn vào: giữa bàn phím, ở mặt phím, giữa phím và mặt nốt rơi. */
const TARGET_Z = -4.5;
/** Lề hai bên bàn phím khi vừa khít bề ngang. */
const FIT_MARGIN = 1.08;

/** Bàn phím được coi là "trong khung" khi các góc của nó nằm trong ±`FRAME_LIMIT` của khung nhìn (cho cắt tối đa 5%). */
const FRAME_LIMIT = 1.05;
/** Lùi xa tối đa gấp chừng này lần khoảng cách vừa bề ngang khi xoay/nghiêng cực đoan. */
const MAX_FIT_SCALE = 3;

const dot = (a: readonly number[], b: readonly number[]) => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const sub = (a: readonly number[], b: readonly number[]) => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const cross = (a: readonly number[], b: readonly number[]) => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];
const unit = (a: readonly number[]) => {
  const n = Math.hypot(a[0]!, a[1]!, a[2]!);
  return [a[0]! / n, a[1]! / n, a[2]! / n];
};

function orbit(settings: ViewSettings, distance: number, keyboardWidth: number): CameraPlacement {
  const elevation = (settings.elevation * Math.PI) / 180;
  const azimuth = (settings.azimuth * Math.PI) / 180;
  const target = { x: keyboardWidth / 2, y: 0, z: TARGET_Z };
  const radius = distance * Math.cos(elevation);
  return {
    target,
    position: {
      x: target.x + radius * Math.sin(azimuth),
      y: target.y + distance * Math.sin(elevation),
      z: target.z + radius * Math.cos(azimuth),
    },
  };
}

/** Hình chiếu (toạ độ chuẩn hoá, ±1 là mép khung) của bốn góc bàn phím ở mặt phím, nhìn từ `placement`. */
function keyboardCorners(placement: CameraPlacement, keyboardWidth: number, tanHalfH: number, tanHalfV: number) {
  const p = [placement.position.x, placement.position.y, placement.position.z];
  const forward = unit(sub([placement.target.x, placement.target.y, placement.target.z], p));
  const right = unit(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return [
    [0, 0, 0],
    [keyboardWidth, 0, 0],
    [0, 0, -WHITE_LENGTH],
    [keyboardWidth, 0, -WHITE_LENGTH],
  ].map((corner) => {
    const v = sub(corner, p);
    const depth = dot(v, forward);
    return { x: dot(v, right) / (depth * tanHalfH), y: dot(v, up) / (depth * tanHalfV) };
  });
}

/**
 * Vị trí camera. Khoảng cách vừa khít bề ngang bàn phím (cộng lề); khi xoay hoặc nghiêng cực đoan làm bàn phím tràn khung
 * thì lùi xa thêm vừa đủ để bốn góc bàn phím vẫn trong khung (cho cắt tối đa 5%); sau đó chia cho `zoom` (phóng to có chủ ý
 * nên không còn đảm bảo vừa khung). Camera quay quanh điểm nhìn theo `azimuth`, nâng theo `elevation`. Với cài đặt mặc định
 * cho đúng vị trí cũ (nghiêng 54°, nhìn thẳng).
 */
export function cameraPlacement(settings: ViewSettings, aspect: number, keyboardWidth: number, fovDegrees = 45): CameraPlacement {
  const tanHalfV = Math.tan((fovDegrees * Math.PI) / 360);
  const tanHalfH = tanHalfV * aspect;
  const base = (keyboardWidth * FIT_MARGIN) / 2 / tanHalfH;
  const corners = (view: ViewSettings, scale: number) =>
    keyboardCorners(orbit(view, base * scale, keyboardWidth), keyboardWidth, tanHalfH, tanHalfV);
  // Ngưỡng "trong khung": ít nhất là FRAME_LIMIT và không chặt hơn chính khung của góc nhìn mặc định ở tỉ lệ này (để
  // mặc định luôn giữ nguyên vị trí cũ, kể cả khi tỉ lệ khung khác 2:1).
  const reference = corners({ ...DEFAULT_VIEW_SETTINGS }, 1);
  const limitX = Math.max(FRAME_LIMIT, ...reference.map((c) => Math.abs(c.x)));
  const limitY = Math.max(FRAME_LIMIT, ...reference.map((c) => -c.y));
  const fits = (scale: number) => corners(settings, scale).every((c) => Math.abs(c.x) <= limitX && c.y >= -limitY);
  let scale = 1;
  if (!fits(1)) {
    // Càng xa càng lọt khung (đơn điệu): tìm nhị phân hệ số nhỏ nhất vừa khung.
    let lo = 1;
    let hi = MAX_FIT_SCALE;
    for (let i = 0; i < 24; i += 1) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    scale = hi;
  }
  return orbit(settings, (base * scale) / settings.zoom, keyboardWidth);
}

/** Đọc cài đặt đã lưu (đã làm sạch); bộ nhớ bị chặn hoặc JSON hỏng thì trả mặc định. */
export function readViewSettings(): ViewSettings {
  try {
    const stored = localStorage.getItem(VIEW_STORAGE_KEY);
    return stored === null ? { ...DEFAULT_VIEW_SETTINGS } : sanitizeViewSettings(JSON.parse(stored));
  } catch {
    return { ...DEFAULT_VIEW_SETTINGS };
  }
}

export function writeViewSettings(settings: ViewSettings): void {
  try {
    localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(sanitizeViewSettings(settings)));
  } catch {
    // Không lưu được thì thôi: vẫn chỉnh được trong phiên, lần sau về mặc định.
  }
}

export function clearViewSettings(): void {
  try {
    localStorage.removeItem(VIEW_STORAGE_KEY);
  } catch {
    // Không xoá được thì thôi.
  }
}
