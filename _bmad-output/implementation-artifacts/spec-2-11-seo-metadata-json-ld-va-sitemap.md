---
title: 'Story 2.11 — SEO: metadata, JSON-LD và sitemap'
type: 'feature'
created: '2026-10-07'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '67a370c217dae984a35f77a2385920deee27d9af'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các trang công khai mới chỉ có `title` và `hreflang`: thiếu mô tả theo ngữ cảnh, Open Graph, JSON-LD, `sitemap.xml` và `robots.txt`, nên Google khó index và chia sẻ mạng xã hội không có thẻ xem trước. Ngoài ra Sheet/Composer/Genre không tồn tại đang trả HTTP 200 kèm giao diện 404 (soft 404).

**Approach:** Thêm một hàm dựng metadata dùng chung (title, description theo locale, canonical + `hreflang`, Open Graph, Twitter card) cho mọi trang công khai; JSON-LD `MusicComposition` và `BreadcrumbList` ở trang chi tiết Sheet; API `GET /sitemap-entries` (`@Public`) cùng `sitemap.xml` và `robots.txt` ở web (sitemap gắn tag `sitemap` nên đổi nội dung làm mới được); và kiểm tra tồn tại ở `layout.tsx` của route Sheet/Composer/Genre để trả HTTP 404 thật (cách `LevelLayout` đã dùng).

## Boundaries & Constraints

