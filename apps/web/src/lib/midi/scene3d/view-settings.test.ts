// @vitest-environment node
import { PerspectiveCamera, Vector3 } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WHITE_LENGTH } from './keyboard-geometry';
import * as world from './world';
import {
  cameraPlacement,
  clearViewSettings,
  DEFAULT_VIEW_SETTINGS,
  isDefaultViewSettings,
  isHexColor,
  readViewSettings,
  sanitizeViewSettings,
  VIEW_LIMITS,
  VIEW_STORAGE_KEY,
  writeViewSettings,
} from './view-settings';

describe('keyboard-geometry', () => {
  it('world.ts xuất lại đúng hai hằng số (một nguồn sự thật)', () => {
    expect(world.WHITE_LENGTH).toBe(WHITE_LENGTH);
    expect(world.KEY_UNIT_MM).toBe(23.5);
  });
});

describe('sanitizeViewSettings', () => {
  it('không có gì hoặc dữ liệu lạ thì trả mặc định', () => {
    for (const raw of [undefined, null, 5, 'x', [], {}]) expect(sanitizeViewSettings(raw)).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it('kẹp số vào giới hạn; NaN, Infinity, chuỗi thì lấy mặc định', () => {
    const s = sanitizeViewSettings({ elevation: 500, azimuth: -500, zoom: 0.01 });
    expect(s.elevation).toBe(VIEW_LIMITS.elevation.max);
    expect(s.azimuth).toBe(VIEW_LIMITS.azimuth.min);
    expect(s.zoom).toBe(VIEW_LIMITS.zoom.min);
    const bad = sanitizeViewSettings({ elevation: Number.NaN, azimuth: Number.POSITIVE_INFINITY, zoom: '2' });
    expect(bad.elevation).toBe(DEFAULT_VIEW_SETTINGS.elevation);
    expect(bad.azimuth).toBe(DEFAULT_VIEW_SETTINGS.azimuth);
    expect(bad.zoom).toBe(DEFAULT_VIEW_SETTINGS.zoom);
  });

  it('giữ giá trị trong giới hạn nguyên vẹn', () => {
    expect(sanitizeViewSettings({ elevation: 33, azimuth: -12.5, zoom: 1.25 })).toMatchObject({ elevation: 33, azimuth: -12.5, zoom: 1.25 });
  });

  it('màu: nhận #rrggbb và chuyển về chữ thường; sai định dạng thì lấy mặc định', () => {
    const s = sanitizeViewSettings({ handColor: '#AABBCC', noteWhiteColor: 'red', noteBlackColor: '#12345' });
    expect(s.handColor).toBe('#aabbcc');
    expect(s.noteWhiteColor).toBe(DEFAULT_VIEW_SETTINGS.noteWhiteColor);
    expect(s.noteBlackColor).toBe(DEFAULT_VIEW_SETTINGS.noteBlackColor);
    expect(isHexColor('#aabbcc')).toBe(true);
    expect(isHexColor('#abc')).toBe(false);
    expect(isHexColor('javascript:1')).toBe(false);
    expect(isHexColor(123)).toBe(false);
  });

  it('isDefaultViewSettings nhận ra mặc định và bất kỳ thay đổi nào', () => {
    expect(isDefaultViewSettings({ ...DEFAULT_VIEW_SETTINGS })).toBe(true);
    expect(isDefaultViewSettings({ ...DEFAULT_VIEW_SETTINGS, zoom: 1.2 })).toBe(false);
    expect(isDefaultViewSettings({ ...DEFAULT_VIEW_SETTINGS, handColor: '#000000' })).toBe(false);
  });
});

/** Toạ độ chuẩn hoá của bốn góc bàn phím (độc lập với cài đặt công thức, dùng three để chiếu). */
function project(placement: ReturnType<typeof cameraPlacement>, aspect: number, width: number) {
  const camera = new PerspectiveCamera(45, aspect, 0.5, 400);
  camera.position.set(placement.position.x, placement.position.y, placement.position.z);
  camera.lookAt(placement.target.x, placement.target.y, placement.target.z);
  camera.updateMatrixWorld(true);
  camera.updateProjectionMatrix();
  return [[0, 0, 0], [width, 0, 0], [0, 0, -WHITE_LENGTH], [width, 0, -WHITE_LENGTH]].map(([x, y, z]) => new Vector3(x, y, z).project(camera));
}

describe('cameraPlacement', () => {
  // Vị trí cũ trong `fitCamera` trước khi có cài đặt: nghiêng 54°, nhìn thẳng, vừa khít bề ngang.
  const legacy = (aspect: number, width: number) => {
    const hfov = 2 * Math.atan(Math.tan((45 * Math.PI) / 360) * aspect);
    const dist = (width * 1.08) / 2 / Math.tan(hfov / 2);
    const e = (54 * Math.PI) / 180;
    return { x: width / 2, y: dist * Math.sin(e), z: -4.5 + dist * Math.cos(e) };
  };

  it('mặc định cho đúng vị trí camera cũ (mọi tỉ lệ khung và bề ngang)', () => {
    for (const [aspect, width] of [[2, 36], [1.2, 52], [3, 24]] as const) {
      const p = cameraPlacement(DEFAULT_VIEW_SETTINGS, aspect, width).position;
      const old = legacy(aspect, width);
      expect(p.x).toBeCloseTo(old.x, 9);
      expect(p.y).toBeCloseTo(old.y, 9);
      expect(p.z).toBeCloseTo(old.z, 9);
    }
  });

  it('điểm nhìn ở giữa bàn phím, trên mặt phím', () => {
    expect(cameraPlacement(DEFAULT_VIEW_SETTINGS, 2, 36).target).toEqual({ x: 18, y: 0, z: -4.5 });
  });

  it('góc nâng lớn hơn thì camera cao hơn và gần mặt phẳng người chơi hơn', () => {
    const low = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, elevation: 30 }, 2, 36).position;
    const high = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, elevation: 75 }, 2, 36).position;
    expect(high.y).toBeGreaterThan(low.y);
    expect(high.z).toBeLessThan(low.z);
  });

  it('zoom lớn hơn thì camera gần điểm nhìn hơn theo đúng tỉ lệ', () => {
    const a = cameraPlacement(DEFAULT_VIEW_SETTINGS, 2, 36);
    const b = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, zoom: 2 }, 2, 36);
    const d = (p: typeof a) => Math.hypot(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
    expect(d(b)).toBeCloseTo(d(a) / 2, 9);
  });

  it('xoay: dương dời camera sang +x, âm sang −x, đối xứng; camera không bao giờ gần hơn khoảng vừa bề ngang', () => {
    const base = cameraPlacement(DEFAULT_VIEW_SETTINGS, 2, 36);
    const right = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, azimuth: 25 }, 2, 36);
    const left = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, azimuth: -25 }, 2, 36);
    expect(right.position.x).toBeGreaterThan(base.position.x);
    expect(left.position.x).toBeLessThan(base.position.x);
    expect(right.position.x - base.position.x).toBeCloseTo(base.position.x - left.position.x, 9);
    const d = (p: typeof base) => Math.hypot(p.position.x - p.target.x, p.position.y - p.target.y, p.position.z - p.target.z);
    expect(d(right)).toBeGreaterThanOrEqual(d(base) - 1e-9);
  });

  it('mọi góc nâng và xoay hợp lệ ở độ gần 1: bốn góc bàn phím trong khung (cắt tối đa 5%, hoặc không tệ hơn mặc định ở tỉ lệ đó)', () => {
    for (const aspect of [2, 1.5, 2.4]) {
      const ref = project(cameraPlacement(DEFAULT_VIEW_SETTINGS, aspect, 36), aspect, 36);
      const limitX = Math.max(1.05, ...ref.map((c) => Math.abs(c.x)));
      const limitY = Math.max(1.05, ...ref.map((c) => -c.y));
      for (const elevation of [VIEW_LIMITS.elevation.min, 30, 54, 70, VIEW_LIMITS.elevation.max]) {
        for (const azimuth of [VIEW_LIMITS.azimuth.min, -20, 0, 20, VIEW_LIMITS.azimuth.max]) {
          const placement = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, elevation, azimuth, zoom: 1 }, aspect, 36);
          for (const c of project(placement, aspect, 36)) {
            const where = `aspect ${aspect} nâng ${elevation} xoay ${azimuth}`;
            expect(Math.abs(c.x), `${where}: ngang`).toBeLessThanOrEqual(limitX + 1e-6);
            expect(c.y, `${where}: mép dưới`).toBeGreaterThanOrEqual(-limitY - 1e-6);
          }
        }
      }
    }
  });

  it('zoom lớn hơn 1 phóng to có chủ ý (được cắt), nhỏ hơn 1 thì bàn phím vẫn trọn khung', () => {
    const tight = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, zoom: 1.6 }, 2, 36);
    expect(Math.max(...project(tight, 2, 36).map((c) => Math.abs(c.x)))).toBeGreaterThan(1.2);
    const loose = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, zoom: 0.6 }, 2, 36);
    expect(Math.max(...project(loose, 2, 36).map((c) => Math.abs(c.x)))).toBeLessThan(1);
  });

  it('mọi giá trị trong giới hạn cho vị trí hữu hạn', () => {
    for (const elevation of [VIEW_LIMITS.elevation.min, VIEW_LIMITS.elevation.max]) {
      for (const azimuth of [VIEW_LIMITS.azimuth.min, VIEW_LIMITS.azimuth.max]) {
        for (const zoom of [VIEW_LIMITS.zoom.min, VIEW_LIMITS.zoom.max]) {
          const { position } = cameraPlacement({ ...DEFAULT_VIEW_SETTINGS, elevation, azimuth, zoom }, 2, 36);
          expect([position.x, position.y, position.z].every(Number.isFinite)).toBe(true);
        }
      }
    }
  });
});

