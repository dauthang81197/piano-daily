---
title: 'Story 2.5 — Trang Composer và Genre'
type: 'feature'
created: '2026-10-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '364225f7f91eac0c3ebfee5d236612252d040720'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng chưa xem được mọi bài của một tác giả hay một thể loại: chưa có route `/[locale]/composer/[slug]` và `/[locale]/genre/[slug]`, tên Composer trên thẻ Sheet chưa bấm được, và API chưa có endpoint công khai trả thông tin Composer/Genre theo slug.

**Approach:** Thêm `GET /composers/:slug` và `GET /genres/:slug` (công khai), dựng hai trang SSR dùng lại lưới, sắp xếp và phân trang của trang Level (danh sách lấy từ `GET /sheets?composer=` / `?genre=` của Story 2.4), và biến tên Composer trên thẻ Sheet thành link.

## Boundaries & Constraints

**Always:**
- **API** (`catalog`, `@Public()`, thêm vào allowlist `public-routes.spec.ts`): `GET /composers/:slug` → `{ id, slug, name, bio, avatarUrl }`; `GET /genres/:slug` → `{ id, slug, name, icon }`. Slug không tồn tại → 404 `{error:{code,message}}`. Composer/Genre không có Sheet PUBLISHED vẫn trả 200 (trang hiện trạng thái rỗng). `avatarUrl` = `storage.publicUrl(avatar)` chỉ khi `avatar` là key public, ngược lại `null` (không bao giờ lộ key private). Schema `publicComposerSchema`, `publicGenreSchema` trong `packages/shared`.
- `publicSheetItemSchema.composer` thêm `slug` (thẻ cần link tới trang Composer); `PUBLIC_SELECT` chọn thêm `slug`.
- **Trang web** (SSR, `setRequestLocale`, `generateMetadata` với `localeAlternates`, không `noindex`): đọc `sort` (`newest|most_viewed`, mặc định `newest`) và `page` (sai/vượt giới hạn → `notFound()` như trang Level). Slug không tồn tại → `notFound()`. Hiển thị: H1 là tên, tổng số bài, rồi `SortLinks`, `SheetGrid`, `Pagination`; trang Composer thêm avatar (nếu có) và bio; trang Genre thêm icon. Không có bài: `headline-sm` + gợi ý xem theo Level (tái dùng chuỗi/khung của trang Level).
- **Cache:** detail fetch gắn tag `search` (id chưa biết trước khi fetch; `tagsForTaxonomy` đã phát `search` nên đổi tên/bio/slug làm mới được), sau đó danh sách gắn `list:composer:{id}` / `list:genre:{id}` bằng `cacheTags`; `force-cache`, `revalidate: 600` qua `publicFetch`.
- **Genre icon** dùng `lucide-react` cùng phiên bản với admin (`1.48.0`), map `GenreIcon` → component phía web, ưu tiên import theo tên (không import cả bộ icon); icon rỗng/lạ thì không hiện.
- **Thẻ Sheet:** tên Composer là `Link` tới `/composer/{slug}`; thẻ không được lồng `<a>` trong `<a>`: dùng mẫu "stretched link" (link tiêu đề phủ cả thẻ bằng `after:absolute after:inset-0`, link Composer `relative z-10`), giữ nguyên hành vi click cả thẻ mở chi tiết và focus ring brass.
- **i18n:** chuỗi mới trong `messages/{vi,en}.json`, giọng trang trọng, không emoji.
- **Test:** unit/integration API (200, 404, không lộ key private, allowlist), shared schema, component (`SheetCard` link Composer, không lồng anchor), test trang với mock (404 slug lạ, page sai, rỗng).

