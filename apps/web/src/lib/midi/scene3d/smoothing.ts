import { Vector3 } from 'three';

/**
 * Lò xo tắt dần tới hạn (critically damped) tích phân chính xác theo `dt`: ổn định với mọi `dt`, không vọt lố, không phụ
 * thuộc tần số khung hình. `halfLife` là thời gian (giây) để khoảng cách tới đích giảm một nửa khi vận tốc ban đầu bằng 0.
 * Dùng để làm mượt chuyển động của tay theo đồng hồ thực, độc lập với đồng hồ âm thanh.
 */
export function springStep(value: number, velocity: number, target: number, halfLife: number, dt: number): [number, number] {
  if (dt <= 0) return [value, velocity];
  // omega = ln2 / halfLife * 2 cho tắt dần tới hạn: x(t) = (x0 + (v0 + omega x0) t) e^{-omega t}.
  const omega = (2 * Math.LN2) / Math.max(1e-4, halfLife);
  const e = Math.exp(-omega * dt);
  const x0 = value - target;
  const temp = (velocity + omega * x0) * dt;
  return [target + (x0 + temp) * e, (velocity - omega * temp) * e];
}

/** Bộ lọc lò xo cho một số thực. */
export class Smoother {
  value: number;
  velocity = 0;

  constructor(
    initial: number,
    readonly halfLife: number,
  ) {
    this.value = initial;
  }

  update(target: number, dt: number): number {
    [this.value, this.velocity] = springStep(this.value, this.velocity, target, this.halfLife, dt);
    return this.value;
  }

  /** Đặt thẳng tới `value`, bỏ vận tốc (tua, đổi bài, hiện lại tay). */
  snap(value: number): void {
    this.value = value;
    this.velocity = 0;
  }
}

/** Bộ lọc lò xo cho một vector 3 chiều. */
export class Smoother3 {
  readonly value: Vector3;
  private readonly velocity = new Vector3();

  constructor(
    initial: Vector3,
    readonly halfLife: number,
  ) {
    this.value = initial.clone();
  }

  update(target: Vector3, dt: number): Vector3 {
    const x = springStep(this.value.x, this.velocity.x, target.x, this.halfLife, dt);
    const y = springStep(this.value.y, this.velocity.y, target.y, this.halfLife, dt);
    const z = springStep(this.value.z, this.velocity.z, target.z, this.halfLife, dt);
    this.value.set(x[0], y[0], z[0]);
    this.velocity.set(x[1], y[1], z[1]);
    return this.value;
  }

  snap(value: Vector3): void {
    this.value.copy(value);
    this.velocity.set(0, 0, 0);
  }
}