**Always:**
- **Metadata dùng chung** (`apps/web/src/lib/seo.ts`, hàm thuần có test): `pageMetadata({ locale, path, title, description, image?, type? })` trả `Metadata` gồm `title`, `description` (cắt 160 ký tự theo code point, bỏ khoảng trắng thừa), `alternates` (đúng `localeAlternates`: canonical theo locale hiện tại, `hreflang` vi/en và `x-default`), `openGraph` (`type` `website` hoặc `article`, `title`, `description`, `url` tuyệt đối, `siteName`, `locale` dạng `vi_VN`/`en_US` kèm `alternateLocale` của locale còn lại, `images` nếu có) và `twitter` (`summary_large_image` khi có ảnh, ngược lại `summary`). URL tuyệt đối tạo từ `siteUrl()` (`lib/site.ts`, đọc `NEXT_PUBLIC_SITE_URL`, mặc định `http://localhost:4100`, bỏ `/` cuối; `metadataBase` của layout dùng chung hàm này). Áp cho trang chủ, Level, Search, Composer, Genre và chi tiết Sheet; Search giữ `noindex, follow` khi có tham số lọc; route preview giữ nguyên `noindex, nofollow`, không canonical/hreflang/OG.
- **Mô tả theo locale:** chuỗi mới trong `messages/{vi,en}.json` (namespace `Seo`, giọng trang trọng, không emoji): mô tả trang chủ, Level (kèm tên level và số bài), Search, Genre (kèm tên và số bài), Composer (dùng bio nếu có, ngược lại câu mặc định kèm tên) và Sheet (dùng `description` nếu có, ngược lại câu mặc định nêu tên bài, Composer, Level và các định dạng có thật). Ảnh Open Graph: Sheet dùng ảnh trang đầu (`pages[0].url`) nếu có; Composer dùng `avatarUrl` nếu có; các trang còn lại không có ảnh (không bịa ảnh mặc định).
- **JSON-LD** (`apps/web/src/lib/json-ld.ts` + component `JsonLd`, chỉ ở `sheet/[slug]/page.tsx`, **không** ở `SheetDetail` và **không** ở preview): `MusicComposition` với `@context`, `name` (tên bài), `url` (tuyệt đối theo locale), `composer` (`Person` có `name` và `url` trang Composer), `genre` (mảng tên), `image` (ảnh trang đầu nếu có), `description`, `inLanguage`, `dateModified` (`updatedAt`), `isAccessibleForFree: true` (xem miễn phí); và một `BreadcrumbList` khớp breadcrumb hiển thị (Trang chủ › Level › tên bài). Mỗi khối là một `<script type="application/ld+json">`; serialize an toàn (thay `<`, `>`, `&`, U+2028/9 bằng escape Unicode) để dữ liệu do admin soạn không thể thoát khỏi thẻ script; trường rỗng/null bị bỏ, không để `null`/`undefined` trong JSON.
- **API `GET /sitemap-entries`** (module `catalog`, `@Public()`, thêm vào allowlist `public-routes.spec.ts`, throttle 30/phút, web SSR được miễn qua secret nội bộ): `sitemapEntriesSchema` (shared) `{ sheets: [{slug, updatedAt}], composers: [{slug, updatedAt}], genres: [{slug, updatedAt}] }`. Chỉ Sheet `PUBLISHED`; Composer/Genre chỉ khi có ít nhất một Sheet `PUBLISHED` (tránh trang rỗng trong sitemap); `updatedAt` của Composer/Genre là `updatedAt` lớn nhất trong các Sheet `PUBLISHED` của nó; sắp xếp ổn định theo `slug`. Không trả id, trạng thái hay trường nào ngoài ba trường trên.
- **`sitemap.xml`** (`apps/web/src/app/sitemap.ts`): gồm trang chủ, 4 trang Level, mọi Sheet/Composer/Genre từ API, cho **cả hai locale**, mỗi URL tuyệt đối kèm `alternates.languages` (vi, en); `lastModified` lấy từ API (Level/trang chủ không có thì bỏ). Lấy dữ liệu bằng `publicFetch` gắn tag `sitemap` (`force-cache`, `revalidate: 600`) để `revalidateTag('sitemap')` của Story 2.3 làm mới ngay; không đưa vào Search, preview hay trang tải. API lỗi thì ném (Next giữ bản cache cũ), không trả sitemap rỗng.
- **`robots.txt`** (`apps/web/src/app/robots.ts`): `allow /`, `disallow` `/api/` và `/{locale}/preview/` của mọi locale, `sitemap` trỏ `${siteUrl()}/sitemap.xml`; route tải của Epic 3 tự đặt `noindex` nên không liệt kê ở đây.
- **HTTP 404 thật** cho Sheet/Composer/Genre không tồn tại: thêm `layout.tsx` ở `sheet/[slug]`, `composer/[slug]`, `genre/[slug]` gọi cùng hàm fetch của trang (đã gắn tag, Next gộp request trùng) và `notFound()` khi `null`, trả `children` nếu có; không đổi hành vi hiển thị. Phải kiểm bằng `curl` trên server chạy thật (trạng thái 404, body là trang 404, và trang tồn tại vẫn 200). Route preview giữ giới hạn đã ghi (cần `proxy.ts`), ngoài phạm vi.
- **Nội dung SSR:** kiểm tra bằng `curl` trên server chạy thật rằng HTML ban đầu của Level, Search, Composer, Genre và chi tiết Sheet chứa H1 và nội dung chính, `<title>`, meta description, thẻ Open Graph, `link rel="alternate" hreflang` và (chi tiết Sheet) JSON-LD.
- **Test:** unit (`pageMetadata`: OG/Twitter/alternates/cắt mô tả/locale; `siteUrl`; JSON-LD: trường bắt buộc, bỏ trường rỗng, escape `</script>`; `sitemap`, `robots`), integration API (`/sitemap-entries`: chỉ PUBLISHED, Composer/Genre có bài, lastmod, sắp xếp, allowlist, không lộ trường lạ), shared schema, test từng trang (metadata mới, JSON-LD chỉ ở trang chi tiết công khai), test layout 404.

