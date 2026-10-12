import {
  AmbientLight,
  BoxGeometry,
  CylinderGeometry,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  Scene,
  SphereGeometry,
  WebGLRenderer,
} from 'three';
import { FALL_H, HANDS_EXTRA, WHITE_H } from '@/lib/midi/keyboard-layout';
import type { HandPose, HandsPose } from '@/lib/midi/hands/hand-path';

/**
 * Cảnh 3D của hai bàn tay hình học, nhìn từ trên xuống bằng camera trực giao. Toạ độ ngang trùng với phím đàn SVG
 * (phím trắng = 1) và toạ độ dọc đo từ đỉnh SVG xuống, nên các ngón chạm đúng phím bên dưới. Lòng bàn tay nằm dưới mép
 * trước của phím, vì vậy cảnh cao hơn SVG thêm `HANDS_EXTRA`.
 */

const PALM_Y = FALL_H + WHITE_H + 2.2;
const PALM_W = 4.0;
const PALM_H = 1.5;
const KNUCKLE_Y = PALM_Y - PALM_H / 2;
const WHITE_TIP_Y = FALL_H + 2.7;
const BLACK_TIP_Y = FALL_H + 1.5;
/** Ngón nghỉ co lại cách khớp gốc chừng này. */
const REST_REACH = 1.5;
/** Tỉ lệ ba đốt ngón. */
const PHALANX = [0.45, 0.33, 0.22] as const;
const BRASS = 0xb8893a;

const SKIN = { left: 0xd7ad88, right: 0xe6c3a0 } as const;
const lerp = (a: number, b: number, w: number) => a + (b - a) * w;

interface FingerRig {
  bones: Mesh[];
  joints: Mesh[];
  material: MeshStandardMaterial;
}

export interface HandsScene {
  render(pose: HandsPose): void;
  /** Đặt kích thước vẽ theo pixel CSS của canvas. */
  resize(width: number, height: number): void;
  dispose(): void;
}

function buildHand(hand: 'left' | 'right', shared: { bone: CylinderGeometry; joint: SphereGeometry; palm: BoxGeometry }) {
  const group = new Group();
  const palmMaterial = new MeshStandardMaterial({ color: SKIN[hand], roughness: 0.7 });
  const palm = new Mesh(shared.palm, palmMaterial);
  group.add(palm);
  const wrist = new Mesh(shared.palm, palmMaterial);
  wrist.scale.set(0.6, 0.75, 1);
  group.add(wrist);

  const fingers: FingerRig[] = [];
  for (let f = 0; f < 5; f += 1) {
    const material = new MeshStandardMaterial({ color: SKIN[hand], roughness: 0.65, emissive: BRASS, emissiveIntensity: 0 });
    const bones = PHALANX.map(() => {
      const bone = new Mesh(shared.bone, material);
      group.add(bone);
      return bone;
    });
    const joints = [0, 1, 2, 3].map(() => {
      const joint = new Mesh(shared.joint, material);
      group.add(joint);
      return joint;
    });
    fingers.push({ bones, joints, material });
  }
  return { group, palm, wrist, palmMaterial, fingers };
}

type HandRig = ReturnType<typeof buildHand>;

/** Đặt vật tại (x, y theo toạ độ SVG) ở độ cao z. */
const place = (mesh: Mesh | Group, x: number, svgY: number, z = 0) => mesh.position.set(x, -svgY, z);

function updateHand(rig: HandRig, hand: 'left' | 'right', pose: HandPose | null) {
  rig.group.visible = pose !== null;
  if (!pose) return;
  place(rig.palm, pose.x, PALM_Y);
  place(rig.wrist, pose.x, PALM_Y + PALM_H * 0.9, -0.1);

  pose.fingers.forEach((finger, i) => {
    const rig5 = rig.fingers[i]!;
    const thumb = finger.finger === 1;
    const kx = finger.knuckleX;
    const ky = thumb ? KNUCKLE_Y + 0.9 : KNUCKLE_Y;
    const targetY = (finger.black ? BLACK_TIP_Y : WHITE_TIP_Y) + (thumb ? 0.5 : 0);
    const restY = ky - REST_REACH;
    // Nhấn thì đầu ngón co về phía khớp gốc một chút.
    const tipY = lerp(restY, targetY, finger.reach) + finger.press * 0.2;
    const tipX = finger.tipX;

    const pts = [{ x: kx, y: ky }];
    let acc = 0;
    for (const share of PHALANX) {
      acc += share;
      pts.push({ x: lerp(kx, tipX, acc), y: lerp(ky, tipY, acc) });
    }
    const radius = thumb ? 1.15 : 1;
    pts.forEach((p, j) => {
      const joint = rig5.joints[j]!;
      place(joint, p.x, p.y, 0.05);
      joint.scale.setScalar(radius * (1 - j * 0.07));
    });
    PHALANX.forEach((_, j) => {
      const a = pts[j]!;
      const b = pts[j + 1]!;
      const dx = b.x - a.x;
      const dy = -(b.y - a.y);
      const len = Math.hypot(dx, dy);
      const bone = rig5.bones[j]!;
      place(bone, (a.x + b.x) / 2, (a.y + b.y) / 2, 0.05);
      bone.rotation.z = Math.atan2(-dx, dy);
      bone.scale.set(radius * (1 - j * 0.07), Math.max(len, 0.001), radius * (1 - j * 0.07));
    });
    rig5.material.emissiveIntensity = finger.press * 0.9;
  });
}

/** Tạo cảnh trên `canvas`. Ném lỗi nếu không tạo được ngữ cảnh WebGL. */
export function createHandsScene(canvas: HTMLCanvasElement, whiteKeys: number): HandsScene {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const height = FALL_H + WHITE_H + HANDS_EXTRA;
  const camera = new OrthographicCamera(0, whiteKeys, 0, -height, 0.1, 20);
  camera.position.set(0, 0, 10);

  const scene = new Scene();
  scene.add(new AmbientLight(0xffffff, 1.6));
  const sun = new DirectionalLight(0xffffff, 2.2);
  sun.position.set(-3, -4, 8);
  scene.add(sun);

  // Hình học dùng chung: thân ngón có đường kính 0.8 và chiều dài 1 (kéo giãn theo trục Y).
  const shared = {
    bone: new CylinderGeometry(0.4, 0.4, 1, 12),
    joint: new SphereGeometry(0.4, 12, 8),
    palm: new BoxGeometry(PALM_W, PALM_H, 0.5),
  };
  const rigs = { left: buildHand('left', shared), right: buildHand('right', shared) };
  scene.add(rigs.left.group, rigs.right.group);

  return {
    render(pose) {
      updateHand(rigs.left, 'left', pose.left);
      updateHand(rigs.right, 'right', pose.right);
      renderer.render(scene, camera);
    },
    resize(width, heightPx) {
      renderer.setSize(Math.max(1, width), Math.max(1, heightPx), false);
    },
    dispose() {
      shared.bone.dispose();
      shared.joint.dispose();
      shared.palm.dispose();
      for (const rig of Object.values(rigs)) {
        rig.palmMaterial.dispose();
        for (const finger of rig.fingers) finger.material.dispose();
      }
      renderer.dispose();
    },
  };
}
