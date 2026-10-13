// @vitest-environment node
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { Mesh, MeshStandardMaterial, Object3D, PerspectiveCamera, Scene, SkinnedMesh } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildHandPath } from '@/lib/midi/hands/hand-path';
import { layoutKeyboard } from '@/lib/midi/keyboard-layout';
import type { PlayerNote } from '@/lib/midi/note-json';
import { cameraPlacement, DEFAULT_VIEW_SETTINGS, type ViewSettings } from '@/lib/midi/scene3d/view-settings';

/** `WebGLRenderer` giả (không cần WebGL) ghi lại cảnh và camera của lần vẽ cuối. */
const drawn: { scene: Scene; camera: PerspectiveCamera }[] = [];
vi.mock('three', async (importOriginal) => ({
  ...(await importOriginal<typeof import('three')>()),
  WebGLRenderer: class {
    setPixelRatio() {}
    setSize() {}
    render(scene: Scene, camera: PerspectiveCamera) {
      drawn.push({ scene, camera });
    }
    dispose() {}
  },
}));
/** Nạp model bàn tay thật từ đĩa thay vì qua mạng. */
vi.mock('three/examples/jsm/loaders/GLTFLoader.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('three/examples/jsm/loaders/GLTFLoader.js')>();
  return {
    GLTFLoader: class {
      async loadAsync() {
        const buffer = readFileSync(path.resolve(process.cwd(), 'public/models/hand-right.glb'));
        return new actual.GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength), '');
      }
    },
  };
});

import { createPianoScene } from './piano-scene';

const note = (midi: number, time = 0, duration = 1): PlayerNote => ({ midi, name: 'x', time, duration, velocity: 0.8 });
const notes = [note(60), note(61), note(64)];
const layout = layoutKeyboard(notes);
const pose = buildHandPath(notes, layout).poseAt(0.3);
const falling = [
  { note: notes[0]!, bottom: 0.5, top: 0.8 },
  { note: notes[1]!, bottom: 0.5, top: 0.8 },
];
const frame = { active: new Set([64]), falling, pose, time: 0.3, still: true, showHands: true };

const CUSTOM: ViewSettings = {
  elevation: 38,
  azimuth: 15,
  zoom: 1.2,
  handColor: '#112233',
  noteWhiteColor: '#3366ff',
  noteBlackColor: '#ff0066',
};
const hex = (m: MeshStandardMaterial) => `#${m.color.getHexString()}`;
const meshes = (scene: Object3D) => {
  const found: Mesh[] = [];
  scene.traverse((o) => {
    if ((o as Mesh).isMesh) found.push(o as Mesh);
  });
  return found;
};
const material = (m: Mesh) => m.material as MeshStandardMaterial;

async function setup(view?: ViewSettings) {
  const scene = await createPianoScene({} as HTMLCanvasElement, layout, '/models/hand-right.glb', view ? { view } : {});
  scene.resize(800, 400);
  scene.render(frame);
  return { scene, last: () => drawn.at(-1)! };
}

/** Màu của từng nhóm vật liệu trong cảnh vừa vẽ. */
function palette(root: Object3D) {
  const all = meshes(root);
  const skin = all.filter((m) => (m as SkinnedMesh).isSkinnedMesh).map((m) => hex(material(m)));
  const bars = all.filter((m) => m.visible && material(m).emissiveIntensity === 0.25).map((m) => hex(material(m)));
  const pressed = all.filter((m) => m.visible && material(m).emissiveIntensity === 0.35).map((m) => hex(material(m)));
  return { skin: [...new Set(skin)], bars: [...new Set(bars)].sort(), pressed: [...new Set(pressed)] };
}

beforeEach(() => {
  drawn.length = 0;
  vi.stubGlobal('window', { devicePixelRatio: 1 });
});
afterEach(() => vi.unstubAllGlobals());

