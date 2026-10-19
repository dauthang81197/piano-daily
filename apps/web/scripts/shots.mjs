#!/usr/bin/env node
// Chụp ảnh các trang công khai ở 3 cỡ màn hình để duyệt giao diện trước/sau.
// Dùng:  pnpm --filter @piano-daily/web shots -- --label before [--base http://localhost:4100] [--api http://localhost:4000]
// Ảnh: apps/web/.shots/<label>/<viewport>/<trang>.png. Dùng Chromium có sẵn (PLAYWRIGHT_CHROMIUM_PATH hoặc cache của Playwright).
import { existsSync, mkdirSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

function parseArgs(argv) {
  const args = { label: 'current', base: 'http://localhost:4100', api: 'http://localhost:4000', locale: 'vi' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--' || !key.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Thiếu giá trị cho ${key}`);
    args[key.slice(2)] = value;
    i += 1;
  }
  if (!/^[\w.-]+$/.test(args.label)) throw new Error('--label chỉ gồm chữ, số, "_", "-" và "."');
  return args;
}

/** Tìm file chạy Chromium: biến môi trường, rồi cache Playwright (bản mới nhất có sẵn). */
export function findChromium(env = process.env, home = homedir()) {
  if (env.PLAYWRIGHT_CHROMIUM_PATH) return existsSync(env.PLAYWRIGHT_CHROMIUM_PATH) ? env.PLAYWRIGHT_CHROMIUM_PATH : null;
  const root = join(home, 'Library', 'Caches', 'ms-playwright');
  const linuxRoot = join(home, '.cache', 'ms-playwright');
  for (const dir of [root, linuxRoot]) {
    if (!existsSync(dir)) continue;
    const builds = readdirSync(dir)
      .filter((n) => n.startsWith('chromium_headless_shell-'))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const build of builds) {
      const base = join(dir, build);
      for (const sub of readdirSync(base)) {
        const exe = join(base, sub, 'chrome-headless-shell');
        if (existsSync(exe)) return exe;
      }
    }
  }
  return null;
}

async function json(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

/** Danh sách trang: cố định + bài/khoá đầu tiên tìm được qua API công khai (thiếu thì bỏ qua). */
async function buildPages(args) {
  const l = args.locale;
  const pages = [
    ['home', `/${l}`],
    ['level-beginner', `/${l}/level/beginner`],
    ['level-intermediate', `/${l}/level/intermediate`],
    ['search', `/${l}/search`],
    ['search-query', `/${l}/search?q=a`],
    ['pricing', `/${l}/pricing`],
    ['courses', `/${l}/courses`],
    ['not-found', `/${l}/khong-ton-tai`, 404],
  ];
  const sheets = await json(`${args.api}/sheets?pageSize=1`);
  const slug = sheets?.items?.[0]?.slug;
  if (slug) pages.push(['sheet', `/${l}/sheet/${encodeURIComponent(slug)}`]);
  const tracks = await json(`${args.api}/courses?locale=${l}`);
  const track = (tracks?.items ?? tracks)?.[0]?.slug;
  if (track) {
    pages.push(['course-track', `/${l}/courses/${encodeURIComponent(track)}`]);
    const detail = await json(`${args.api}/courses/${encodeURIComponent(track)}?locale=${l}`);
    const lesson = detail?.levels?.flatMap((lv) => lv.sections.flatMap((s) => s.lessons))?.[0];
    if (lesson) pages.push(['course-lesson', `/${l}/courses/${encodeURIComponent(track)}/${lesson.id}`]);
  }
  return pages;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const executablePath = findChromium();
  if (!executablePath) {
    console.error('Không tìm thấy Chromium. Đặt PLAYWRIGHT_CHROMIUM_PATH tới chrome-headless-shell (hoặc chạy "npx playwright install chromium-headless-shell").');
    process.exit(1);
  }
  if (!(await fetch(args.base, { signal: AbortSignal.timeout(8000) }).then(() => true, () => false))) {
    console.error(`Web không phản hồi tại ${args.base}. Chạy "pnpm --filter @piano-daily/web dev" (kèm API + dữ liệu mẫu, xem README) rồi thử lại.`);
    process.exit(1);
  }
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath });
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.shots', args.label);
  const pages = await buildPages(args);
  const failed = [];
  try {
    for (const viewport of VIEWPORTS) {
      const dir = join(out, viewport.name);
      mkdirSync(dir, { recursive: true });
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: 'reduce' });
      for (const [name, path, expected = 200] of pages) {
        const page = await context.newPage();
        try {
          const res = await page.goto(`${args.base}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
          const status = res?.status() ?? 0;
          if (status !== expected) {
            failed.push(`${path} → ${status}`);
            console.warn(`Cảnh báo: ${path} trả ${status} (mong ${expected})`);
          }
          await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
        } catch (error) {
          failed.push(`${path} → ${error.message.split('\n')[0]}`);
          console.warn(`Cảnh báo: không chụp được ${path}: ${error.message.split('\n')[0]}`);
        } finally {
          await page.close();
        }
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  console.log(`Ảnh ở ${out}`);
  if (failed.length > 0) {
    console.error(`Có ${failed.length} trang lỗi:\n${failed.map((f) => `  - ${f}`).join('\n')}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
