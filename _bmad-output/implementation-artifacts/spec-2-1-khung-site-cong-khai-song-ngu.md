---
title: 'Story 2.1 — Khung site công khai song ngữ'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2c57ff13a3281451fef5f85327a0a8445e565780'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `apps/web` mới chỉ có một trang "Sắp ra mắt", không có locale, header/footer hay đường gọi API nội bộ, nên các story 2.2–2.11 chưa có nền để dựng trang công khai.

**Approach:** Dựng khung site với `next-intl` 4.14 (locale trên URL `/vi|/en`), `proxy.ts` redirect path chưa có tiền tố, layout gồm header/footer/hamburger, bộ component nền, client gọi API nội bộ có `X-Internal-Secret`, CSP và `hreflang`. Phía API bổ sung secret bỏ qua throttle và origin web trong CORS.

## Boundaries & Constraints

**Always:**
- **Locale (AD-12):** `apps/web/src/proxy.ts` bọc `createMiddleware` của next-intl. Chỉ redirect path **không có tiền tố** `/vi` hoặc `/en`, theo thứ tự cookie `NEXT_LOCALE` (hợp lệ) → header `cf-ipcountry == VN` thì `vi` → còn lại `en`. URL đã có tiền tố không bao giờ bị redirect theo IP hay cookie. `localeCookie.maxAge` = 1 năm. Matcher loại `_next`, `api`, file tĩnh, `sitemap.xml`, `robots.txt`. Logic chọn locale là hàm thuần để test.
- **Cấu trúc:** chuyển `src/app/layout.tsx` + `page.tsx` thành `src/app/[locale]/{layout,page}.tsx`; `<html lang>` theo locale; locale lạ trả 404. Message `src/messages/{vi,en}.json` chỉ chứa UI chrome. Microcopy trang trọng, không emoji. Font giữ `fonts.ts` (subset `vietnamese`).
- **Layout chung:** header gồm logo, Home, Search, 4 Level (`/level/{beginner|intermediate|advanced|expert}`), ô tìm kiếm (form GET tới `/[locale]/search?q=`) và nút đổi ngôn ngữ (dùng navigation của next-intl, đặt cookie, giữ nguyên path). `< md` dùng hamburger (nút có `aria-expanded`, đóng bằng Esc). Footer gồm giới thiệu, link tới các Level và disclaimer bản quyền. Trang Search/Level chưa tồn tại (Story 2.2, 2.4) nên link tạm trả 404.
- **Component nền** (`src/components/ui`): `Button` (`primary` walnut, `secondary` outline; render được như link) và `Input`; focus ring brass 2px trên mọi phần tử bấm được (UX-DR16), dùng token `packages/tokens`.
- **`hreflang`:** hàm `localeAlternates(path)` trong `src/lib/seo.ts` trả `alternates.languages` (`vi`, `en`, `x-default`) + canonical; trang chủ dùng nó trong `generateMetadata`; đây là quy ước cho mọi route công khai sau này.
- **API nội bộ (AD-18):** `src/lib/api.ts` (`server-only`) gọi `API_INTERNAL_URL` kèm `X-Internal-Secret` từ `INTERNAL_API_SECRET`; browser dùng `NEXT_PUBLIC_API_URL`. Thiếu biến thì lỗi nêu tên biến.
- **API:** thêm env bắt buộc `INTERNAL_API_SECRET` (≥ 32 ký tự, không bắt đầu `change-me`) và `CORS_WEB_ORIGIN`. Request mang `X-Internal-Secret` đúng (so sánh timing-safe) thì `ThrottlerModule` `skipIf`. CORS cho thêm origin web nhưng **không** bật `credentials`; origin admin giữ nguyên.
- **CSP:** đặt qua `headers()` trong `next.config.ts`: `default-src 'self'`; script/frame cho `paypal.com`, `youtube.com`/`youtube-nocookie.com`; `img-src` gồm `'self' data:` và origin media (`NEXT_PUBLIC_MEDIA_BASE_URL`); `connect-src` gồm `'self'`, origin `NEXT_PUBLIC_API_URL`, PayPal. Dev thêm `'unsafe-eval'`.
- **Hạ tầng:** cập nhật `.env.example`, `docker-compose.yml` (web nhận `INTERNAL_API_SECRET`, build args `NEXT_PUBLIC_*`; api nhận `INTERNAL_API_SECRET`, `CORS_WEB_ORIGIN`), `apps/web/Dockerfile` (ARG), README.
- **Test:** thêm Vitest cho `apps/web` (jsdom + Testing Library, cùng phiên bản với admin) và script `test`.

