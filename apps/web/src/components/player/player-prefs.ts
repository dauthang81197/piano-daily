/** Lựa chọn giao diện của player được nhớ trong trình duyệt (bọc try/catch: bộ nhớ có thể bị chặn). */

export type PlayerView = 'notation' | 'piano';

const VIEW_KEY = 'piano-daily:player-view';
const DARK_KEY = 'piano-daily:player-dark';
const ZOOM_KEY = 'piano-daily:player-zoom';

export const ZOOM_MIN = 0.7;
export const ZOOM_MAX = 2;
export const ZOOM_STEP = 0.1;
export const ZOOM_DEFAULT = 1;

/** Làm tròn về bước 10% và kẹp 70%–200% (tránh sai số dấu phẩy động khi cộng dồn 0.1). */
export function clampZoom(value: number): number {
  if (!Number.isFinite(value)) return ZOOM_DEFAULT;
  const stepped = Math.round(value / ZOOM_STEP) * ZOOM_STEP;
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, stepped)) * 100) / 100;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Không lưu được thì thôi: lần sau dùng mặc định.
  }
}

/** `null` khi chưa từng chọn: người gọi tự chọn mặc định theo ngữ cảnh (có khuông nhạc hay không). */
export function readView(): PlayerView | null {
  const value = read(VIEW_KEY);
  return value === 'notation' || value === 'piano' ? value : null;
}
export const writeView = (view: PlayerView): void => write(VIEW_KEY, view);

export const readDark = (): boolean => read(DARK_KEY) === 'on';
export const writeDark = (on: boolean): void => write(DARK_KEY, on ? 'on' : 'off');

export function readZoom(): number {
  const raw = read(ZOOM_KEY);
  return raw === null ? ZOOM_DEFAULT : clampZoom(Number(raw));
}
export const writeZoom = (zoom: number): void => write(ZOOM_KEY, String(clampZoom(zoom)));
