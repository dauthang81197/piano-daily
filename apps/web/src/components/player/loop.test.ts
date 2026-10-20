import { describe, expect, it } from 'vitest';
import { clearLoop, LOOP_OFF, loopRange, setPointA, setPointB, toggleLoop } from './loop';

describe('loop', () => {
  it('tắt hoặc chưa biết thời lượng: không có đoạn lặp; bật mà chưa đặt A/B: lặp toàn bài', () => {
    expect(loopRange(LOOP_OFF, 100)).toBeNull();
    expect(loopRange({ on: true, a: null, b: null }, 0)).toBeNull();
    expect(loopRange({ on: true, a: null, b: null }, 100)).toEqual({ start: 0, end: 100 });
  });

  it('đặt A và B: đoạn [A, B]; chỉ A thì tới hết bài; chỉ B thì từ đầu', () => {
    expect(loopRange({ on: true, a: 10, b: 20 }, 100)).toEqual({ start: 10, end: 20 });
    expect(loopRange({ on: true, a: 10, b: null }, 100)).toEqual({ start: 10, end: 100 });
    expect(loopRange({ on: true, a: null, b: 30 }, 100)).toEqual({ start: 0, end: 30 });
  });

  it('đoạn dưới 0.1 giây hoặc ngoài thời lượng bị kẹp/bỏ', () => {
    expect(loopRange({ on: true, a: 10, b: 10.05 }, 100)).toBeNull();
    expect(loopRange({ on: true, a: 90, b: 500 }, 100)).toEqual({ start: 90, end: 100 });
    expect(loopRange({ on: true, a: 100, b: null }, 100)).toBeNull();
  });

  it('đặt điểm bật lặp; đặt A sau B hoặc B trước A thì bỏ điểm kia để đoạn luôn hợp lệ', () => {
    let s = setPointA(LOOP_OFF, 10);
    expect(s).toEqual({ on: true, a: 10, b: null });
    s = setPointB(s, 20);
    expect(s).toEqual({ on: true, a: 10, b: 20 });
    expect(setPointA(s, 25)).toEqual({ on: true, a: 25, b: null });
    expect(setPointB(s, 5)).toEqual({ on: true, a: null, b: 5 });
    expect(setPointA(s, -3).a).toBe(0);
  });

  it('nút Lặp giữ A/B khi tắt rồi bật; xoá đưa về mặc định', () => {
    const s = setPointB(setPointA(LOOP_OFF, 10), 20);
    const off = toggleLoop(s);
    expect(off).toEqual({ on: false, a: 10, b: 20 });
    expect(toggleLoop(off)).toEqual(s);
    expect(clearLoop()).toEqual(LOOP_OFF);
  });
});
