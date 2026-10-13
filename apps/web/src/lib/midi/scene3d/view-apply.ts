import type { MeshStandardMaterial, PerspectiveCamera } from 'three';
import { cameraPlacement, type ViewSettings } from './view-settings';

/** Vật liệu bị `ViewSettings` điều khiển màu. Không cần WebGL nên test được ở Node. */
export interface ViewMaterials {
  skin: MeshStandardMaterial;
  barWhite: MeshStandardMaterial;
  barBlack: MeshStandardMaterial;
  /** Phím đang bấm: theo màu nốt rơi phím trắng để thanh chạm phím cùng một màu. */
  activeKey: MeshStandardMaterial;
}

/** Đổi màu tại chỗ (cả `color` lẫn `emissive` của nốt rơi và phím đang bấm); không dựng lại vật liệu. */
export function applyViewColors(materials: ViewMaterials, view: ViewSettings): void {
  materials.skin.color.set(view.handColor);
  for (const [material, color] of [
    [materials.barWhite, view.noteWhiteColor],
    [materials.barBlack, view.noteBlackColor],
    [materials.activeKey, view.noteWhiteColor],
  ] as const) {
    material.color.set(color);
    material.emissive.set(color);
  }
}

/** Đặt camera theo cài đặt và tỉ lệ khung: vừa khít bề ngang bàn phím, nâng/xoay/gần theo `view`. */
export function applyViewCamera(camera: PerspectiveCamera, view: ViewSettings, aspect: number, keyboardWidth: number): void {
  camera.aspect = aspect;
  const { position, target } = cameraPlacement(view, aspect, keyboardWidth, camera.fov);
  camera.position.set(position.x, position.y, position.z);
  camera.lookAt(target.x, target.y, target.z);
  camera.updateProjectionMatrix();
}