describe('createPianoScene: góc nhìn và màu', () => {
  it('không truyền view: màu và camera mặc định như giao diện cũ', async () => {
    const { last } = await setup();
    expect(palette(last().scene)).toEqual({ skin: ['#dcae8c'], bars: ['#8c6a2c', '#b8893a'], pressed: ['#b8893a'] });
    const { position } = cameraPlacement(DEFAULT_VIEW_SETTINGS, 2, layout.whiteKeys, 45);
    expect(last().camera.position.toArray()).toEqual([position.x, position.y, position.z]);
  });

  it('view ban đầu áp ngay từ lần vẽ đầu: màu bàn tay, hai màu nốt rơi, phím đang bấm theo màu phím trắng, camera', async () => {
    const { last } = await setup(CUSTOM);
    expect(palette(last().scene)).toEqual({ skin: ['#112233'], bars: ['#3366ff', '#ff0066'], pressed: ['#3366ff'] });
    const { position } = cameraPlacement(CUSTOM, 2, layout.whiteKeys, 45);
    expect(last().camera.position.toArray()).toEqual([position.x, position.y, position.z]);
  });

  it('setView đổi đúng từng vật liệu (không đảo tay/nốt) và camera tại chỗ, không dựng lại cảnh', async () => {
    const { scene, last } = await setup();
    const sceneBefore = last().scene;
    scene.setView(CUSTOM);
    scene.render(frame);
    expect(last().scene).toBe(sceneBefore);
    expect(palette(last().scene)).toEqual({ skin: ['#112233'], bars: ['#3366ff', '#ff0066'], pressed: ['#3366ff'] });
    const { position } = cameraPlacement(CUSTOM, 2, layout.whiteKeys, 45);
    expect(last().camera.position.toArray()).toEqual([position.x, position.y, position.z]);
    // Đổi riêng một màu không đụng các màu khác.
    scene.setView({ ...CUSTOM, noteBlackColor: '#00cc88' });
    scene.render(frame);
    expect(palette(last().scene)).toEqual({ skin: ['#112233'], bars: ['#00cc88', '#3366ff'], pressed: ['#3366ff'] });
  });

  it('phần phát sáng (emissive) của nốt rơi đổi theo màu mới', async () => {
    const { scene, last } = await setup();
    scene.setView(CUSTOM);
    scene.render(frame);
    const bar = meshes(last().scene).find((m) => m.visible && material(m).emissiveIntensity === 0.25)!;
    expect(`#${material(bar).emissive.getHexString()}`).toBe(hex(material(bar)));
  });

  it('resize sau setView giữ nguyên góc nâng và xoay đã chỉnh, camera tỉ lệ khung mới', async () => {
    const { scene, last } = await setup();
    scene.setView(CUSTOM);
    scene.resize(600, 600);
    scene.render(frame);
    const p = last().camera.position;
    const cx = layout.whiteKeys / 2;
    const elevation = (Math.atan2(p.y, Math.hypot(p.x - cx, p.z + 4.5)) * 180) / Math.PI;
    const azimuth = (Math.atan2(p.x - cx, p.z + 4.5) * 180) / Math.PI;
    expect(elevation).toBeCloseTo(CUSTOM.elevation, 6);
    expect(azimuth).toBeCloseTo(CUSTOM.azimuth, 6);
    expect(last().camera.aspect).toBe(1);
  });

  it('cài đặt thiếu trường, undefined hoặc ngoài giới hạn được làm sạch: camera và màu luôn hữu hạn', async () => {
    const { scene, last } = await setup({ zoom: undefined, handColor: 'xyz', elevation: 9999 } as unknown as ViewSettings);
    expect(last().camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(palette(last().scene).skin).toEqual(['#dcae8c']);
    scene.setView({ azimuth: Number.NaN, noteWhiteColor: undefined } as unknown as ViewSettings);
    scene.render(frame);
    expect(last().camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(palette(last().scene).bars).toContain('#b8893a');
  });
});
