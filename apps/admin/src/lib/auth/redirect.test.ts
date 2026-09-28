import { describe, expect, it } from 'vitest';
import { loginUrlFor, safeNextPath } from './redirect';

describe('safeNextPath', () => {
  it.each([
    ['/sheets', '/sheets'],
    ['/sheets?page=2', '/sheets?page=2'],
    [null, '/'],
    ['', '/'],
    ['https://evil.com', '/'],
    ['//evil.com', '/'],
    ['/\\evil.com', '/'],
    ['javascript:alert(1)', '/'],
    ['/login', '/'],
    ['/login?next=/x', '/'],
    ['/a\nb', '/'],
  ])('%s -> %s', (input, expected) => {
    expect(safeNextPath(input)).toBe(expected);
  });
});

describe('loginUrlFor', () => {
  it('hết phiên -> /login?next=<route>', () => {
    expect(loginUrlFor('unauthenticated', '/sheets?page=2')).toBe('/login?next=%2Fsheets%3Fpage%3D2');
    expect(loginUrlFor('unauthenticated', '/')).toBe('/login');
  });

  it('đăng xuất / đổi mật khẩu', () => {
    expect(loginUrlFor('logout', '/sheets')).toBe('/login');
    expect(loginUrlFor('password-changed', '/account/password')).toBe('/login?reason=password-changed');
  });
});
