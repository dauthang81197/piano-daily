---
title: 'Story 2.2 — Trang duyệt theo Level'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8404d5b5717b2d81fbcfbcbf49369faa23f97e66'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Site công khai chưa có trang nào hiển thị Sheet; link Level trên header đang 404 và API chưa có endpoint public nào.

**Approach:** Thêm hai endpoint public ở `catalog` (danh sách Sheet PUBLISHED và tóm tắt theo Level), hàm sinh cache tag trong `packages/shared`, rồi dựng trang `/[locale]/level/[level]` SSR gồm hero, tag cloud Genre, lưới `card-sheet`, phân trang theo số trang và skeleton.

## Boundaries & Constraints

**Always:**
- **API (`@Public()`, thêm vào allowlist của `public-routes.spec.ts`):**
  - `GET /sheets?level=&genre=&sort=newest|most_viewed&page=&pageSize=`: chỉ Sheet `PUBLISHED`. `level` bắt buộc (enum shared); `genre` là **slug** Genre (slug lạ → trả trang rỗng, không lỗi); `sort` mặc định `newest` (`firstPublishedAt desc, id desc`), `most_viewed` là `viewCount desc, firstPublishedAt desc, id desc`; `pageSize` mặc định 12, tối đa 48. Trả `{items,page,pageSize,total}`; mỗi item: `id, publicId, slug, title, level, composer{id,name}, viewCount, hasSheet, hasChords, hasMidi, hasMp3, hasVideo, pageCount, isHot, thumbnailUrl|null` (URL public đã resolve từ THUMBNAIL hiện hành; không bao giờ lộ `storageKey` hay URL private).
  - `GET /levels/:level/summary` (`level` = enum): `{ total, lastUpdatedAt|null, genres: [{id, slug, name, count}] }` chỉ tính Sheet PUBLISHED của Level đó; `genres` chỉ gồm Genre có ≥ 1 Sheet, sắp theo `count desc, name asc`; `lastUpdatedAt` = `max(updatedAt)` của các Sheet đó.
  - Zod DTO (`publicSheetListQuerySchema`, `publicSheetItemSchema`, `levelSummarySchema`) đặt trong `packages/shared/src/sheet.ts`; SQL/Prisma chỉ trong `catalog` (service mới `PublicSheetsService`, controller mới), dùng `StorageService.publicUrl`.
- **Cache tag (AD-10):** `packages/shared/src/cache-tags.ts` export `cacheTags` gồm `sheet(id)`, `listLevel(level)`, `listComposer(id)`, `listGenre(id)`, `listSeries(id)`, `search`, `sitemap`, `ads`, `settings` (đúng chuỗi `sheet:{id}`, `list:level:{level}`, …) và có unit test; level trong tag là chữ thường (`beginner`).
- **Web fetch:** `src/lib/api.ts` thêm `publicFetch(path, {tags})` = `apiFetch` + `cache: 'force-cache'`, `next: { tags, revalidate: 600 }`. Trang Level dùng tag `listLevel(level)`, thêm `listGenre(id)` khi đang lọc Genre. Không `no-store`, không bật `cacheComponents`.
- **Trang `/[locale]/level/[level]`** (SSR, `setRequestLocale`, `generateMetadata` dùng `localeAlternates`):
  - **404 và streaming (quyết định của người duyệt):** `loading.tsx` (skeleton) khiến Next đã trả shell HTTP 200 trước khi `notFound()` trong `page.tsx` chạy. Giữ `loading.tsx`; thêm `level/[level]/layout.tsx` kiểm tra `level` (sai → `notFound()` ngay ở layout, trả **HTTP 404 thật**). Với `page` sai/vượt giới hạn (chỉ biết được trong `page.tsx`) chấp nhận hiện trang "Không tìm thấy" kèm `noindex` nhưng HTTP 200.
  - `level` URL là chữ thường trong `LEVELS`; sai → `notFound()`. `page` không hợp lệ (không phải số nguyên ≥ 1) → 404; `page > 1` mà không còn item → 404; `sort`/`genre` sai giá trị → về mặc định/bỏ lọc.
  - Hero `display-lg` ("{Level} Piano Sheet PDF" theo locale) kèm tổng số bài, ô tìm kiếm lớn (form GET `/[locale]/search?q=`), dòng "Sheet database updated on {ngày theo locale}" (ẩn nếu `lastUpdatedAt` null), tag cloud Genre, lưới Sheet.
  - **Tag cloud** là `Link` giữ nguyên `sort`, đặt `genre=slug` (bỏ `page`), `scroll={false}`; tag đang chọn nền `secondary` (brass) chữ trắng, bấm lần nữa bỏ lọc. Có link "Tất cả". Bộ chọn sắp xếp (Mới nhất / Xem nhiều) là các `Link` tương tự.
  - **Lưới:** 3/2/1 cột (lg/md/sm); phân trang theo số trang, mỗi trang một URL (`?page=N`), có Trước/Sau và số trang, không infinite scroll. `loading.tsx` hiển thị skeleton card đúng hình dạng thẻ và cùng số cột.
  - **`card-sheet`:** nền `surface-container-low`, viền `outline-variant`, `rounded-md`; thumbnail (`<img loading="lazy">`, alt `"{title} – trang 1"`), badge Level góc trên-trái (màu token `level-*`), badge HOT góc trên-phải khi `isHot`, `headline-sm` tên bài, caption Composer + lượt xem, nhãn `label-caps` chỉ cho định dạng có thật (Sheet/Chords/Midi/Mp3/Video theo `has_*`) và số trang. Cả thẻ là một link tới `/[locale]/sheet/{slug}` (trang chi tiết ở Story 2.6, tạm 404); hover nâng bằng shadow ấm, không đổi nền; focus ring brass 2px.
  - Trang rỗng: `headline-sm` thông báo không có bài và gợi ý bỏ lọc; lỗi API/mạng làm trang lỗi (không nuốt lỗi).
