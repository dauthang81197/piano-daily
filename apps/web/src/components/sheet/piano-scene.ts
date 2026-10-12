import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  LineBasicMaterial,
  LineSegments,
  BufferGeometry,
  Float32BufferAttribute,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
  type SkinnedMesh,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { HandPose, HandsPose } from '@/lib/midi/hands/hand-path';
import { MAX_FALLING, type FallingNote, type KeyboardLayout } from '@/lib/midi/keyboard-layout';
import {
  applySolution,
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
  fingerTarget,
  keyTopY,
  PRESS_DEPTH,
  WHITE_DEPTH,
  WHITE_LENGTH,
  WRIST_Y,
  WRIST_Z,
} from '@/lib/midi/scene3d/world';

/** Tỉ lệ khung hình (rộng : cao) của cảnh. */
export const VIEW_ASPECT = 2;

const BRASS = 0xb8893a;
const BRASS_DARK = 0x8c6a2c;
const SKIN = 0xdcae8c;
const STAGE = 0x26211d;
const GAP = 0.06;

export interface SceneFrame {
  /** Số nốt MIDI đang phát. */
  active: ReadonlySet<number>;
  falling: readonly FallingNote[];
  pose: HandsPose;
  showHands: boolean;
}

export interface PianoScene {
  render(frame: SceneFrame): void;
  /** Đặt kích thước vẽ theo pixel CSS của canvas. */
  resize(width: number, height: number): void;
  dispose(): void;
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
export async function createPianoScene(canvas: HTMLCanvasElement, layout: KeyboardLayout, modelUrl: string): Promise<PianoScene> {
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
  const activeMat = own(new MeshStandardMaterial({ color: BRASS, roughness: 0.4, emissive: BRASS, emissiveIntensity: 0.35 }));
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
  const barWhite = own(new MeshStandardMaterial({ color: BRASS, roughness: 0.5, emissive: BRASS, emissiveIntensity: 0.25 }));
  const barBlack = own(new MeshStandardMaterial({ color: BRASS_DARK, roughness: 0.5, emissive: BRASS_DARK, emissiveIntensity: 0.25 }));
  const bars: Mesh[] = [];
  for (let i = 0; i < MAX_FALLING; i += 1) {
    const bar = new Mesh(barGeo, barWhite);
    bar.visible = false;
    scene.add(bar);
    bars.push(bar);
  }

  // Bàn tay.
  const skin = own(new MeshStandardMaterial({ color: SKIN, roughness: 0.55 }));
  const forearmGeo = own(new CylinderGeometry(1.5, 1.05, 9.5, 20));
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
    group.add(mirror);
    // Cẳng tay đơn giản nối từ cổ tay về phía người chơi, để không lộ mặt cắt cổ tay của model.
    const forearm = new Mesh(forearmGeo, skin);
    forearm.rotation.x = Math.PI / 2;
    forearm.position.set(0, 0.5, 4.9);
    group.add(forearm);
    group.visible = false;
    scene.add(group);
    return { group, mirror, model, bones };
  }

  const camera = new PerspectiveCamera(45, VIEW_ASPECT, 0.5, 400);
  function fitCamera(aspect: number) {
    camera.aspect = aspect;
    // Vừa khít bề ngang bàn phím (cộng lề), nhìn xuống chừng 48° vào giữa phím và mặt nốt rơi.
    const hfov = 2 * Math.atan(Math.tan((camera.fov * Math.PI) / 360) * aspect);
    const dist = (width * 1.08) / 2 / Math.tan(hfov / 2);
    const elevation = (54 * Math.PI) / 180;
    const target = new Vector3(width / 2, 0, -4.5);
    camera.position.set(target.x, target.y + dist * Math.sin(elevation), target.z + dist * Math.cos(elevation));
    camera.lookAt(target);
    camera.updateProjectionMatrix();
  }
  fitCamera(VIEW_ASPECT);

  const scratch = new Vector3();
  function poseHand(view: HandView, pose: HandPose | null, visible: boolean) {
    view.group.visible = visible && pose !== null;
    if (!pose || !visible) return;
    view.group.position.set(pose.x, WRIST_Y, WRIST_Z);
    view.group.updateMatrixWorld(true);
    const inverse = view.model.matrixWorld.clone().invert();
    for (const finger of pose.fingers) {
      const t = fingerTarget(finger);
      scratch.set(t.x, t.y, t.z).applyMatrix4(inverse);
      applySolution(view.bones, solver.solve(finger.finger, scratch));
    }
  }

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
      poseHand(hands.left, frame.pose.left, frame.showHands);
      poseHand(hands.right, frame.pose.right, frame.showHands);
      renderer.render(scene, camera);
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
