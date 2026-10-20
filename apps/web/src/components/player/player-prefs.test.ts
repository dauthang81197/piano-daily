import { afterEach, describe, expect, it, vi } from 'vitest';
import { clampZoom, readDark, readView, readZoom, writeDark, writeView, writeZoom, ZOOM_DEFAULT } from './player-prefs';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('player-prefs', () => {
  it('clampZoom: bước 10% không trôi, kẹp 70%–200%, giá trị lạ về 100%', () => {
    expect(clampZoom(1.04)).toBe(1);
    expect(clampZoom(1.06)).toBe(1.1);
    expect(clampZoom(0.1)).toBe(0.7);
    expect(clampZoom(9)).toBe(2);
    expect(clampZoom(Number.NaN)).toBe(ZOOM_DEFAULT);
    let z = 1;
    for (let i = 0; i < 7; i += 1) z = clampZoom(z + 0.1);
    expect(z).toBe(1.7);
  });

  it('chế độ xem, tối, zoom: ghi rồi đọc lại; chưa chọn thì null/false/100%; rác bị bỏ qua', () => {
    expect(readView()).toBeNull();
    expect(readDark()).toBe(false);
    expect(readZoom()).toBe(1);
    writeView('piano');
    writeDark(true);
    writeZoom(1.3);
    expect(readView()).toBe('piano');
    expect(readDark()).toBe(true);
    expect(readZoom()).toBe(1.3);
    localStorage.setItem('piano-daily:player-view', 'xxx');
    localStorage.setItem('piano-daily:player-zoom', 'abc');
    expect(readView()).toBeNull();
    expect(readZoom()).toBe(1);
  });

  it('bộ nhớ trình duyệt bị chặn: không ném, dùng mặc định', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readView()).toBeNull();
    expect(readDark()).toBe(false);
    expect(readZoom()).toBe(1);
    expect(() => writeView('piano')).not.toThrow();
    expect(() => writeDark(true)).not.toThrow();
    expect(() => writeZoom(1.2)).not.toThrow();
  });
});
