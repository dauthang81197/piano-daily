import { claimAudio } from './audio-exclusive';

export type PreviewStatus = 'idle' | 'loading' | 'playing' | 'error';

/** Phiên preview đã bắt đầu; `stop` phải idempotent và giải phóng âm thanh. */
export interface PreviewSession {
  stop(): void;
}

/** Bắt đầu một phiên; gọi `onEnd` khi bản nghe thử tự kết thúc. Được gọi đồng bộ trong cử chỉ bấm. */
export type PreviewLoader = (onEnd: () => void) => Promise<PreviewSession>;

/**
 * Bộ điều phối nghe thử trên thẻ (Story 2.9): tại mỗi thời điểm chỉ một phiên đang tải hoặc phát. Các thẻ là nhiều
 * thể hiện React độc lập nên trạng thái nằm ở đây (module cấp trang), mỗi nút đọc trạng thái của chính nó qua
 * `statusOf(id)` + `subscribe` (`useSyncExternalStore`). Kết quả đến muộn của một phiên đã bị thay thế bị huỷ.
 */
export class PreviewController {
  private activeId: string | null = null;
  private status: PreviewStatus = 'idle';
  private session: PreviewSession | null = null;
  private token = 0;
  private releaseClaim: (() => void) | undefined;
  private readonly listeners = new Set<() => void>();

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  statusOf(id: string): PreviewStatus {
    return this.activeId === id ? this.status : 'idle';
  }

  /** Bấm nút của `id`: đang tải/phát thì dừng; ngược lại dừng phiên khác và bắt đầu phiên mới. */
  async toggle(id: string, loader: PreviewLoader): Promise<void> {
    if (this.activeId === id && (this.status === 'loading' || this.status === 'playing')) {
      this.stop();
      return;
    }
    this.release();
    // Nghe thử bắt đầu thì dừng player chính (một nguồn âm thanh tại một thời điểm trên trang).
    this.releaseClaim = claimAudio('card-preview', () => this.stop());
    const token = ++this.token;
    this.activeId = id;
    this.status = 'loading';
    this.emit();

    let ended = false;
    const onEnd = () => {
      ended = true;
      if (this.token === token && this.session) this.finish();
    };
    try {
      const session = await loader(onEnd);
      if (this.token !== token) {
        session.stop(); // đã bị thay thế khi đang tải: giải phóng, không phát
        return;
      }
      if (ended) {
        session.stop();
        this.finish();
        return;
      }
      this.session = session;
      this.status = 'playing';
      this.emit();
    } catch {
      if (this.token !== token) return;
      this.releaseClaim?.();
      this.releaseClaim = undefined;
      this.status = 'error';
      this.emit();
    }
  }

  /** Dừng phiên hiện tại (nếu có) và về `idle`. */
  stop(): void {
    this.release();
    this.emit();
  }

  /** Dừng nếu phiên hiện tại thuộc `id` (khi thẻ bị gỡ khỏi trang). */
  stopIf(id: string): void {
    if (this.activeId === id) this.stop();
  }

  private finish(): void {
    this.releaseClaim?.();
    this.releaseClaim = undefined;
    this.session = null;
    this.activeId = null;
    this.status = 'idle';
    this.emit();
  }

  /** Vô hiệu phiên đang tải và dừng phiên đang phát, không phát thông báo. */
  private release(): void {
    this.token += 1;
    this.releaseClaim?.();
    this.releaseClaim = undefined;
    const session = this.session;
    this.session = null;
    this.activeId = null;
    this.status = 'idle';
    session?.stop();
  }

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }
}

export const previewController = new PreviewController();