**Never:**
- Không làm trang chi tiết Sheet (2.6), breadcrumb/JSON-LD/sitemap (2.11), bộ lọc Level/Format trên hai trang này, tag Genre trên thẻ Sheet.
- Không dùng `$queryRawUnsafe`; không đổi hành vi `/admin/*`; không thêm dependency nào khác ngoài `lucide-react`.
- Không để Draft/Archived xuất hiện (danh sách đi qua `GET /sheets`, đã chỉ PUBLISHED).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Composer hợp lệ | `/en/composer/beethoven` | Tên, bio, avatar, lưới Sheet PUBLISHED của Composer đó, tag `list:composer:{id}` | N/A |
| Genre hợp lệ | `/en/genre/pop` | Tên, icon, lưới Sheet PUBLISHED thuộc Genre, tag `list:genre:{id}` | N/A |
| Slug lạ | `/en/composer/zzz`, `/en/genre/zzz` | Trang "Không tìm thấy" (404) | API 404 → `notFound()` |
| Không có bài | Composer/Genre chưa có Sheet PUBLISHED | 200, trạng thái rỗng + link Level | N/A |
| Page sai | `?page=0`, `abc`, vượt giới hạn | 404 | N/A |
| Sort sai | `?sort=x` | Về `newest` | N/A |
| Không có avatar/icon | `avatar`/`icon` null | Không hiện ảnh/icon, bố cục không vỡ | N/A |
| Avatar key private | `avatar` thuộc vùng private | `avatarUrl: null` | N/A |
| Click Composer | Thẻ Sheet | Chuyển tới `/composer/{slug}`; click phần còn lại mở chi tiết | N/A |
| Route public | quét controller | Hai endpoint mới nằm trong allowlist | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/catalog/{public-sheets.controller,public-sheets.service}.ts` -- thêm `GET composers/:slug`, `GET genres/:slug` (cùng controller `@Public()`); `PUBLIC_SELECT` thêm `composer.slug`. Tên route công khai không đụng `admin/composers`.
- `apps/api/src/modules/media/storage.service.ts` -- `publicUrl(key)` ném lỗi với key private; dùng try/zone check để trả `null`.
- `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- mẫu integration và allowlist.
- `packages/shared/src/sheet.ts` (+ spec) -- `publicSheetItemSchema` (thêm `composer.slug`), thêm `publicComposerSchema`, `publicGenreSchema`; `GENRE_ICONS`/`GenreIcon` ở `packages/shared/src/catalog.ts`.
- `apps/web/src/lib/{catalog,query}.ts` (+test) -- thêm `fetchComposer`, `fetchGenre`, `fetchComposerSheets`, `fetchGenreSheets`, `composerHref`, `genreHref` (theo mẫu `fetchLevelSheets`/`levelHref`).
- `apps/web/src/components/catalog/{sheet-card,sort-links,pagination,sheet-grid}.tsx` -- `SheetCard` đổi sang stretched link; `SortLinks`/`Pagination` đã nhận `hrefFor`, tái dùng nguyên. Namespace chuỗi `Level` đang dùng cho sort: tái dùng.
- `apps/web/src/app/[locale]/level/[level]/page.tsx` -- khung trang để nhân bản (hero, trạng thái rỗng, phân trang); thêm `composer/[slug]/{page,loading}.tsx`, `genre/[slug]/{page,loading}.tsx` và component icon Genre.
- `apps/web/src/messages/{vi,en}.json` -- thêm namespace `Composer`, `Genre`.
- `apps/admin/src/components/taxonomy/genre-icons.tsx` -- bản đồ icon admin để tham chiếu (không import chéo app).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/sheet.ts` (+spec) -- `composer.slug` trong thẻ, `publicComposerSchema`, `publicGenreSchema` -- hợp đồng
- [x] `apps/api/src/modules/catalog/public-sheets.{service,controller}.ts` -- hai endpoint theo slug, `avatarUrl` an toàn, `composer.slug` -- FR3
- [x] `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- phủ Matrix API, allowlist, cập nhật fixture thẻ -- AC
- [x] `apps/web/src/lib/{catalog,query}.ts` (+test) -- fetch và href cho Composer/Genre -- logic
- [x] `apps/web/src/components/catalog/sheet-card.tsx` (+test trong `catalog.test.tsx`) -- link Composer, không lồng anchor -- AC link
- [x] `apps/web/package.json` + `apps/web/src/components/catalog/genre-icon.tsx` -- thêm `lucide-react`, map icon -- UX
- [x] `apps/web/src/app/[locale]/{composer,genre}/[slug]/{page,loading}.tsx` (+ `page.test.tsx`) + `messages/{vi,en}.json` -- hai trang SSR -- FR3
- [x] `README.md` -- ghi hai endpoint công khai mới -- tài liệu

