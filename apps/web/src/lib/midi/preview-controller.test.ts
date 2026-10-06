import { beforeEach, describe, expect, it, vi } from 'vitest';
import { claimAudio, resetAudioClaims } from './audio-exclusive';
import { PreviewController, type PreviewSession } from './preview-controller';

/** Loader giả: điều khiển được lúc nào xong, và ghi lại stop/onEnd. */
function fakeLoader() {
  let resolve!: (s: PreviewSession) => void;
  let reject!: (e: unknown) => void;
  let onEnd!: () => void;
  const session = { stop: vi.fn() };
  const loader = vi.fn((end: () => void) => {
    onEnd = end;
    return new Promise<PreviewSession>((res, rej) => {
      resolve = res;
      reject = rej;
    });
  });
  return { loader, session, finish: () => resolve(session), fail: (e = new Error('x')) => reject(e), end: () => onEnd() };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('PreviewController', () => {
  let c: PreviewController;
  beforeEach(() => {
    resetAudioClaims();
    c = new PreviewController();
  });

  it('trạng thái mặc định idle; bấm thì loading rồi playing', async () => {
    const a = fakeLoader();
    expect(c.statusOf('a')).toBe('idle');
    const p = c.toggle('a', a.loader);
    expect(c.statusOf('a')).toBe('loading');
    expect(a.loader).toHaveBeenCalledTimes(1);
    a.finish();
    await p;
    expect(c.statusOf('a')).toBe('playing');
    expect(c.statusOf('b')).toBe('idle');
  });

  it('loader được gọi đồng bộ trong lần bấm (để mở khoá AudioContext trong cử chỉ người dùng)', () => {
    const a = fakeLoader();
    void c.toggle('a', a.loader);
    expect(a.loader).toHaveBeenCalledTimes(1); // chưa chờ gì
  });

  it('bấm lại đúng nút khi đang phát thì dừng và giải phóng', async () => {
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    a.finish();
    await p;
    await c.toggle('a', a.loader);
    expect(a.session.stop).toHaveBeenCalledTimes(1);
    expect(c.statusOf('a')).toBe('idle');
    expect(a.loader).toHaveBeenCalledTimes(1);
  });

  it('bấm lại khi đang tải: dừng, và kết quả đến muộn bị huỷ (không phát)', async () => {
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    await c.toggle('a', a.loader);
    expect(c.statusOf('a')).toBe('idle');
    a.finish();
    await p;
    expect(a.session.stop).toHaveBeenCalledTimes(1); // giải phóng phiên đến muộn
    expect(c.statusOf('a')).toBe('idle');
  });

  it('bấm thẻ khác: phiên cũ dừng, chỉ phiên mới phát', async () => {
    const a = fakeLoader();
    const b = fakeLoader();
    const pa = c.toggle('a', a.loader);
    a.finish();
    await pa;
    const pb = c.toggle('b', b.loader);
    expect(a.session.stop).toHaveBeenCalledTimes(1);
    expect(c.statusOf('a')).toBe('idle');
    expect(c.statusOf('b')).toBe('loading');
    b.finish();
    await pb;
    expect(c.statusOf('b')).toBe('playing');
    expect(c.statusOf('a')).toBe('idle');
  });

  it('bấm A rồi B ngay khi A còn đang tải: kết quả của A đến muộn bị huỷ, chỉ B phát', async () => {
    const a = fakeLoader();
    const b = fakeLoader();
    const pa = c.toggle('a', a.loader);
    const pb = c.toggle('b', b.loader);
    b.finish();
    await pb;
    a.finish();
    await pa;
    expect(a.session.stop).toHaveBeenCalledTimes(1);
    expect(b.session.stop).not.toHaveBeenCalled();
    expect(c.statusOf('a')).toBe('idle');
    expect(c.statusOf('b')).toBe('playing');
  });

  it('tự kết thúc: về idle; onEnd của phiên cũ không ảnh hưởng phiên mới', async () => {
    const a = fakeLoader();
    const b = fakeLoader();
    const pa = c.toggle('a', a.loader);
    a.finish();
    await pa;
    const pb = c.toggle('b', b.loader);
    b.finish();
    await pb;
    a.end(); // phiên cũ báo kết thúc muộn
    expect(c.statusOf('b')).toBe('playing');
    b.end();
    expect(c.statusOf('b')).toBe('idle');
  });

  it('kết thúc ngay trước khi loader trả về: không chuyển sang playing, giải phóng phiên', async () => {
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    a.end();
    a.finish();
    await p;
    expect(a.session.stop).toHaveBeenCalledTimes(1);
    expect(c.statusOf('a')).toBe('idle');
  });

  it('lỗi tải: trạng thái error cho đúng nút đó, bấm lại để thử; nút khác không bị ảnh hưởng', async () => {
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    a.fail();
    await p;
    expect(c.statusOf('a')).toBe('error');
    expect(c.statusOf('b')).toBe('idle');
    const retry = fakeLoader();
    const p2 = c.toggle('a', retry.loader);
    expect(c.statusOf('a')).toBe('loading');
    retry.finish();
    await p2;
    expect(c.statusOf('a')).toBe('playing');
  });

  it('lỗi của phiên đã bị thay thế bị bỏ qua (không ghi đè phiên mới)', async () => {
    const a = fakeLoader();
    const b = fakeLoader();
    const pa = c.toggle('a', a.loader);
    const pb = c.toggle('b', b.loader);
    b.finish();
    await pb;
    a.fail();
    await pa;
    expect(c.statusOf('b')).toBe('playing');
    expect(c.statusOf('a')).toBe('idle');
  });

  it('bấm thẻ khác khi đang ở trạng thái error thì xoá lỗi', async () => {
    const a = fakeLoader();
    const b = fakeLoader();
    const pa = c.toggle('a', a.loader);
    a.fail();
    await pa;
    void c.toggle('b', b.loader);
    expect(c.statusOf('a')).toBe('idle');
  });

  it('stopIf chỉ dừng khi phiên thuộc đúng id (thẻ bị gỡ khỏi trang)', async () => {
    const a = fakeLoader();
    const pa = c.toggle('a', a.loader);
    a.finish();
    await pa;
    c.stopIf('other');
    expect(c.statusOf('a')).toBe('playing');
    c.stopIf('a');
    expect(a.session.stop).toHaveBeenCalledTimes(1);
    expect(c.statusOf('a')).toBe('idle');
  });

  it('subscribe báo thay đổi và huỷ đăng ký được', async () => {
    const listener = vi.fn();
    const off = c.subscribe(listener);
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    expect(listener).toHaveBeenCalled(); // loading
    a.finish();
    await p;
    const calls = listener.mock.calls.length;
    off();
    c.stop();
    expect(listener.mock.calls.length).toBe(calls);
    await tick();
  });
});

describe('PreviewController + audio-exclusive (một nguồn âm thanh tại một thời điểm)', () => {
  beforeEach(() => resetAudioClaims());

  it('bắt đầu nghe thử thì dừng player chính; nghe thử đang phát không bị dừng bởi chính nó', async () => {
    const c = new PreviewController();
    const stopPlayer = vi.fn();
    claimAudio('main-player', stopPlayer);
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    expect(stopPlayer).toHaveBeenCalledTimes(1); // dừng ngay từ lúc bấm, kể cả khi còn đang tải
    a.finish();
    await p;
    const b = fakeLoader();
    const pb = c.toggle('b', b.loader);
    b.finish();
    await pb;
    expect(stopPlayer).toHaveBeenCalledTimes(1);
    expect(c.statusOf('b')).toBe('playing');
  });

  it('player chính bắt đầu phát thì dừng nghe thử đang phát hoặc đang tải', async () => {
    const c = new PreviewController();
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    a.finish();
    await p;
    claimAudio('main-player', vi.fn());
    expect(a.session.stop).toHaveBeenCalledTimes(1);
    expect(c.statusOf('a')).toBe('idle');

    const b = fakeLoader();
    const pb = c.toggle('b', b.loader);
    claimAudio('main-player', vi.fn());
    expect(c.statusOf('b')).toBe('idle');
    b.finish();
    await pb;
    expect(b.session.stop).toHaveBeenCalledTimes(1); // kết quả đến muộn bị giải phóng
  });

  it('nghe thử kết thúc hoặc lỗi thì nhả quyền: player chính nhận quyền không phải dừng ai', async () => {
    const c = new PreviewController();
    const a = fakeLoader();
    const p = c.toggle('a', a.loader);
    a.fail();
    await p;
    claimAudio('main-player', vi.fn());
    expect(c.statusOf('a')).toBe('error');
  });
});
