/** Số liệu chuyển động của tay để theo dõi chất lượng (lớp phủ debug `?handsDebug=1`). Không có dữ liệu người dùng. */
export interface HandStats {
  frames: number;
  fps: number;
  /** Thời gian xử lý mỗi khung (mili giây): trung vị, phân vị 95, lớn nhất. */
  renderMs: { p50: number; p95: number; max: number };
  /** Bước góc khớp lớn nhất giữa hai khung (rad): trung vị, phân vị 95, lớn nhất. */
  jointStep: { p50: number; p95: number; max: number };
}

const percentile = (sorted: readonly number[], q: number) => (sorted.length === 0 ? 0 : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!);

function summary(values: readonly number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return { p50: percentile(sorted, 0.5), p95: percentile(sorted, 0.95), max: sorted[sorted.length - 1] ?? 0 };
}

/** Vòng đệm các khung hình gần nhất (mặc định 300 khung, khoảng 5 giây ở 60 fps). */
export class HandMetrics {
  private readonly dts: number[] = [];
  private readonly renders: number[] = [];
  private readonly joints: number[] = [];

  constructor(private readonly capacity = 300) {}

  /** `dt`: giây giữa hai khung; `renderMs`: thời gian xử lý khung này; `jointStep`: bước góc khớp lớn nhất của khung. */
  record(dt: number, renderMs: number, jointStep: number): void {
    for (const [list, value] of [
      [this.dts, dt],
      [this.renders, renderMs],
      [this.joints, jointStep],
    ] as const) {
      list.push(value);
      if (list.length > this.capacity) list.shift();
    }
  }

  reset(): void {
    this.dts.length = this.renders.length = this.joints.length = 0;
  }

  /** `null` khi chưa có khung nào. */
  snapshot(): HandStats | null {
    if (this.dts.length === 0) return null;
    const total = this.dts.reduce((a, b) => a + b, 0);
    return {
      frames: this.dts.length,
      fps: total > 0 ? this.dts.length / total : 0,
      renderMs: summary(this.renders),
      jointStep: summary(this.joints),
    };
  }

  /** Một dòng chữ ngắn cho lớp phủ. */
  static format(stats: HandStats | null): string {
    if (!stats) return 'hands: chưa có số liệu';
    return `${stats.fps.toFixed(0)} fps · xử lý p95 ${stats.renderMs.p95.toFixed(1)} ms · bước khớp max ${stats.jointStep.max.toFixed(2)} rad`;
  }
}

/**
 * Lớp phủ số liệu bật bằng `?handsDebug` (hoặc `=1`/`=true`); `=0`, `=false` và vắng mặt thì tắt. Hàm thuần để dùng chung
 * cho mọi chỗ đọc URL.
 */
export function handsDebugEnabled(search: string): boolean {
  const value = new URLSearchParams(search).get('handsDebug');
  return value !== null && value !== '0' && value.toLowerCase() !== 'false';
}