**Never:**
- Không làm trang Level/Search/Composer/Genre/Sheet, cache tag, `/api/revalidate` hay sitemap (Story 2.2+).
- Không bật `cacheComponents`; không dịch nội dung Sheet; không thêm nút Download.
- Không để lộ `INTERNAL_API_SECRET` cho browser (không đặt tiền tố `NEXT_PUBLIC_`).
- Không redirect URL đã có tiền tố locale.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Không tiền tố, có cookie | `/level/beginner`, `NEXT_LOCALE=en`, `cf-ipcountry=VN` | Redirect `/en/level/beginner` | N/A |
| Không tiền tố, IP VN | `/`, không cookie, `cf-ipcountry=VN` | Redirect `/vi` | N/A |
| Không tiền tố, IP khác/không header | `/`, không cookie | Redirect `/en` | N/A |
| Cookie sai giá trị | `NEXT_LOCALE=fr` | Bỏ qua cookie, chọn theo IP | N/A |
| Đã có tiền tố | `/vi/level/beginner`, `cf-ipcountry=US`, cookie `en` | Không redirect | N/A |
| Locale lạ | `/fr` | 404 | N/A |
| Đổi ngôn ngữ | bấm nút đổi ở `/en/level/beginner` | Tới `/vi/level/beginner`, cookie `NEXT_LOCALE=vi` (1 năm) | N/A |
| Vào lại path trần sau khi đổi | `/`, cookie `vi`, `cf-ipcountry=US` | Redirect `/vi` | N/A |
| Hamburger | viewport `< md` | Menu thu gọn; mở bằng nút, Esc đóng | N/A |
| Secret đúng | API nhận `X-Internal-Secret` khớp | Bỏ qua throttle | N/A |
| Secret sai/thiếu | header sai | Vẫn bị throttle như client thường | Không lộ lý do |
| CORS origin web | `Origin` = `CORS_WEB_ORIGIN` | `Access-Control-Allow-Origin` có; không có `Allow-Credentials` | N/A |
| Thiếu env web | không có `API_INTERNAL_URL`/`INTERNAL_API_SECRET` | `api.ts` ném lỗi nêu tên biến | Không log secret |

</frozen-after-approval>

## Code Map