describe('lưu trữ', () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('chưa lưu gì thì đọc ra mặc định (bản sao, không phải chính hằng số)', () => {
    const s = readViewSettings();
    expect(s).toEqual(DEFAULT_VIEW_SETTINGS);
    expect(s).not.toBe(DEFAULT_VIEW_SETTINGS);
  });

  it('ghi rồi đọc lại đúng; ghi đã làm sạch', () => {
    writeViewSettings({ ...DEFAULT_VIEW_SETTINGS, elevation: 40, handColor: '#112233' });
    expect(readViewSettings()).toMatchObject({ elevation: 40, handColor: '#112233' });
    writeViewSettings({ ...DEFAULT_VIEW_SETTINGS, zoom: 99 });
    expect(JSON.parse(store.get(VIEW_STORAGE_KEY)!).zoom).toBe(VIEW_LIMITS.zoom.max);
  });

  it('JSON hỏng hoặc kiểu lạ thì lấy mặc định, không ném', () => {
    store.set(VIEW_STORAGE_KEY, '{not json');
    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
    store.set(VIEW_STORAGE_KEY, '"hello"');
    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });

  it('xoá bỏ mục đã lưu', () => {
    writeViewSettings({ ...DEFAULT_VIEW_SETTINGS, azimuth: 10 });
    clearViewSettings();
    expect(store.has(VIEW_STORAGE_KEY)).toBe(false);
  });

  it('bộ nhớ bị chặn (mọi thao tác ném) thì không ném và đọc ra mặc định', () => {
    const boom = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: boom, setItem: boom, removeItem: boom });
    expect(() => writeViewSettings(DEFAULT_VIEW_SETTINGS)).not.toThrow();
    expect(() => clearViewSettings()).not.toThrow();
    expect(readViewSettings()).toEqual(DEFAULT_VIEW_SETTINGS);
  });
});
