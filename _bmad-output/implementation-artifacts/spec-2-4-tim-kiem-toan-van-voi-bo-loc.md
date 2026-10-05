---
title: 'Story 2.4 — Tìm kiếm toàn văn với bộ lọc'
type: 'feature'
created: '2026-10-02'
status: 'in-progress'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '5bd79b28df4c727250dc3822c74380ba67af7fcc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng chưa tìm được bài theo tên, Composer, lời bài hát hay ID; ô tìm kiếm trên header đang trỏ tới `/[locale]/search` chưa tồn tại và `GET /sheets` bắt buộc có `level`.

**Approach:** Thêm full-text search Postgres (`tsvector` generated + `unaccent` + config `simple` + GIN) cho tiêu đề, lyrics và tên Composer, mở rộng `GET /sheets` (`q`, `composer`, `format`, `level` tuỳ chọn, sắp xếp theo độ liên quan) và dựng trang SSR `/[locale]/search` dùng lại lưới, tag Genre và phân trang của trang Level.

## Boundaries & Constraints

**Always:**
- **Migration SQL tay** (`apps/api/prisma/migrations/<ts>_catalog_search/`): `CREATE EXTENSION IF NOT EXISTS unaccent`; hàm `piano_unaccent(text) RETURNS text` `IMMUTABLE PARALLEL SAFE` bọc `public.unaccent('public.unaccent', $1)` (bắt buộc để dùng trong cột generated); `sheets.search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple', piano_unaccent(title || ' ' || coalesce(lyrics_chords,'')))) STORED` và `composers.search_vector` tương tự trên `name`, mỗi cột có GIN index. Cột generated không thể tham chiếu bảng khác nên **tên Composer nằm ở `composers.search_vector`** và truy vấn nối `sheets` với `composers` rồi `OR` hai vector. Khai báo cột trong `schema.prisma` bằng `Unsupported("tsvector")?` (+ `@@index(..., type: Gin)`) để `migrate dev` không báo lệch; Prisma Client không được ghi cột này.
- **SQL thô chỉ nằm trong repository của `catalog`** (`sheet-search.repository.ts`, `Prisma.sql` có tham số hoá; không nối chuỗi từ input). Nhánh có `q`: repository trả `{ids theo thứ tự, total}` (điều kiện, xếp hạng và phân trang chạy trong SQL), `PublicSheetsService` rồi hydrate bằng Prisma theo thứ tự đó. Nhánh không `q` giữ nguyên đường Prisma của Story 2.2.
- **Chuẩn hoá từ khoá** (hàm thuần `buildSearchQuery(q)` trong `catalog`, có unit test): chuẩn hoá NFC + lowercase, tách theo ký tự không phải chữ/số Unicode (`/[^\p{L}\p{N}]+/u`), tối đa 8 từ, mỗi từ ≤ 50 ký tự; ghép `từ:* & từ:*` (khớp tiền tố, AND), rồi `to_tsquery('simple', piano_unaccent($1))`. Không còn từ nào thì coi như không có `q`. Mọi ký tự toán tử tsquery (`& | ! ( ) : * ' \`) bị loại ở bước tách nên không thể chèn cú pháp.
- **Khớp ID:** `q` sau trim là toàn số, 1–9 chữ số thì **thêm** điều kiện `public_id = số` (OR với khớp văn bản).
- **API:** `publicSheetListQuerySchema` (shared): `level` thành tuỳ chọn; thêm `q` (trim, tối đa 100 ký tự), `composer` (slug), `format` ∈ `sheet|chords|midi|mp3|video` (cột `has_*` tương ứng) và `sort` thêm `relevance` (chỉ có nghĩa khi có `q`; không `q` thì coi như `newest`; mặc định là `relevance` khi có `q`, ngược lại `newest`). Mọi bộ lọc (`level`, `genre`, `composer`, `format`, `q`) kết hợp AND và luôn kèm `status = PUBLISHED`. Xếp hạng `ts_rank_cd` giảm dần rồi `firstPublishedAt desc, id desc`. Hành vi các tham số cũ giữ nguyên (`genre` lạ → trang rỗng).
- **`GET /sheets/facets`** (`@Public()`, thêm vào allowlist `public-routes.spec.ts`): `{ genres: [{id,slug,name,count}], composers: [{id,slug,name,count}] }` chỉ đếm Sheet PUBLISHED, bỏ mục `count = 0`, sắp `count desc, name asc`. Schema `facetsSchema` trong shared.
- **Trang web `/[locale]/search`** (SSR, `setRequestLocale`, `generateMetadata` dùng `localeAlternates`, `robots: { index: false, follow: true }` khi có bất kỳ tham số lọc nào): đọc `q`, `level` (slug chữ thường), `genre`, `composer`, `format`, `sort`, `page`. `page` sai/vượt giới hạn → `notFound()` như trang Level; `level/format/sort` sai giá trị bị bỏ, `genre/composer` lạ (không có trong facets) bị bỏ lọc.
  - Gồm: tiêu đề, tổng số kết quả, form GET (ô `q` lớn, chọn Level, chọn Composer, chọn định dạng, nút Tìm; giữ `genre` bằng input ẩn), tag cloud Genre (`tag-genre`) là `Link` giữ các tham số khác và bỏ `page`, bộ chọn sắp xếp (Liên quan chỉ hiện khi có `q`, Mới nhất, Xem nhiều), lưới `SheetGrid` và `Pagination` dùng lại; `loading.tsx` skeleton như trang Level.
  - Fetch bằng `publicFetch` với tag `search` (`force-cache`, `revalidate: 600`); danh sách và facets gọi song song.
  - **Không có kết quả:** `headline-sm` "Không tìm thấy bài nào khớp." kèm gợi ý bỏ bớt bộ lọc (link xoá từng bộ lọc đang bật) và link xem theo 4 Level (UX-DR15). Không có `q` và không có bộ lọc thì liệt kê toàn bộ Sheet PUBLISHED.
- **i18n:** chữ giao diện mới nằm trong `messages/{vi,en}.json`; giọng trang trọng, không emoji. Form tìm kiếm ở header và hero Level giữ nguyên (đã GET tới `/search?q=`).
- **Test:** unit (`buildSearchQuery`, schema shared, `parse*` của web, component), integration API (Postgres thật, migration chạy qua `migrate deploy`), test trang `SearchPage` với mock (404, bỏ lọc lạ, trạng thái rỗng).

**Never:**
- Không để Draft/Archived xuất hiện ở bất kỳ nhánh nào (kể cả khớp theo `public_id`).
- Không nối input vào SQL; không `$queryRawUnsafe`.
- Không làm trang Composer/Genre/Sheet, gợi ý tự hoàn tất (autocomplete), sửa lỗi chính tả hay highlight; không thêm dependency mới.
- Không đổi hành vi `/admin/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Khớp tiêu đề | `q=elise` | Sheet có "Für Elise" | N/A |
| Không dấu | `q=fur` hoặc `q=dem thu` | Khớp "Für Elise", "Đêm thu mẫu" | N/A |
| Khớp Composer | `q=beethoven` | Sheet của Composer đó | N/A |
| Khớp lyrics | từ có trong `lyrics_chords` | Sheet đó | N/A |
| Tiền tố | `q=moon` | Khớp "Moonlight" | N/A |
| Nhiều từ | `q=fur elise` | AND: chỉ Sheet có cả hai | N/A |
| Khớp ID | `q=12` (toàn số) | Sheet `public_id = 12` cùng các Sheet khớp văn bản | N/A |
| Bộ lọc AND | `q=...&level=&genre=&composer=&format=` | Giao của tất cả điều kiện | N/A |
| Độ liên quan | có `q`, `sort` mặc định | Khớp tốt hơn đứng trước; hoà thì mới nhất trước | N/A |
| Draft/Archived | khớp từ khoá/ID | Không bao giờ xuất hiện (`items`, `total`) | N/A |
| Ký tự đặc biệt | `q=& \| ! ( ) :* '; drop table sheets --` | 200, không lỗi SQL/tsquery, bảng nguyên vẹn | N/A |
| `q` trống/chỉ ký tự đặc biệt | `q=%20` / `q=!!!` | Như không có `q` | N/A |
| `q` quá dài | 101 ký tự | 400 `VALIDATION_FAILED` | N/A |
| Không `level` | `GET /sheets` | 200, mọi Sheet PUBLISHED (thay hành vi 400 của Story 2.2) | N/A |
| Format sai | `format=pdf` | 400 `VALIDATION_FAILED` | N/A |
| Facets | `GET /sheets/facets` | Genre/Composer kèm `count`, chỉ PUBLISHED | N/A |
| Route public | quét controller | `GET /sheets/facets` nằm trong allowlist | N/A |
| Không kết quả (web) | không khớp | "Không tìm thấy bài nào khớp." + gợi ý + link 4 Level | N/A |
| Tham số lạ (web) | `level=foo`, `genre=zzz`, `sort=x` | Bỏ giá trị sai; không lỗi | N/A |
| Page sai (web) | `?page=0` / `abc` / vượt giới hạn | Trang "Không tìm thấy" + `noindex` | N/A |
| Tag Genre (web) | bấm tag | Link giữ `q`, `level`, `composer`, `format`, `sort`; bỏ `page`; tag chọn nền brass; bấm lại bỏ lọc | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/catalog/{public-sheets.service,public-sheets.controller,catalog.module}.ts` -- `list`, `publishedWhere`, `PUBLIC_SELECT`, `ORDER_BY`; thêm `sheet-search.repository.ts` (SQL thô), `search-query.ts` (`buildSearchQuery`) và route `facets`.
- `apps/api/prisma/schema.prisma` + `prisma/migrations/*` -- thêm cột `Unsupported("tsvector")` và migration tay; tham khảo cách viết SQL tay ở `20260929121500_sheet_files_midi_mp3`.
- `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- mẫu integration; spec 2.2 có ca "`/sheets` thiếu level → 400" cần đổi theo Matrix.
- `packages/shared/src/sheet.ts` (+ spec) -- `publicSheetListQuerySchema`, `PUBLIC_SHEET_SORTS`; thêm `facetsSchema`, `PUBLIC_FORMATS`.
- `apps/web/src/lib/{query,catalog,api}.ts`, `src/components/catalog/*` (`SheetGrid`, `GenreTags`, `SortLinks`, `Pagination`, `SheetCardSkeleton`), `src/components/layout/search-form.tsx`, `src/app/[locale]/level/[level]/{page,loading}.tsx`, `src/messages/{vi,en}.json` -- khung Story 2.2 để tái dùng; `GenreTags`/`SortLinks`/`levelHref` gắn với Level nên cần khái quát hoá (nhận hàm tạo href) thay vì sao chép.
- `docker-compose.yml` -- Postgres 18.6 (image chính thức có contrib `unaccent`).

## Tasks & Acceptance

**Execution:**
- [ ] `apps/api/prisma/{schema.prisma,migrations/<ts>_catalog_search}` -- extension, `piano_unaccent`, cột generated + GIN -- FR2
- [ ] `packages/shared/src/sheet.ts` (+spec) -- mở rộng query, `facetsSchema`, hằng định dạng -- hợp đồng
- [ ] `apps/api/src/modules/catalog/{search-query,sheet-search.repository,public-sheets.service,public-sheets.controller}.ts` (+ unit test `buildSearchQuery`) -- tìm kiếm, bộ lọc, facets -- FR2
- [ ] `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- phủ matrix API, đổi ca 400 cũ, allowlist -- AC
- [ ] `apps/web/src/lib/{query,catalog}.ts` (+test) -- parse tham số, `fetchSearch`, `fetchFacets`, `searchHref` -- logic
- [ ] `apps/web/src/components/catalog/*` -- khái quát hoá `GenreTags`/`SortLinks`, thêm `SearchFilters` (+test); trang Level giữ nguyên hành vi -- UX
- [ ] `apps/web/src/app/[locale]/search/{page,loading}.tsx` (+ `page.test.tsx`) + `messages/{vi,en}.json` -- trang Search -- FR2, UX-DR15
- [ ] `README.md` -- ghi `GET /sheets` mở rộng, `GET /sheets/facets`, yêu cầu extension `unaccent` -- tài liệu

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build --wait` và đã `pnpm db:seed`, when mở `/en/search?q=dem+thu` và `/en/search?q=beethoven`, then thấy kết quả khớp có dấu/không dấu, lọc thêm Level/Genre/Composer/định dạng được, URL giữ tham số; từ khoá vô nghĩa hiện "Không tìm thấy bài nào khớp.".
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (nếu `pdf-processor` timeout do tải, chạy `pnpm exec turbo run test --concurrency=1`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

- **Hai vector nối bằng JOIN, không phải một cột:** Postgres không cho cột generated tham chiếu bảng khác. Kết quả với người dùng giống hệt "khớp tiêu đề, Composer hoặc lyrics"; đổi tên Composer tự cập nhật vector (generated) nên không cần trigger.
- **Tiền tố `:*` + AND:** người dùng gõ dở từ vẫn thấy kết quả; không dùng `websearch_to_tsquery` vì cú pháp người dùng (dấu `-`, `"`) không cần thiết và khó kiểm soát.
- **`piano_unaccent` IMMUTABLE:** `unaccent()` mặc định chỉ STABLE nên không dùng được trong cột generated/index; bọc với dictionary cố định là kỹ thuật chuẩn và an toàn khi không đổi từ điển.
- **Phân trang trong SQL, hydrate bằng Prisma:** giữ thứ tự xếp hạng mà không kéo cả tập kết quả về ứng dụng; tái dùng `PUBLIC_SELECT` (thumbnail URL, cờ định dạng) của Story 2.2.
- **`noindex` cho trang kết quả tìm kiếm:** tránh index vô hạn các biến thể truy vấn; metadata SEO đầy đủ thuộc Story 2.11.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `pnpm db:seed && curl -s 'localhost:4000/sheets?q=dem%20thu' | head -c 500 && curl -s localhost:4000/sheets/facets | head -c 400` -- expected: Sheet khớp không dấu; facets có `count`

**Manual checks:**
- Trình duyệt: `/vi/search?q=dem+thu`, gõ dở từ (`q=moo`), lọc theo Genre/Level/Composer/định dạng, trang rỗng, đổi ngôn ngữ giữ query, thu nhỏ để kiểm tra form và lưới 3/2/1 cột.
