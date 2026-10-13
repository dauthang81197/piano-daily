import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  LatheGeometry,
  Vector2,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HandsPose } from '@/lib/midi/hands/hand-path';
import { MAX_FALLING, type FallingNote, type KeyboardLayout } from '@/lib/midi/keyboard-layout';
import { HandAnimator, type HandId } from '@/lib/midi/scene3d/hand-animator';
import { applyHandFrame, HandFrameDriver } from '@/lib/midi/scene3d/hand-driver';
import { HandMetrics, type HandStats } from '@/lib/midi/scene3d/hand-metrics';
import { FOREARM_ASPECT, forearmProfile, sleeveProfile, WRIST_CENTER, type ProfilePoint } from '@/lib/midi/scene3d/forearm';
import { applyViewCamera, applyViewColors, skinSheenColor } from '@/lib/midi/scene3d/view-apply';
import { sanitizeViewSettings, type ViewSettings } from '@/lib/midi/scene3d/view-settings';
import {
  HandSolver,
  modelToHandMatrix,
  REQUIRED_BONES,
  reparentSkeleton,
} from '@/lib/midi/scene3d/hand-rig';
import {
  BLACK_LENGTH,
  BLACK_RISE,
  fallZ,
  FALL_LENGTH,
  keyTopY,
  PRESS_DEPTH,
  WHITE_DEPTH,
  WHITE_LENGTH,
} from '@/lib/midi/scene3d/world';

/** Tỉ lệ khung hình (rộng : cao) của cảnh. */
export const VIEW_ASPECT = 2;

const STAGE = 0x26211d;
/** Màu tay áo (vải tối, trung tính: không trùng nền sân khấu và không theo màu bàn tay). */
const SLEEVE_COLOR = 0x4a443e;
const GAP = 0.06;

export interface SceneFrame {
  /** Số nốt MIDI đang phát. */
  active: ReadonlySet<number>;
  falling: readonly FallingNote[];
  /** Tư thế hai tay (đã lấy sớm `HAND_LEAD` so với `time` để bù độ trễ của bộ lọc). */
  pose: HandsPose;
  /** Thời gian phát (giây) của khung này: dùng nhận biết tua/đổi bài để đặt thẳng tư thế tay. */
  time: number;
  /** Không đang phát: vẽ lại đúng tư thế (đặt thẳng) thay vì tiến một bước của bộ lọc rồi dừng giữa chừng. */
  still: boolean;
  showHands: boolean;
}

export interface PianoScene {
  render(frame: SceneFrame): void;
  /** Đặt kích thước vẽ theo pixel CSS của canvas. */
  resize(width: number, height: number): void;
  dispose(): void;
  /** Số liệu chuyển động của tay (chỉ khi tạo với `debug`); `null` nếu không bật hoặc chưa có khung. */
  stats(): HandStats | null;
  /** Đổi góc nhìn và màu tại chỗ (không dựng lại cảnh); cần vẽ lại một khung để thấy. */
  setView(settings: ViewSettings): void;
}

export interface PianoSceneOptions {
  /** Thu số liệu fps, thời gian xử lý, bước khớp (lớp phủ `?handsDebug=1`). Mặc định tắt. */
  debug?: boolean;
  /** Đồng hồ thực (giây); tiêm được để test. */
  now?: () => number;
  /** Góc nhìn và màu ban đầu (mặc định theo `DEFAULT_VIEW_SETTINGS`). */
  view?: ViewSettings;
}

interface KeyView {
  mesh: Mesh;
  baseY: number;
  black: boolean;
}

interface HandView {
  group: Group;
  mirror: Group;
  model: Object3D;
  bones: Map<string, Object3D>;
}

function collectBones(root: Object3D): Map<string, Object3D> {
  const bones = new Map<string, Object3D>();
  root.traverse((o) => {
    if ((o as { isBone?: boolean }).isBone) bones.set(o.name, o);
  });
  return bones;
}

/**
 * Tạo cảnh 3D nhìn nghiêng từ phía người chơi: phím đàn, nốt rơi trên mặt đàn phía xa và hai bàn tay từ model GLB.
 * Ném lỗi nếu không tạo được WebGL hoặc model thiếu/hỏng (người gọi quay về phím SVG).
 */
