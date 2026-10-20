#!/usr/bin/env node
// Đo LCP và CLS của các trang chính ở 390px (mobile). Nên chạy trên bản build (`pnpm build && pnpm start`), vì dev server chậm hơn nhiều.
// Dùng:  pnpm --filter @piano-daily/web vitals [-- --base http://localhost:4100] [--api http://localhost:4000]
// Cảnh báo (thoát mã 1) khi CLS > 0.1 hoặc LCP > 2.5s.
import { chromium } from 'playwright-core';
import { findChromium } from './shots.mjs';

const LIMITS = { cls: 0.1, lcp: 2500 };

function parseArgs(argv) {
  const args = { base: 'http://localhost:4100', api: 'http://localhost:4000', locale: 'vi' };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--' || !key.startsWith('--')) continue;
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Error(`Thiếu giá trị cho ${key}`);
    if (!(key.slice(2) in args)) throw new Error(`Cờ không hợp lệ: ${key} (dùng --base, --api, --locale)`);
    args[key.slice(2)] = value.replace(/\/+$/, '');
    i += 1;
  }
  return args;
}

async function json(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}

async function pages(args) {
  const l = args.locale;
  const list = [
    ['home', `/${l}`],
    ['level', `/${l}/level/beginner`],
    ['search', `/${l}/search`],
    ['courses', `/${l}/courses`],
  ];
  const slug = (await json(`${args.api}/sheets?pageSize=1`))?.items?.[0]?.slug;
  if (slug) list.push(['sheet', `/${l}/sheet/${encodeURIComponent(slug)}`]);
  const tracks = await json(`${args.api}/courses?locale=${l}`);
  const track = (tracks?.items ?? tracks)?.[0]?.slug;
  if (track) list.push(['course-track', `/${l}/courses/${encodeURIComponent(track)}`]);
  return list;
}

const OBSERVE = () => {
  window.__vitals = { lcp: 0, cls: 0 };
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) window.__vitals.lcp = entry.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__vitals.cls += entry.value;
  }).observe({ type: 'layout-shift', buffered: true });
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const executablePath = findChromium();
  if (!executablePath) {
    console.error('Không tìm thấy Chromium. Đặt PLAYWRIGHT_CHROMIUM_PATH tới chrome-headless-shell.');
    process.exit(1);
  }
  if (!(await fetch(args.base, { signal: AbortSignal.timeout(8000) }).then((res) => res.status < 500, () => false))) {
    console.error(`Web không phản hồi tại ${args.base}. Chạy "pnpm --filter @piano-daily/web start" (sau khi build) rồi thử lại.`);
    process.exit(1);
  }
  const list = await pages(args);
  const browser = await chromium.launch({ executablePath });
  const warnings = [];
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    console.log('trang'.padEnd(14), 'LCP (ms)'.padStart(9), 'CLS'.padStart(8));
    for (const [name, path] of list) {
      const page = await context.newPage();
      await page.addInitScript(OBSERVE);
      await page.goto(`${args.base}${path}`, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1500);
      const { lcp, cls } = await page.evaluate(() => window.__vitals);
      console.log(name.padEnd(14), String(Math.round(lcp)).padStart(9), cls.toFixed(3).padStart(8));
      if (cls > LIMITS.cls) warnings.push(`${path}: CLS ${cls.toFixed(3)} > ${LIMITS.cls}`);
      if (lcp > LIMITS.lcp) warnings.push(`${path}: LCP ${Math.round(lcp)}ms > ${LIMITS.lcp}ms`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
  if (warnings.length > 0) {
    console.error(`Cảnh báo:\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
    process.exit(1);
  }
}

await main();