**Never:**
- Không thêm Sheet Draft/Archived vào sitemap, JSON-LD hay OG; không đưa preview vào sitemap/robots allow; không thêm dependency; không lập chỉ mục trang Search có bộ lọc.
- Không bịa dữ liệu JSON-LD (đánh giá, giá, lượt xem) và không dùng dữ liệu không có trong API; không đổi hành vi `/admin/*`.
- Không làm Organization/WebSite JSON-LD, sitemap chia nhỏ nhiều file hay ping công cụ tìm kiếm (ngoài phạm vi; ghi giới hạn 50.000 URL/sitemap vào README).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Trang chi tiết Sheet | `/en/sheet/fur-elise` | HTML SSR có `<title>`, description, OG (`article`, ảnh trang đầu), Twitter card, canonical + hreflang vi/en/x-default, JSON-LD `MusicComposition` và `BreadcrumbList` | N/A |
| Sheet không có mô tả/ảnh | `description` null, `pages` rỗng | Mô tả mặc định theo locale; OG không có `images`; Twitter `summary`; JSON-LD bỏ `image`/`description` rỗng | N/A |
| Mô tả dài | > 160 ký tự | Cắt 160 code point (không chẻ surrogate) | N/A |
| Dữ liệu chứa script | tên bài/lyrics có `</script><script>…` | JSON-LD escape Unicode, không thoát khỏi thẻ, JSON vẫn parse đúng | N/A |
| Level/Genre/Composer | trang có dữ liệu | Title, description (kèm số bài/tên), OG, canonical/hreflang; Composer có OG ảnh = avatar nếu có | N/A |
| Search có bộ lọc | `?q=…` hoặc lọc | `noindex, follow` như cũ, vẫn có canonical | N/A |
| Preview | route preview | `noindex, nofollow`, không canonical/hreflang/OG/JSON-LD, không trong sitemap | N/A |
| Sitemap | `GET /sitemap.xml` | Trang chủ, 4 Level, mọi Sheet/Composer/Genre công khai, đủ vi và en, kèm `alternates` | API lỗi → ném, giữ cache cũ |
| Sitemap loại trừ | Draft, Archived, Composer/Genre không có bài PUBLISHED | Không xuất hiện | N/A |
| Làm mới | publish Sheet mới | Tag `sitemap` được revalidate (Story 2.3) nên sitemap cập nhật | N/A |
| API sitemap | `GET /sitemap-entries` | `{sheets,composers,genres}` với `slug` + `updatedAt`, sắp theo slug, chỉ PUBLISHED, không lộ trường khác | N/A |
| Route public | quét controller | `GET /sitemap-entries` trong allowlist | N/A |
| robots.txt | `GET /robots.txt` | `Allow: /`, `Disallow: /api/`, `/vi/preview/`, `/en/preview/`, dòng `Sitemap:` tuyệt đối | N/A |
| Sheet không tồn tại | `/vi/sheet/khong-co` | HTTP **404** (không phải 200), body là trang 404 | N/A |
| Composer/Genre không tồn tại | `/vi/composer/khong-co`, `/vi/genre/khong-co` | HTTP **404** thật | N/A |
| Trang tồn tại | Sheet/Composer/Genre hợp lệ | Vẫn HTTP 200, nội dung không đổi | N/A |
| Locale lạ | `/xx/sheet/…` | 404 như cũ | N/A |
| URL gốc cấu hình | `NEXT_PUBLIC_SITE_URL` có `/` cuối hoặc thiếu | URL tuyệt đối đúng, không `//`; thiếu thì dùng mặc định local | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/seo.ts` (+ `seo.test.ts`) -- đã có `localeAlternates`; thêm `pageMetadata`; `apps/web/src/lib/site.ts` (mới) -- `siteUrl()`; `apps/web/src/lib/json-ld.ts` (mới) + `components/seo/json-ld.tsx` (mới).
- `apps/web/src/app/[locale]/{page,level/[level]/page,search/page,composer/[slug]/page,genre/[slug]/page,sheet/[slug]/page}.tsx` -- `generateMetadata` hiện chỉ có title/alternates (Sheet/Composer có description); đổi sang `pageMetadata`; sheet thêm `<JsonLd>`. `preview/sheet/[id]/page.tsx` -- không đổi.
- `apps/web/src/app/[locale]/level/[level]/layout.tsx` -- **mẫu** kiểm ở layout để có HTTP 404; tạo `sheet/[slug]/layout.tsx`, `composer/[slug]/layout.tsx`, `genre/[slug]/layout.tsx` tương tự; `apps/web/src/lib/catalog.ts` (`fetchSheetDetail`, `fetchComposer`, `fetchGenre`: `getJsonOrNull`, tag `search`) dùng lại.
- `apps/web/src/app/sitemap.ts`, `robots.ts` (mới, cấp `app/`, ngoài `[locale]`); `apps/web/src/proxy.ts` -- matcher đã loại `sitemap.xml`/`robots.txt`; `apps/web/src/lib/levels.ts` (`LEVELS`), `lib/locale.ts` (`LOCALES`), `lib/api.ts` (`publicFetch` + tag), `packages/shared/src/cache-tags.ts` (`cacheTags.sitemap`, đã có).
- `apps/api/src/modules/catalog/{public-sheets.controller,public-sheets.service}.ts` -- thêm `GET sitemap-entries` (`publishedWhere`, throttle như route khác); `packages/shared/src/sheet.ts` (+ spec) -- `sitemapEntriesSchema`; `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- mẫu và allowlist.
- `apps/api/src/modules/catalog/cache-invalidator.ts` -- đã phát tag `sitemap` khi Sheet/Composer/Genre đổi (không đổi).
- `apps/web/src/messages/{vi,en}.json` -- namespace `Seo`; `README.md` -- ghi sitemap/robots/JSON-LD và giới hạn.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/sheet.ts` (+spec) và `apps/api/src/modules/catalog/public-sheets.{service,controller}.ts` -- `GET /sitemap-entries` -- FR20
- [x] `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- phủ Matrix API và allowlist -- AC
- [x] `apps/web/src/lib/{site,seo,json-ld}.ts`, `components/seo/json-ld.tsx`, `messages/{vi,en}.json` (+test) -- metadata dùng chung, JSON-LD an toàn -- FR20, NFR4
- [x] `apps/web/src/app/[locale]/**/page.tsx` (+test) -- áp metadata cho mọi trang công khai, JSON-LD ở chi tiết Sheet -- FR20
- [x] `apps/web/src/app/{sitemap,robots}.ts` (+test) -- sitemap hai locale gắn tag, robots -- FR20
- [x] `apps/web/src/app/[locale]/{sheet/[slug],composer/[slug],genre/[slug]}/layout.tsx` (+test) -- HTTP 404 thật -- AC các story 2.5, 2.6
- [x] `README.md` -- ghi sitemap, robots, JSON-LD, giới hạn 50.000 URL -- tài liệu