**Acceptance Criteria:**
- Given stack chạy và đã `pnpm db:seed`, when mở `/en/composer/<slug có bài>` và `/en/genre/<slug có bài>`, then thấy tên, bio/avatar hoặc icon, lưới đúng Sheet PUBLISHED, sắp xếp và phân trang giữ URL; slug lạ hiện 404.
- Given thẻ Sheet ở trang Level/Search, when bấm tên Composer, then tới trang Composer; bấm phần còn lại mở trang chi tiết; HTML không có `<a>` lồng nhau.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `zoneOf` ném khi `avatar` sai dạng → `GET /composers/:slug` 500 | medium | patch | Đã xảy ra nếu DB có key không có tiền tố; đổi sang `startsWith('public/')` + test integration |
| Slug > 200 ký tự: API 400 → web 500 thay vì 404 | medium | patch | `getJsonOrNull` chỉ map 404; nay 400 cũng thành `null`; thêm test web và API |
| `GenreIcon` với key kế thừa (`constructor`) | low | patch | Một dòng `Object.hasOwn`; thêm test |
| `hrefFor` của SortLinks/Pagination không được kiểm chứng (mock bỏ qua) | medium | patch | Mock nay gọi `hrefFor`, test khẳng định slug + sort + reset về trang 1 |
| Viền focus thẻ Sheet (`focus-within` hiện cả khi click, hai viền) | low | patch | Đổi sang `has-[h3_a:focus-visible]` |
| Cắt `bio` 160 ký tự có thể chẻ surrogate | low | patch | `Array.from(...).slice(0,160)` |
| Vi dùng "tác giả" thay "Composer" | low | patch | Đổi `emptyTitle` thành "Composer này" |
| Race: Composer đổi tên giữa hai fetch gây 500 | false | - | `GET /sheets?composer=<slug lạ>` trả 200 rỗng, không ném |
| `fetchComposer` gọi hai lần (metadata + page) | false | - | Next dedupe `fetch` cùng URL trong một request |
| Tag `search` có được phát khi CRUD Composer/Genre? | false | - | `tagsForTaxonomy` và `tagsFor` đều có `cacheTags.search` (cache-invalidator.ts) |
| Trang rỗng nên `noindex`; thiếu sitemap/JSON-LD/OG | low | - | Spec chốt không `noindex`; sitemap, JSON-LD, metadata đầy đủ thuộc Story 2.11 |
| Copy-paste hai trang; avatar thiếu width/height; schema icon `string`; slug schema không kiểm dạng; thiếu test khớp key i18n | low | - | Developer-only/cosmetic, sửa cần thêm trừu tượng hay hợp đồng; không có hại cụ thể |
| Trang Genre mồ côi (chưa có link tới) | medium | defer | Chi tiết Sheet (2.6) là nơi gắn tag Genre; ghi vào deferred-work |
| Stretched link chỉ kiểm bằng class | medium | defer | jsdom không layout; cần kiểm tay/e2e; ghi vào deferred-work |

## Design Notes

- **Tag `search` cho detail:** web không biết `id` trước khi gọi API theo slug nên không thể gắn `list:composer:{id}` cho chính request đó; `search` được mọi thao tác Sheet và CRUD Composer/Genre phát (`CacheInvalidator`), đủ để đổi tên/bio/slug có hiệu lực ngay. Danh sách gắn tag theo `id` đúng AC.
- **Stretched link:** cách chuẩn để vừa click cả thẻ vừa có link con mà không lồng `<a>`; link con cần `z-10` để nằm trên lớp phủ.
- **`composer.slug` trong thẻ:** là thay đổi hợp đồng nhỏ, tương thích ngược (thêm trường); mọi fixture thẻ trong test cần cập nhật.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `pnpm db:seed && curl -s localhost:4000/composers/<slug> && curl -s localhost:4000/genres/<slug> && curl -s -o /dev/null -w '%{http_code}' localhost:4000/composers/zzz` -- expected: JSON đúng schema; `404`

**Manual checks:**
- Trình duyệt: `/vi/composer/<slug>`, `/vi/genre/<slug>`, sắp xếp, phân trang, slug lạ, trang không có bài; bấm tên Composer trên thẻ; kiểm tra bàn phím (Tab tới link Composer rồi link tiêu đề), lưới 3/2/1 cột.