- `apps/web/src/app/{layout,page,fonts,globals}.*` -- layout/trang chủ hiện có; chuyển vào `[locale]`, giữ `fonts.ts` và `globals.css`.
- `apps/web/next.config.ts` -- `output: 'standalone'`; thêm plugin `next-intl` và `headers()` CSP.
- `apps/web/package.json`, `Dockerfile` -- thêm `next-intl`, vitest + Testing Library (đối chiếu `apps/admin/package.json`), ARG build.
- `packages/tokens/theme.css` -- token màu, font, cỡ chữ (`secondary` = brass, `primary` = walnut).
- `apps/admin/vitest.config.*`, `src/components/ui/*` -- mẫu cấu hình test và Button/Input (shadcn) để tham chiếu phong cách.
- `apps/api/src/app.module.ts` -- `ThrottlerModule.forRoot` (thêm `skipIf`); `apps/api/src/bootstrap.ts` -- delegate CORS (thêm origin web không credentials); `apps/api/src/config/env.ts` (+ `test/unit/env.spec.ts`, `test/integration/create-app.ts`, `cors.spec.ts`) -- env mới.
- `.env.example`, `docker-compose.yml`, `README.md` -- biến và hướng dẫn.
- `_bmad-output/planning-artifacts/ux-designs/**/{DESIGN,EXPERIENCE}.md` -- Components, Voice & Tone.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/config/env.ts` + `app.module.ts` + `bootstrap.ts` + test -- `INTERNAL_API_SECRET`, `CORS_WEB_ORIGIN`, `skipIf` throttle, CORS web không credentials -- AD-18
- [x] `apps/web/package.json`, `vitest.config.ts`, `next.config.ts` -- next-intl, test runner, CSP -- nền
- [x] `apps/web/src/i18n/{routing,request,navigation}.ts`, `src/lib/locale.ts`, `src/proxy.ts` (+ test) -- locale và redirect -- AD-12
- [x] `apps/web/src/messages/{vi,en}.json` -- UI chrome hai ngôn ngữ -- FR19
- [x] `apps/web/src/app/[locale]/{layout,page}.tsx`, `src/lib/seo.ts` -- layout, `hreflang` -- khung
- [x] `apps/web/src/components/{ui/button,ui/input,layout/header,layout/mobile-menu,layout/language-switcher,layout/footer}.tsx` (+ test) -- header/footer/hamburger -- UX-DR3/9/16/17/24
- [x] `apps/web/src/lib/api.ts` (+ test) -- client SSR nội bộ -- AD-18
- [x] `.env.example`, `docker-compose.yml`, `apps/web/Dockerfile`, `README.md` -- biến môi trường và hướng dẫn -- hạ tầng
- [x] Test phủ I/O matrix (proxy, locale, language switcher, hamburger, `api.ts`, throttle skip, CORS)

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build --wait`, when mở `http://localhost:4100/`, then bị chuyển sang `/en` (hoặc `/vi` theo cookie), thấy header, footer và đổi ngôn ngữ được; `curl -sI localhost:4100/vi` có header `Content-Security-Policy`.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Đổi ngôn ngữ làm mất query string (`/en/search?q=bach` → `/vi/search`) | medium | `language-switcher.tsx` dùng `usePathname()` của next-intl (không có query); ba reviewer cùng nêu; mất dữ liệu người dùng khi Search có mặt | patch |
| 2 | Matcher loại mọi path bắt đầu bằng `api` (`/apple`, `/api-docs`) nên không được redirect locale, ra 404 không có layout | low | Đúng: regex `(?!api\|...)` chỉ là tiền tố; sửa đúng một ký tự regex | patch |
| 3 | Matcher không có test | low | `proxy.test.ts` gọi `proxy()` trực tiếp; thêm test regex rẻ, đi cùng #2 | patch |
| 4 | `NEXT_PUBLIC_SITE_URL=` rỗng làm `new URL('')` ném lỗi, mọi trang 500 | low | `??` không rơi về mặc định với chuỗi rỗng; sửa thành `\|\|` | patch |
| 5 | CSP (`buildCsp`/`headers()`) không có test | medium | Không test nào import `next.config.ts`; bỏ origin media/API hoặc bật `unsafe-eval` vô điều kiện vẫn xanh | patch |
| 6 | `NEXT_PUBLIC_SITE_URL` không có trong `turbo.json`, Dockerfile ARG, compose build args | low | Không đặt được khi build Docker nên canonical/hreflang production rơi về localhost | patch |
| 7 | Matcher loại mọi path có dấu chấm (`/en/level/foo.bar`) | low | Slug sinh từ `slugify` không chứa dấu chấm; chủ ý để loại file tĩnh/`sitemap.xml` | reject |
| 8 | Prefix locale phân biệt hoa thường; `/EN/x`, `//foo` redirect xấu | low | Không có input thực tế; fix thêm nhánh chuẩn hoá | reject |
| 9 | Cookie locale ghi phía client không có `Secure` | low | next-intl đặt cùng cookie ở middleware với cùng thuộc tính; cookie chỉ chứa `vi`/`en` | reject |
| 10 | Không có root layout, path ngoài `[locale]` ra 404 mặc định | low | Proxy redirect mọi path trần vào `[locale]`; chỉ còn path bị matcher loại (file tĩnh, `/api`) | reject |
| 11 | CSP: `originOf` im lặng khi env thiếu/sai, media bị chặn không báo lỗi build | low | Dockerfile/compose có giá trị mặc định cho cả hai biến; thêm throw là nhánh mới | reject |
| 12 | CSP thiếu `i.ytimg.com`, `data:` cho font, `report-uri`, `upgrade-insecure-requests`; dùng `unsafe-inline`, wildcard `*.paypal.com` | low | `unsafe-inline` bắt buộc vì Next không nonce (đã ghi trong code); phần còn lại chưa có tính năng dùng tới | reject |
| 13 | `frame-ancestors` không kèm `X-Frame-Options` | low | `frame-ancestors` được mọi trình duyệt hiện hành hỗ trợ | reject |
| 14 | `apiFetch` không timeout/retry/cache policy | low | Chưa có nơi gọi; chính sách cache/timeout thuộc Story 2.2 (AD-10) | reject |
| 15 | `apiFetch` chấp nhận env toàn khoảng trắng | low | Không có input thực tế; lỗi hiện rõ ở lần gọi đầu | reject |
| 16 | `skipIf` với secret rò rỉ vô hiệu hoá throttle login | false | Đúng thiết kế AD-18 (secret là khoá bỏ qua throttle); secret bắt buộc, timing-safe, không lộ tới browser | reject |
| 17 | Endpoint công khai chưa có throttle; thiếu test route không throttle mang secret | false | Story chỉ yêu cầu bỏ throttle cho route dùng `ThrottlerGuard`; endpoint công khai thuộc Epic 2 sau | reject |
| 18 | Secret không có cơ chế xoay, không log request bỏ qua throttle | low | Ngoài phạm vi story; đổi secret = đổi env ở hai phía | reject |
| 19 | `CF-Connecting-IP` có thể giả mạo để đổi bucket throttle | low | Có từ Story 1.2; AD-18 giải quyết ở hạ tầng (Caddy `trusted_proxies`, origin chỉ nhận từ Cloudflare) | reject |
| 20 | Redirect 307 theo cookie/IP không có `Vary`/`Cache-Control` nên CDN có thể cache | low | Cloudflare không cache 307 theo mặc định; không có cache rule trong repo | reject |
| 21 | Hamburger: không focus trap, không đóng khi click ngoài/resize/đổi ngôn ngữ | low | Hành vi cơ bản (`aria-expanded`, Esc, trả focus) đã đúng theo spec; phần còn lại là tinh chỉnh | reject |
| 22 | Không có skip-link; hai `nav` cùng `aria-label`; form search nhân đôi trong DOM | false | Bản ẩn dùng `display:none` (`hidden`/`md:hidden`) nên không nằm trong cây truy cập; skip-link ngoài yêu cầu spec | reject |
| 23 | `Button` có `href` là `<a>` thường (reload toàn trang); trang chủ/not-found tự ghép `/${locale}/…` | low | Đúng nhưng chỉ là hiệu năng điều hướng; sửa cần đổi `Button` dùng `Link` | reject |
| 24 | `Button` không xử lý `disabled`/`target=_blank` cho link | low | Không có nơi dùng | reject |
| 25 | `cn` không merge class Tailwind | low | Chưa có xung đột class thực tế | reject |
| 26 | Liên kết header/footer/trang chủ tới `/search`, `/level/*` đang 404 | false | Spec (Always) nêu rõ tạm trả 404 tới Story 2.2/2.4 | reject |
| 27 | Không có `robots.txt`/`sitemap.xml`; `localeAlternates` chỉ gắn vào trang chủ | false | Spec (Never) đẩy sang Story 2.11; quy ước hreflang đã ghi trong `seo.ts` | reject |
| 28 | Thiếu test cho `layout`, trang, `not-found`, `Footer`, `Header`, `SearchForm`, `safeEqual` | low | Logic nằm ở hàm thuần đã test; `safeEqual` được `auth.spec` phủ qua throttle | reject |
| 29 | `generateMetadata` của trang chủ/layout không có test (hreflang, `metadataBase`) | low | Helper `localeAlternates` đã test; đã xác minh qua `curl` trong Docker (canonical + 3 hreflang) | reject |
| 30 | `publicApiUrl()` chưa có nơi dùng và test | low | Helper dành cho story sau; không hại | reject |
| 31 | Cổng cũ `3000/3001` còn trong test; `TEST_CORS_WEB_ORIGIN` dùng 3000 | false | Đó là origin giả trong test, không phụ thuộc cổng thật; grep xác nhận cấu hình thật đã đổi | reject |
| 32 | `@parcel/watcher: false` trong `allowBuilds` không giải thích | false | Là dependency của next-intl; pnpm sẽ fail cài đặt/`--frozen-lockfile` nếu thiếu (đã ghi trong báo cáo triển khai) | reject |
| 33 | `/fr` trả 307 rồi mới 404 (spec ghi 404) | false | `/fr` không tiền tố nên AD-12 bắt buộc redirect; kết quả cuối `/en/fr` là 404 đúng mục đích matrix | reject |
| 34 | Logo hard-code "Piano Daily"; `Meta.title` giống nhau hai ngôn ngữ; thiếu `viewport`/`themeColor` | low | Tên thương hiệu không dịch; Next có viewport mặc định | reject |
| 35 | Nhiều dependency mới pin exact ở bản major mới (vitest 5, jsdom 30, plugin-react 6) | low | Cùng phiên bản với `apps/admin` (đã dùng ổn); quy ước pin chính xác của dự án | reject |
| 36 | Test integration API `sheet-files.spec` timeout hàng loạt khi chạy toàn bộ suite (xanh 43/43 khi chạy riêng) | maybe-false | Không chạm file nào của story này; cũng đã thấy ở Story 1.9 và trong báo cáo triển khai (mỗi lần một spec khác nhau). Cần tái hiện có log S3/DB để xác định nguyên nhân | defer |

## Design Notes

- **`INTERNAL_API_SECRET` bắt buộc** ở API: deny-by-default, tránh chạy production mà quên bật; đổi lại dev phải cập nhật `.env` (đã ghi trong `.env.example`/README).
- **`skipIf` đặt ở `ThrottlerModule`** nên áp cho mọi route dùng `ThrottlerGuard` (hiện là login/đổi mật khẩu; các endpoint công khai Epic 2 dùng chung). Secret so sánh bằng `crypto.timingSafeEqual`.
- **`hreflang` qua `localeAlternates(path)`** vì layout không biết pathname; mỗi trang tự gọi trong `generateMetadata`.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `docker compose up -d --build --wait && curl -sI localhost:4100/ && curl -sI -H 'cf-ipcountry: VN' localhost:4100/` -- expected: 307 tới `/en` và `/vi`

**Manual checks:**
- Trình duyệt: đổi ngôn ngữ, tải lại `/`; thu nhỏ `< md` để thử hamburger và phím Tab thấy focus ring brass.
