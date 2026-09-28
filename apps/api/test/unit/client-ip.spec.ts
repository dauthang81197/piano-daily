import { describe, expect, it } from 'vitest';
import { getClientIp } from '../../src/common/http/client-ip';

const socket = { remoteAddress: '10.0.0.5' };

describe('getClientIp', () => {
  it('ưu tiên CF-Connecting-IP', () => {
    expect(getClientIp({ headers: { 'cf-connecting-ip': '203.0.113.7' }, socket })).toBe('203.0.113.7');
    expect(getClientIp({ headers: { 'cf-connecting-ip': ' 2001:db8::1 ' }, socket })).toBe('2001:db8::1');
  });

  it('không có header -> IP socket (chạy local)', () => {
    expect(getClientIp({ headers: {}, socket })).toBe('10.0.0.5');
  });

  it('bỏ qua header không phải IP hợp lệ và X-Forwarded-For', () => {
    expect(getClientIp({ headers: { 'cf-connecting-ip': 'not-an-ip' }, socket })).toBe('10.0.0.5');
    expect(getClientIp({ headers: { 'cf-connecting-ip': '' }, socket })).toBe('10.0.0.5');
    expect(getClientIp({ headers: { 'x-forwarded-for': '198.51.100.1' }, socket })).toBe('10.0.0.5');
  });

  it('không có socket -> "unknown"', () => {
    expect(getClientIp({ headers: {} })).toBe('unknown');
  });
});