- **i18n:** toàn bộ chữ giao diện mới nằm trong `messages/{vi,en}.json`; giọng trang trọng, không emoji; tên Level theo `Nav.levels`.
- **Test:** Vitest (shared, web) và integration (API) như ma trận bên dưới.

**Never:**
- Không làm tìm kiếm toàn văn, trang Composer/Genre/Sheet, mini-preview/player, đếm lượt xem hay `/api/revalidate` (Story 2.3+).
- Không trả Draft/Archived qua bất kỳ endpoint public nào; không đổi endpoint `/admin/*`.
- Không thêm dependency mới; không dùng `next/image`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Danh sách mặc định | `GET /sheets?level=BEGINNER` | Chỉ PUBLISHED đúng Level, `newest`, `pageSize` 12, có `thumbnailUrl` | N/A |
| Draft/Archived | Sheet DRAFT/ARCHIVED cùng Level | Không xuất hiện ở `items`, `total` hay summary | N/A |
| Lọc Genre | `genre=<slug hợp lệ>` | Chỉ Sheet gắn Genre đó | N/A |
| Genre lạ | `genre=khong-co` | 200, `items` rỗng, `total` 0 | N/A |
| Sắp xếp | `sort=most_viewed` | `viewCount` giảm dần, tie-break ổn định | `sort` sai → 400 `VALIDATION_FAILED` |
| Thiếu/sai level | không có `level` hoặc `level=FOO` | 400 `VALIDATION_FAILED` | N/A |
| Phân trang | `page=2&pageSize=12` | Đúng lát cắt; `total` đúng | `pageSize>48` → 400 |
| Summary | `GET /levels/BEGINNER/summary` | `total`, `lastUpdatedAt`, `genres` kèm `count` (chỉ PUBLISHED) | level sai → 400 |
| Level rỗng | không có Sheet PUBLISHED | `total` 0, `lastUpdatedAt` null, `genres` [] | N/A |
| Không lộ file private | mọi response | không có `storageKey`, URL private | N/A |
| Route public | quét controller | `GET /sheets`, `GET /levels/:level/summary` nằm trong allowlist | N/A |
| Level sai trên web | `/en/level/foo` | HTTP 404 thật (từ layout) | N/A |
| Page vượt giới hạn | `?page=99` (không còn item) / `?page=0` / `?page=abc` | Trang "Không tìm thấy" kèm `noindex` (HTTP 200 do streaming) | N/A |
| Chọn tag Genre | bấm tag | Link tới `?genre=slug` (không `page`, giữ `sort`); tag chọn nền brass; bấm lại bỏ lọc | N/A |
| Cache tag | gọi `cacheTags.*` | Đúng chuỗi AD-10 (`list:level:beginner`, `sheet:{id}`, …) | N/A |
| Thẻ Sheet | item có `hasMidi`, không `hasMp3`, `isHot` | Hiện nhãn Midi (không Mp3), badge HOT; alt "{title} – trang 1" | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/catalog/{sheets.service,sheets.controller,catalog.module}.ts` -- `LIST_SELECT`, `REF`, `StorageService.publicUrl`, cách phân trang; thêm `public-sheets.{service,controller}.ts` rồi đăng ký ở `CatalogModule`. Không sửa luồng admin.
- `apps/api/src/modules/identity/public.decorator.ts`, `apps/api/test/integration/public-routes.spec.ts` -- `@Public()` và allowlist `PUBLIC_ROUTES`.
- `apps/api/test/integration/{catalog-sheets,sheet-files}.spec.ts` -- mẫu integration (login, TRUNCATE, seed Sheet qua service/Prisma); dùng `prisma/fixtures` để có THUMBNAIL.
- `packages/shared/src/{sheet,catalog,index}.ts` -- `Level`, `PAGE_SIZE_*`, schema; thêm `cache-tags.ts` (+ spec) và export.
- `apps/web/src/lib/{api,levels,locale,seo}.ts`, `src/i18n/*`, `src/components/{layout,ui}/*`, `src/messages/{vi,en}.json` -- khung Story 2.1 (đã có `apiFetch`, `Button`, `localeAlternates`, `Link` next-intl, test-utils `withIntl`).
- `apps/web/src/app/[locale]/{layout,page}.tsx`, `[...rest]/page.tsx` -- thêm `level/[level]/{page,loading}.tsx`; route cụ thể thắng catch-all.
- `packages/tokens/theme.css` -- màu `level-*`, `hot-accent`, `secondary`, cỡ chữ.
- `_bmad-output/planning-artifacts/ux-designs/**/DESIGN.md` -- `card-sheet`, `tag-genre`, Elevation.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/{cache-tags,sheet,index}.ts` (+spec) -- `cacheTags`, schema query/item/summary -- hợp đồng
- [x] `apps/api/src/modules/catalog/public-sheets.{service,controller}.ts` + `catalog.module.ts` -- `GET /sheets`, `GET /levels/:level/summary` -- FR1
- [x] `apps/api/test/integration/public-sheets.spec.ts` + `public-routes.spec.ts` -- phủ matrix API và allowlist -- AC
- [x] `apps/web/src/lib/api.ts` (+test) -- `publicFetch` -- AD-10
- [x] `apps/web/src/lib/{catalog,query}.ts` (+test) -- gọi API, phân tích `page/sort/genre`, dựng href -- logic
- [x] `apps/web/src/components/catalog/{sheet-card,sheet-grid,sheet-card-skeleton,genre-tags,sort-links,pagination}.tsx` (+test) -- UI -- UX-DR5–8, DR21
- [x] `apps/web/src/app/[locale]/level/[level]/{page,loading}.tsx` + `messages/{vi,en}.json` -- trang Level -- FR1
- [x] `README.md` -- ghi endpoint public và quy ước cache tag -- tài liệu

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build --wait` và đã `pnpm db:seed`, when mở `/en/level/beginner`, then thấy hero, tag cloud, lưới thẻ có thumbnail; bấm tag lọc được và URL có `?genre=`; `?page=2` (khi đủ bài) có URL riêng.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap) và kiểm tra tay trên Docker.

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Level sai và `page` sai/vượt giới hạn trả HTTP 200 (soft 404) thay vì 404 | high | Tự kiểm bằng `curl` trên stack Docker: `/en/level/foo` → 200 (thân "Page not found" + `noindex`), `?page=0`/`?page=99` → 200, trong khi `/en/nope` → 404. Nguyên nhân: `loading.tsx` làm Next flush shell trước khi `notFound()` trong `page.tsx` chạy; test đơn vị không bắt được | intent_gap → người duyệt chọn "layout kiểm Level" (đã ghi vào frozen); xử lý bằng patch vì quyết định chỉ bổ sung, không làm mất giá trị phần code đã làm |
| 2 | `firstPublishedAt desc` đặt NULL lên đầu (ba reviewer) | low | Postgres sắp NULL trước khi `DESC`; sửa một thuộc tính `nulls: 'last'`; đi kèm test | patch |
| 3 | Trần `page` 1.000.000 cho phép OFFSET rất sâu trên endpoint không xác thực | medium | `publicSheetListQuerySchema` và `parsePage` đều cho tới 1.000.000 × pageSize; chưa có throttle cho route công khai | patch |
| 4 | Trang gọi summary rồi mới gọi danh sách tuần tự, trái ghi chú thiết kế "song song" | low | Đúng; khi không có `genre` thì không cần id nên chạy `Promise.all` được | patch |
| 5 | Không có test chạy `LevelPage` (nhánh 404, genre lạ bị bỏ, trang rỗng + "bỏ lọc") | medium | Xác minh: chỉ có test cho `lib` và thành phần; bỏ guard `page > 1 && rỗng` hoặc check genre vẫn xanh | patch |
| 6 | Tag cho `fetchLevelSheets` không genre chưa có assertion | low | `catalog.test.ts` chỉ kiểm trường hợp có genre; gộp với #5 | patch |
| 7 | `take: 1` của THUMBNAIL không có `orderBy` | low | Pipeline media chỉ tạo một THUMBNAIL hiện hành cho mỗi Sheet (key không có `pageNumber`) | reject |
| 8 | `lastUpdatedAt = max(updatedAt)` có thể bị đẩy lên bởi thao tác không đổi nội dung công khai | low | Spec quy định đúng `max(updatedAt)`; lượt xem (Story 2.7) sẽ ghi bằng SQL thô, không chạm `@updatedAt` | reject |
| 9 | Thiếu index cho `(status, level, firstPublishedAt/viewCount)` | low | Đã có index `status` và `level`; quy mô hiện tại không cần; thêm là migration mới | reject |
| 10 | SEO: canonical trỏ về trang 1 cho mọi biến thể, thiếu meta description, không `noindex` cho lọc | low | Chuẩn SEO metadata/JSON-LD thuộc Story 2.11; spec chỉ yêu cầu `localeAlternates` | reject |
| 11 | Ảnh dùng `<img>` lazy cho cả hàng đầu, không `width/height` | low | Có wrapper `aspect-ratio` giữ chỗ nên không nhảy bố cục; spec cấm `next/image` | reject |
| 12 | Tag đang chọn có `aria-current` nhưng bấm lại là bỏ lọc | low | Hành vi theo spec ("bấm lần nữa bỏ lọc"); tinh chỉnh nhãn trợ năng | reject |
| 13 | Hard-code 12 thẻ skeleton, trần page lặp ở hai nơi | low | Giá trị mặc định 12 là hằng của spec; phần trần page được sửa ở #3 | reject |
| 14 | Ngày "cập nhật" hiển thị theo UTC, có thể lệch một ngày với giờ Việt Nam | low | Spec chỉ yêu cầu định dạng theo locale; múi giờ báo cáo chưa chốt (`REPORT_TZ` thuộc epic sau) | reject |
| 15 | Thiếu `Cache-Control`/throttle cho endpoint công khai; `genres` không giới hạn | low | Cache nằm ở web (`force-cache`); throttle công khai ngoài phạm vi story; số Genre nhỏ | reject |
| 16 | Tin cậy dữ liệu: `getJson` đưa path vào lỗi; JSON không hợp lệ; cache lỗi 5xx | low | Path không chứa bí mật; lỗi hiện rõ qua error boundary; Next không cache phản hồi lỗi | reject |
| 17 | `GET /sheets` public và admin có thể đụng route | false | Admin dùng tiền tố `admin/sheets`; `public-routes.spec` quét toàn bộ route | reject |
| 18 | `/level/BEGINNER` (hoa) trả 404 thay vì redirect | low | Spec: slug chữ thường; không có link nào sinh chữ hoa | reject |
| 19 | Summary cache cũ khiến Genre mới bị bỏ lọc; Genre bị xoá giữa hai truy vấn | low | Cửa sổ ≤ 600 giây và Story 2.3 revalidate; hiếm | reject |
| 20 | `Pagination`/`pageWindow` với `pageSize` 0 hoặc `current > total` | low | Props nội bộ do trang tính, không có input ngoài | reject |
| 21 | Ảnh thumbnail lỗi tải không rơi về placeholder; khoá i18n cho Level mới | low | Chưa có tình huống; Level là enum đóng 4 giá trị | reject |
| 22 | `setRequestLocale` gọi sau `notFound()`; query lặp (`?genre=a&genre=b`) gây 400 ở API | false | Web `parseGenre` lấy phần tử đầu rồi mới gọi API; 404 không cần locale context | reject |
| 23 | Format lại mảng `PUBLIC_ROUTES`, dòng controllers dài | low | Thẩm mỹ; repo chưa có formatter chung | reject |

## Design Notes

- **Tag cloud và sắp xếp là `Link` (SSR)** thay vì state phía client: URL luôn khớp nội dung, crawler thấy được, tận dụng `force-cache` theo từng query.
- **`/levels/:level/summary` gộp** tổng số, ngày cập nhật và Genre vào một lần gọi nên hero và tag cloud chỉ cần hai fetch song song cùng với danh sách.
- **Genre theo slug** để URL đọc được; tag `list:genre:{id}` vẫn dùng id lấy từ summary.
- **Draft không lộ:** mọi truy vấn public lọc `status = PUBLISHED` ở một chỗ (`where` dùng chung) để Story 2.4/2.5 tái dùng.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `pnpm db:seed && curl -s 'localhost:4000/sheets?level=BEGINNER' | head -c 600 && curl -s localhost:4000/levels/BEGINNER/summary` -- expected: chỉ Sheet PUBLISHED; có `thumbnailUrl`; summary có `genres[].count`

**Manual checks:**
- Trình duyệt: `/vi/level/beginner` (đủ 3/2/1 cột khi đổi cỡ cửa sổ, skeleton khi tải, hover thẻ, Tab thấy focus ring brass, tag chọn nền brass), `/en/level/foo` → 404.
