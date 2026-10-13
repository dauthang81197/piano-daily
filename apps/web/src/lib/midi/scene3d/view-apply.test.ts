// @vitest-environment node
import { Color, MeshPhysicalMaterial, MeshStandardMaterial, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { applyViewCamera, applyViewColors, skinSheenColor, type ViewMaterials } from './view-apply';
import { cameraPlacement, DEFAULT_VIEW_SETTINGS } from './view-settings';

const materials = (): ViewMaterials => ({
  skin: new MeshPhysicalMaterial(),
  barWhite: new MeshStandardMaterial(),
  barBlack: new MeshStandardMaterial(),
  activeKey: new MeshStandardMaterial(),
});
const hex = (c: Color) => `#${c.getHexString()}`;

describe('da', () => {
  it('emissive và sheen đổi theo màu bàn tay; viền sheen sáng hơn màu da', () => {
    const m = materials();
    applyViewColors(m, { ...DEFAULT_VIEW_SETTINGS, handColor: '#8a5a3c' });
    expect(`#${m.skin.emissive.getHexString()}`).toBe('#8a5a3c');
    const sheen = m.skin.sheenColor;
    const base = new Color('#8a5a3c');
    expect(sheen.r).toBeGreaterThan(base.r);
    expect(sheen.g).toBeGreaterThan(base.g);
    expect(sheen.b).toBeGreaterThan(base.b);
    expect(skinSheenColor('#000000').getHexString()).not.toBe('000000');
    expect(skinSheenColor('#ffffff').getHexString()).toBe('ffffff');
  });
});

describe('applyViewColors', () => {
  it('đặt màu bàn tay, nốt rơi phím trắng/đen và cả emissive của nốt rơi', () => {
    const m = materials();
    applyViewColors(m, { ...DEFAULT_VIEW_SETTINGS, handColor: '#112233', noteWhiteColor: '#3366ff', noteBlackColor: '#ff0066' });
    expect(hex(m.skin.color)).toBe('#112233');
    expect(hex(m.barWhite.color)).toBe('#3366ff');
    expect(hex(m.barWhite.emissive)).toBe('#3366ff');
    expect(hex(m.barBlack.color)).toBe('#ff0066');
    expect(hex(m.barBlack.emissive)).toBe('#ff0066');
  });

  it('phím đang bấm theo màu nốt rơi phím trắng', () => {
    const m = materials();
    applyViewColors(m, { ...DEFAULT_VIEW_SETTINGS, noteWhiteColor: '#00aa88' });
    expect(hex(m.activeKey.color)).toBe('#00aa88');
    expect(hex(m.activeKey.emissive)).toBe('#00aa88');
  });

  it('đổi lại nhiều lần giữ đúng giá trị cuối và không đụng màu bàn tay khi chỉ đổi nốt', () => {
    const m = materials();
    applyViewColors(m, { ...DEFAULT_VIEW_SETTINGS, handColor: '#123456' });
    applyViewColors(m, { ...DEFAULT_VIEW_SETTINGS, handColor: '#123456', noteBlackColor: '#abcdef' });
    expect(hex(m.skin.color)).toBe('#123456');
    expect(hex(m.barBlack.color)).toBe('#abcdef');
  });

  it('mặc định trả đúng ba màu cũ của giao diện', () => {
    const m = materials();
    applyViewColors(m, DEFAULT_VIEW_SETTINGS);
    expect(hex(m.skin.color)).toBe('#dcae8c');
    expect(hex(m.barWhite.color)).toBe('#b8893a');
    expect(hex(m.barBlack.color)).toBe('#8c6a2c');
  });
});

describe('applyViewCamera', () => {
  it('đặt vị trí theo cameraPlacement, nhìn về điểm nhìn, cập nhật tỉ lệ khung', () => {
    const camera = new PerspectiveCamera(45, 2, 0.5, 400);
    const view = { ...DEFAULT_VIEW_SETTINGS, elevation: 40, azimuth: 20, zoom: 1.3 };
    applyViewCamera(camera, view, 1.6, 36);
    const { position } = cameraPlacement(view, 1.6, 36, 45);
    expect(camera.aspect).toBe(1.6);
    expect(camera.position.toArray()).toEqual([position.x, position.y, position.z]);
    // Camera nhìn về −z cục bộ: hướng nhìn trỏ tới điểm nhìn (18, 0, −4,5).
    camera.updateMatrixWorld(true);
    const dir = camera.getWorldDirection(camera.position.clone());
    const toTarget = new Vector3(18, 0, -4.5).sub(camera.position).normalize();
    expect(dir.angleTo(toTarget)).toBeLessThan(1e-6);
  });

  it('mặc định giữ vị trí cũ: khớp công thức trước khi có cài đặt', () => {
    const camera = new PerspectiveCamera(45, 2, 0.5, 400);
    applyViewCamera(camera, DEFAULT_VIEW_SETTINGS, 2, 36);
    const hfov = 2 * Math.atan(Math.tan((45 * Math.PI) / 360) * 2);
    const dist = (36 * 1.08) / 2 / Math.tan(hfov / 2);
    expect(camera.position.y).toBeCloseTo(dist * Math.sin((54 * Math.PI) / 180), 9);
    expect(camera.position.z).toBeCloseTo(-4.5 + dist * Math.cos((54 * Math.PI) / 180), 9);
    expect(camera.position.x).toBeCloseTo(18, 9);
  });

  it('đổi tỉ lệ khung (resize) giữ nguyên góc nhìn đã chỉnh', () => {
    const camera = new PerspectiveCamera(45, 2, 0.5, 400);
    const view = { ...DEFAULT_VIEW_SETTINGS, elevation: 35 };
    applyViewCamera(camera, view, 2, 36);
    const wide = camera.position.clone();
    applyViewCamera(camera, view, 1, 36);
    const narrow = camera.position.clone();
    // Khung hẹp hơn thì camera lùi xa hơn để vẫn vừa bề ngang, nhưng cùng góc nâng.
    const elevation = (p: typeof wide) => Math.atan2(p.y, Math.hypot(p.x - 18, p.z + 4.5));
    expect(elevation(narrow)).toBeCloseTo(elevation(wide), 9);
    expect(narrow.length()).toBeGreaterThan(wide.length());
  });
});