export async function createPianoScene(
  canvas: HTMLCanvasElement,
  layout: KeyboardLayout,
  modelUrl: string,
  options: PianoSceneOptions = {},
): Promise<PianoScene> {
  // Làm sạch cả cài đặt ban đầu: thiếu/undefined/ngoài giới hạn không bao giờ làm camera hay màu thành NaN.
  let view: ViewSettings = sanitizeViewSettings(options.view);
  const gltf = await new GLTFLoader().loadAsync(modelUrl);
  const missing = REQUIRED_BONES.filter((name) => !collectBones(gltf.scene).has(name));
  if (missing.length > 0) throw new Error(`Model bàn tay thiếu xương: ${missing.join(', ')}`);

  const renderer = new WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T): T => {
    disposables.push(x);
    return x;
  };

  const width = layout.whiteKeys;
  const scene = new Scene();
  scene.background = new Color(STAGE);

  scene.add(new AmbientLight(0xffffff, 0.9));
  scene.add(new HemisphereLight(0xfff1de, 0x2a221c, 1.3));
  const sun = new DirectionalLight(0xffffff, 2.4);
  sun.position.set(width * 0.3, 30, 20);
  scene.add(sun);

  // Phím.
  const whiteGeo = own(new BoxGeometry(1 - GAP, WHITE_DEPTH, WHITE_LENGTH));
  const blackLen = BLACK_LENGTH;
  const blackGeo = own(new BoxGeometry(0.55, BLACK_RISE + 0.45, blackLen));
  const whiteMat = own(new MeshStandardMaterial({ color: 0xfaf7f0, roughness: 0.5 }));
  const blackMat = own(new MeshStandardMaterial({ color: 0x1b1816, roughness: 0.4 }));
  const activeMat = own(new MeshStandardMaterial({ color: view.noteWhiteColor, roughness: 0.4, emissive: view.noteWhiteColor, emissiveIntensity: 0.35 }));
  const keys = new Map<number, KeyView>();
  const keyGroup = new Group();
  for (const key of layout.keys) {
    const mesh = new Mesh(key.black ? blackGeo : whiteGeo, key.black ? blackMat : whiteMat);
    const y = key.black ? BLACK_RISE - (BLACK_RISE + 0.45) / 2 : -WHITE_DEPTH / 2;
    const z = key.black ? -WHITE_LENGTH + blackLen / 2 : -WHITE_LENGTH / 2;
    mesh.position.set(key.x + key.width / 2, y, z);
    keyGroup.add(mesh);
    keys.set(key.midi, { mesh, baseY: mesh.position.y, black: key.black });
  }
  scene.add(keyGroup);

  // Thân đàn dưới phím và mặt nốt rơi phía xa.
  const bodyGeo = own(new BoxGeometry(width + 2, 1.2, WHITE_LENGTH + 1));
  const body = new Mesh(bodyGeo, own(new MeshStandardMaterial({ color: 0x14110f, roughness: 0.8 })));
  body.position.set(width / 2, -WHITE_DEPTH - 0.6, -WHITE_LENGTH / 2 - 0.3);
  scene.add(body);

  const runwayGeo = own(new BoxGeometry(width, 0.2, FALL_LENGTH));
  const runway = new Mesh(runwayGeo, own(new MeshStandardMaterial({ color: 0x1d1916, roughness: 0.9 })));
  runway.position.set(width / 2, -0.1, -WHITE_LENGTH - FALL_LENGTH / 2);
  scene.add(runway);

  // Vạch phân cột trên mặt nốt rơi (ranh giới phím trắng).
  const linePoints: number[] = [];
  for (const key of layout.keys) {
    if (key.black) continue;
    linePoints.push(key.x, 0.01, -WHITE_LENGTH, key.x, 0.01, -WHITE_LENGTH - FALL_LENGTH);
  }
  linePoints.push(width, 0.01, -WHITE_LENGTH, width, 0.01, -WHITE_LENGTH - FALL_LENGTH);
  const lineGeo = own(new BufferGeometry());
  lineGeo.setAttribute('position', new Float32BufferAttribute(linePoints, 3));
  scene.add(new LineSegments(lineGeo, own(new LineBasicMaterial({ color: 0x3a332d }))));

  // Nốt rơi: dùng lại một bể thanh hộp.
  const barGeo = own(new BoxGeometry(1, 1, 1));
  const barWhite = own(new MeshStandardMaterial({ color: view.noteWhiteColor, roughness: 0.5, emissive: view.noteWhiteColor, emissiveIntensity: 0.25 }));
  const barBlack = own(new MeshStandardMaterial({ color: view.noteBlackColor, roughness: 0.5, emissive: view.noteBlackColor, emissiveIntensity: 0.25 }));
  const bars: Mesh[] = [];
  for (let i = 0; i < MAX_FALLING; i += 1) {
    const bar = new Mesh(barGeo, barWhite);
    bar.visible = false;
    scene.add(bar);
    bars.push(bar);
  }

  // Bàn tay.
  const skin = own(
    new MeshPhysicalMaterial({
      color: view.handColor,
      roughness: 0.55,
      sheen: 0.6,
      sheenRoughness: 0.5,
      sheenColor: skinSheenColor(view.handColor),
      emissive: view.handColor,
      emissiveIntensity: 0.06,
    }),
  );
  /** Tay áo vải trung tính, không theo màu bàn tay. */
  const sleeve = own(new MeshStandardMaterial({ color: SLEEVE_COLOR, roughness: 0.9 }));
  /** Mặt tròn xoay elip dọc theo trục z (cổ tay ở gốc, đi về phía người chơi). */
  const limb = (profile: readonly ProfilePoint[]) => {
    const geometry = new LatheGeometry(profile.map((p) => new Vector2(p.radius, p.z)), 32);
    geometry.scale(1, 1, FOREARM_ASPECT);
    geometry.rotateX(Math.PI / 2);
    geometry.translate(WRIST_CENTER.x, WRIST_CENTER.y, 0);
    return own(geometry);
  };
  const forearmGeo = limb(forearmProfile());
  const sleeveGeo = limb(sleeveProfile());
  const solver = new HandSolver(
    (() => {
      const probe = cloneSkinned(gltf.scene);
      const bones = collectBones(probe);
      reparentSkeleton(bones);
      return bones;
    })(),
  );
  const modelMatrix = modelToHandMatrix(solver.wristPosition());
  const hands: Record<'left' | 'right', HandView> = {
    left: buildHand(true),
    right: buildHand(false),
  };
  function buildHand(mirrored: boolean): HandView {
    const model = cloneSkinned(gltf.scene);
    const bones = collectBones(model);
    reparentSkeleton(bones);
    model.traverse((o) => {
      const mesh = o as SkinnedMesh;
      if (mesh.isSkinnedMesh) {
        mesh.material = skin;
        mesh.frustumCulled = false;
      }
    });
    model.matrixAutoUpdate = false;
    model.matrix.copy(modelMatrix);
    const mirror = new Group();
    mirror.scale.x = mirrored ? -1 : 1;
    mirror.add(model);
    const group = new Group();
    // Cẳng tay thon (mặt cắt elip khớp cổ tay model) và tay áo nằm trong `mirror` để tay trái lệch tâm đối xứng với cổ tay.
    mirror.add(new Mesh(forearmGeo, skin), new Mesh(sleeveGeo, sleeve));
    group.add(mirror);
    group.visible = false;
    scene.add(group);
    return { group, mirror, model, bones };
  }

  const camera = new PerspectiveCamera(45, VIEW_ASPECT, 0.5, 400);
  let aspect = VIEW_ASPECT;
  /** Đặt camera theo cài đặt hiện tại: vừa khít bề ngang bàn phím, nâng/xoay/gần theo `view` (xem `cameraPlacement`). */
  function fitCamera(nextAspect: number) {
    aspect = nextAspect;
    applyViewCamera(camera, view, aspect, width);
  }
  fitCamera(VIEW_ASPECT);

  const driver = new HandFrameDriver(new HandAnimator(solver, modelMatrix), options.now ?? (() => performance.now() / 1000));
  const metrics = options.debug ? new HandMetrics() : null;
  const clock = options.now ?? (() => performance.now() / 1000);

  return {
    render(frame) {
      for (const [midi, view] of keys) {
        const on = frame.active.has(midi);
        view.mesh.material = on ? activeMat : view.black ? blackMat : whiteMat;
        view.mesh.position.y = view.baseY - (on ? PRESS_DEPTH : 0);
      }
      bars.forEach((bar, i) => {
        const note = frame.falling[i];
        const key = note ? layout.byMidi.get(note.note.midi) : undefined;
        if (!note || !key) {
          bar.visible = false;
          return;
        }
        const near = fallZ(note.bottom);
        const far = fallZ(note.top);
        const length = Math.max(0.08, near - far);
        const inset = key.black ? 0.08 : 0.12;
        bar.visible = true;
        bar.material = key.black ? barBlack : barWhite;
        bar.scale.set(key.width - inset * 2, 0.35, length);
        bar.position.set(key.x + key.width / 2, 0.18 + keyTopY(key) * 0.4, (near + far) / 2);
      });
      const started = clock();
      const step = driver.step(frame);
      for (const id of ['left', 'right'] as HandId[]) applyHandFrame(hands[id].group, hands[id].bones, step.frames[id]);
      renderer.render(scene, camera);
      // Khung đặt thẳng (khung đầu, tua, đứng yên) có dt không phản ánh nhịp vẽ nên không đưa vào số liệu.
      if (!step.snap && step.realDt > 0) metrics?.record(step.realDt, (clock() - started) * 1000, step.jointStep);
    },
    stats: () => metrics?.snapshot() ?? null,
    setView(settings) {
      view = sanitizeViewSettings(settings);
      applyViewColors({ skin, barWhite, barBlack, activeKey: activeMat }, view);
      fitCamera(aspect);
    },
    resize(w, h) {
      const cw = Math.max(1, w);
      const ch = Math.max(1, h);
      renderer.setSize(cw, ch, false);
      fitCamera(cw / ch);
    },
    dispose() {
      for (const d of disposables) d.dispose();
      renderer.dispose();
    },
  };
}