**Acceptance Criteria:**
- Given server web chạy thật, when `curl` các trang Level, Search, Composer, Genre và chi tiết Sheet, then HTML ban đầu chứa H1, nội dung chính, `<title>`, meta description, Open Graph, `hreflang`, và trang chi tiết có JSON-LD `MusicComposition` hợp lệ.
- Given `GET /sitemap.xml`, when mở, then thấy mọi Sheet PUBLISHED, Level, Composer, Genre cho cả vi và en kèm `hreflang`; Draft/Archived không có; publish Sheet mới làm sitemap cập nhật sau khi tag `sitemap` được revalidate.
- Given `GET /robots.txt`, when mở, then trỏ tới sitemap và chặn route preview.
- Given Sheet/Composer/Genre không tồn tại, when `curl -I`, then trạng thái HTTP là 404; trang tồn tại vẫn 200.
- Given `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (build không đặt `NODE_ENV=development`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Mô tả Genre thiếu số bài (spec yêu cầu kèm số bài) | medium | patch | Đúng: `genreDescription` chỉ có `{name}`. Nay lấy tổng từ trang đầu (`fetchGenreSheets` page 1 newest) và đưa `{count}` vào chuỗi vi/en (en số ít/số nhiều); test bản dịch thật |
| `siteUrl` chấp nhận `localhost:4100`, `javascript:…` (parse được thành URL) và giữ query/hash | medium | patch | Chỉ nhận http(s), trả `origin + pathname` không `/` cuối; test các giá trị xấu |
| JSON-LD `inLanguage` là ngôn ngữ giao diện, không phải ngôn ngữ của tác phẩm | low | patch | Bỏ khỏi `MusicComposition` (cùng bài sẽ mang hai giá trị ở URL vi và en); test |
| Thứ tự sitemap không nhất quán (Sheet theo collation DB, Composer/Genre theo JS) | low | patch | Cùng một `compareSlug` (so sánh code unit) cho cả ba, bỏ `orderBy` của DB |
| Throttle `/sitemap-entries` không có test | medium | patch | Test 30 request ok, request 31 trả 429 kèm `Retry-After`, IP khác và secret nội bộ không bị ảnh hưởng |
| `JsonLd` thiếu test nhánh null/undefined và test XSS độc lập | low | patch | `json-ld.test.tsx`: render, null/undefined, `</script>` không thoát thẻ |
| Layout gọi API trước khi kiểm locale | low | patch | `hasLocale` trước khi fetch (như `LevelLayout`); test locale lạ không gọi API |
| Comment sitemap nói "giữ bản cache cũ" không chính xác | low | patch | Sửa thành mô tả đúng: 500 để crawler thử lại, dữ liệu fetch còn hạn vẫn dùng |
| Nhận định "web SSR không được miễn throttle" | false | - | `ThrottlerModule` toàn cục có `skipIf` theo `X-Internal-Secret` (app.module.ts); test mới xác nhận |
| `updatedAt` Composer/Genre bỏ qua sửa chính bản ghi | low | - | Spec chốt là lớn nhất trong các Sheet PUBLISHED; chênh lệch nhỏ cho `lastmod` |
| Chưa chia nhỏ sitemap (> 50.000 URL), truy vấn không phân trang | low | - | Spec loại trừ; giới hạn đã ghi vào README (khoảng 25.000 Sheet) |
| Trang Composer/Genre/Level rỗng vẫn index được | low | - | Spec chỉ yêu cầu loại khỏi sitemap; 404 cho trang rỗng sẽ chặn Composer mới tạo |
| JSON-LD mỏng (`@id`, `datePublished`, `Organization`…), OG không có ảnh mặc định/kích thước, `SITE_NAME` hằng, `bio` có thể chứa markdown | low | - | Ngoài phạm vi spec; `datePublished` không có trong API; không bịa ảnh mặc định |
| `generateMetadata` Level ném khi API lỗi | false | - | Trang gọi cùng `fetchLevelSummary`, nên API lỗi thì trang cũng lỗi: không có kiểu hỏng mới |
| Test layout 404 và `sitemap.dynamic` chỉ kiểm hằng/mock | low | - | Đã kiểm chứng HTTP 404 thật và sitemap bằng server chạy thật + `curl` (xem Verification); repo chưa có hạ tầng e2e |

## Design Notes

- **Một hàm `pageMetadata`:** mỗi trang tự gọi trong `generateMetadata` (layout không biết pathname); dùng chung bảo đảm canonical/hreflang/OG nhất quán và test được một chỗ thay vì sáu.
- **Sitemap gắn tag `sitemap`:** Story 2.3 đã phát tag này khi nội dung đổi, nên chỉ cần fetch đúng tag; `revalidate: 600` là lưới an toàn.
- **Composer/Genre chỉ vào sitemap khi có bài:** trang rỗng là nội dung mỏng, vô ích cho chỉ mục.
- **Escape JSON-LD:** tên bài và mô tả do admin nhập; thay `<` bằng `<` và các ký tự tương tự là cách chuẩn chặn thoát khỏi thẻ `<script>`.
- **404 ở layout:** `notFound()` trong trang xảy ra sau khi Next đã flush shell nên trạng thái đã là 200; ở layout thì chưa, đúng như `LevelLayout` (Story 2.2). Hai lần fetch cùng URL trong một request được Next gộp.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- Chạy `node apps/web/.next/standalone/apps/web/server.js` (kèm `API_INTERNAL_URL`, `INTERNAL_API_SECRET`, `NEXT_PUBLIC_*`) rồi `curl -s -o /dev/null -w '%{http_code}'` cho `/vi/sheet/khong-co`, `/vi/composer/khong-co`, `/vi/genre/khong-co` (expected 404) và các trang hợp lệ (expected 200); `curl -s /sitemap.xml`, `/robots.txt`, và `curl -s /vi/sheet/<slug> | grep -E 'application/ld\+json|og:title|hreflang'`

**Manual checks:**
- Dán URL trang chi tiết vào công cụ Rich Results / Facebook Sharing Debugger (khi đã có domain công khai) để xác nhận JSON-LD và thẻ OG.
