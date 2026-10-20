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
    if (!(key.slice(2) in args)) throw new Error(`Cờ không hợp lệ: ${key} (dùng --label, --base, --api, --locale)`);
    args[key.slice(2)] = value;
    i += 1;
  }
  if (!/^[\w.-]+$/.test(args.label) || /^\.+$/.test(args.label)) throw new Error('--label chỉ gồm chữ, số, "_", "-" và "." (không chỉ toàn dấu chấm)');
  if (!['vi', 'en'].includes(args.locale)) throw new Error('--locale chỉ nhận vi hoặc en');
  args.base = args.base.replace(/\/+$/, '');
  args.api = args.api.replace(/\/+$/, '');
  return args;
}

/** Tìm file chạy Chromium: biến môi trường, rồi cache Playwright (bản mới nhất có sẵn). */
export function findChromium(env = process.env, home = homedir()) {
  if (env.PLAYWRIGHT_CHROMIUM_PATH) return existsSync(env.PLAYWRIGHT_CHROMIUM_PATH) ? env.PLAYWRIGHT_CHROMIUM_PATH : null;
  const roots = [join(home, 'Library', 'Caches', 'ms-playwright'), join(home, '.cache', 'ms-playwright')];
  if (env.PLAYWRIGHT_BROWSERS_PATH) roots.unshift(env.PLAYWRIGHT_BROWSERS_PATH);
  for (const dir of roots) {
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
    ['search-empty', `/${l}/search?q=zzzzqqq`],
    ['pricing', `/${l}/pricing`],
    ['courses', `/${l}/courses`],
    ['not-found', `/${l}/khong-ton-tai`, 404],
  ];
  const sheets = await json(`${args.api}/sheets?pageSize=1`);
  const slug = sheets?.items?.[0]?.slug;
  if (slug) pages.push(['sheet', `/${l}/sheet/${encodeURIComponent(slug)}`]);
  else console.warn(`Bỏ qua trang sheet: API ${args.api} không trả sheet nào (API tắt hoặc chưa seed?).`);
  const composer = sheets?.items?.[0]?.composer?.slug;
  if (composer) pages.push(['composer', `/${l}/composer/${encodeURIComponent(composer)}`]);
  else console.warn('Bỏ qua trang composer: chưa có sheet nào để lấy composer.');
  const facets = await json(`${args.api}/sheets/facets`);
  const genre = facets?.genres?.[0]?.slug;
  if (genre) pages.push(['genre', `/${l}/genre/${encodeURIComponent(genre)}`]);
  else console.warn('Bỏ qua trang genre: API không trả genre nào.');
  const tracks = await json(`${args.api}/courses?locale=${l}`);
  const track = (tracks?.items ?? tracks)?.[0]?.slug;
  if (!track) console.warn('Bỏ qua trang khoá học: chưa có khoá học nào để chụp (course-track, course-lesson).');
  if (track) {
    pages.push(['course-track', `/${l}/courses/${encodeURIComponent(track)}`]);
    const detail = await json(`${args.api}/courses/${encodeURIComponent(track)}?locale=${l}`);
    const lesson = detail?.levels?.flatMap((lv) => (lv.sections ?? []).flatMap((s) => s.lessons ?? []))?.[0];
    if (lesson?.id) pages.push(['course-lesson', `/${l}/courses/${encodeURIComponent(track)}/${lesson.id}`]);
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
  if (!(await fetch(args.base, { signal: AbortSignal.timeout(8000) }).then((res) => res.status < 500, () => false))) {
    console.error(`Web không phản hồi tại ${args.base}. Chạy "pnpm --filter @piano-daily/web dev" (kèm API + dữ liệu mẫu, xem README) rồi thử lại.`);
    process.exit(1);
  }
  const pages = await buildPages(args);
  const { chromium } = await import('playwright-core');
  const browser = await chromium.launch({ executablePath });
  const out = join(dirname(fileURLToPath(import.meta.url)), '..', '.shots', args.label);
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
          // Cuộn hết trang để ảnh lazy được tải trước khi chụp, rồi kiểm tra tràn ngang.
          await page.evaluate(async () => {
            for (let y = 0, steps = 0; y < document.body.scrollHeight && steps < 60; y += window.innerHeight, steps += 1) {
              window.scrollTo(0, y);
              await new Promise((resolve) => setTimeout(resolve, 80));
            }
            window.scrollTo(0, 0);
          });
          await page.waitForLoadState('networkidle').catch(() => undefined);
          // Lỗi runtime của Next dev vẫn trả 200 nhưng hiện lớp phủ lỗi: coi là trang lỗi.
          const overlay = await page.evaluate(() => {
            const portal = document.querySelector('nextjs-portal');
            const text = portal?.shadowRoot?.textContent ?? '';
            return /(Runtime|Build|Console|Recoverable) Error|Unhandled/.test(text) ? text.slice(0, 160) : null;
          });
          if (overlay) {
            failed.push(`${path} → lỗi Next: ${overlay}`);
            console.warn(`Cảnh báo: ${path} hiện lớp phủ lỗi Next: ${overlay}`);
          }
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
          if (overflow > 0) {
            failed.push(`${path} → tràn ngang ${overflow}px ở ${viewport.name}`);
            console.warn(`Cảnh báo: ${path} tràn ngang ${overflow}px ở ${viewport.name}`);
          }
          await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
        } catch (error) {
          failed.push(`${path} → ${error.message.split('\n')[0]}`);
          console.warn(`Cảnh báo: lỗi khi chụp ${path}: ${error.message.split('\n')[0]}`);
          await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true }).catch(() => undefined);
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
