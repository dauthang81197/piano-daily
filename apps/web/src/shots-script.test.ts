import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

type Mod = { findChromium: (env: Record<string, string | undefined>, home: string) => string | null };
const load = async (): Promise<Mod> => (await import(/* @vite-ignore */ ['..', 'scripts', 'shots.mjs'].join('/'))) as Mod;

describe('scripts/shots.mjs findChromium', () => {
  it('ưu tiên PLAYWRIGHT_CHROMIUM_PATH, null khi file không tồn tại', async () => {
    const { findChromium } = await load();
    const dir = mkdtempSync(join(tmpdir(), 'shots-'));
    const exe = join(dir, 'chrome');
    writeFileSync(exe, '');
    expect(findChromium({ PLAYWRIGHT_CHROMIUM_PATH: exe }, dir)).toBe(exe);
    expect(findChromium({ PLAYWRIGHT_CHROMIUM_PATH: join(dir, 'khong-co') }, dir)).toBeNull();
  });
  it('chọn bản headless shell mới nhất trong cache, null khi không có', async () => {
    const { findChromium } = await load();
    const home = mkdtempSync(join(tmpdir(), 'shots-home-'));
    expect(findChromium({}, home)).toBeNull();
    for (const rev of ['1234', '1243']) {
      const sub = join(home, 'Library', 'Caches', 'ms-playwright', `chromium_headless_shell-${rev}`, 'arm64');
      mkdirSync(sub, { recursive: true });
      writeFileSync(join(sub, 'chrome-headless-shell'), '');
    }
    expect(findChromium({}, home)).toContain('chromium_headless_shell-1243');
  });
});
