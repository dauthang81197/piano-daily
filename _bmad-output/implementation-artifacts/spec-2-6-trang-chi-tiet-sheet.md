---
title: 'Story 2.6 — Trang chi tiết Sheet'
type: 'feature'
created: '2026-10-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'bea99546dc84bde8ad1cc4ce7ee6927c8b6014cb'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng bấm vào thẻ Sheet nhưng `/[locale]/sheet/[slug]` chưa tồn tại và API chưa có endpoint chi tiết công khai, nên chưa xem được thông tin đầy đủ, ảnh từng trang, video và lyrics của một bản nhạc.

**Approach:** Thêm `GET /sheets/:slug` (chỉ Sheet PUBLISHED) trả dữ liệu chi tiết kèm Sheet cùng Series và Sheet liên quan, và dựng trang SSR `/[locale]/sheet/[slug]` theo bố cục UX-DR22 (breadcrumb → H1 → meta → vị trí player → ảnh trang → video → Lyrics & Chords, sidebar bài liên quan) dưới dạng một component dùng chung để Story 2.10 tái dùng.

## Boundaries & Constraints

**Always:**
- **API** (`catalog`, `@Public()`, đăng ký SAU `GET /sheets/facets`; thêm `GET /sheets/:slug` vào allowlist `public-routes.spec.ts`): `publicSheetDetailSchema` trong `packages/shared` gồm `id, publicId, slug, title, subtitle, level, difficultyScore, difficultyNote, description, composer {id,name,slug}, series {id,name} | null, genres [{id,slug,name}], pageCount, viewCount, isHot, updatedAt, pages [{pageNumber,url}], midi {noteJsonUrl,durationSeconds,noteCount} | null, youtubeUrl | null, lyricsChords | null, seriesSheets: PublicSheetItem[], related: PublicSheetItem[]`. Sheet không tồn tại **hoặc không PUBLISHED** → 404 giống hệt nhau (không lộ trạng thái). Không bao giờ trả `storageKey`, URL private, `pdf`/`mp3` hay file `.mid` gốc; chỉ URL public của PAGE_IMAGE và MIDI_JSON hiện hành (`supersededAt = null`), `pages` theo `pageNumber` tăng dần.
- `seriesSheets`: Sheet PUBLISHED cùng Series, trừ chính nó, mới nhất trước, tối đa 12. `related`: Sheet PUBLISHED khác chính nó có cùng Series, Composer hoặc Level; xếp theo số tiêu chí khớp (Series 3, Composer 2, Level 1) giảm dần rồi `viewCount desc, id desc`; trừ các Sheet đã nằm ở `seriesSheets`; tối đa 6. Dùng lại `PUBLIC_SELECT`/`toItem` của thẻ Sheet.
- **Trang web** (SSR, `setRequestLocale`, `generateMetadata` với `localeAlternates`, không `noindex`): slug không tồn tại hoặc API trả 400/404 → `notFound()`. Bố cục: breadcrumb (Trang chủ › Level › tên bài, mỗi mục là link trừ mục cuối) → H1 `"{Title} PDF, MIDI, MP4 & Tutorial"` → meta (badge Level, badge HOT nếu có, Composer là link `/composer/{slug}`, Series nếu có, tag Genre là link `/genre/{slug}`, lượt xem, số trang, ngày cập nhật, điểm độ khó dạng `15/100` kèm `difficultyNote` nếu có) → vị trí player → ảnh từng trang → video → Lyrics & Chords (chỉ khi có). Sidebar: "Cùng Series" (nếu có) và "Bài liên quan". `≥ lg` hai cột (nội dung + sidebar), `md` sidebar xuống dưới, `< md` một cột.
- **Vị trí player:** component `PlayerSlot` rỗng (trả `null`), có chú thích để Story 2.8 gắn player; không hiện khối giả. **Nút Download không hiển thị** ở bất kỳ nơi nào trong epic này.
- **Ảnh trang:** `<img>` alt `"{tên bài} – trang {N}"` (vi: `"… – trang N"`, en: `"… – page N"`), `loading="lazy"` trừ trang 1 (`eager`), `h-auto w-full`; không có ảnh thì không hiện khối.
- **Video:** chỉ khi `youtubeUrl` parse được bằng `parseYoutubeUrl`; nhúng `<iframe>` `youtubeEmbedUrl(id)` (nocookie), `loading="lazy"`, `title`, `allowFullScreen`, **không autoplay**, kèm ghi chú nguồn bên thứ ba. Không hợp lệ hoặc vắng → không có khối.
- **Lyrics & Chords:** render Markdown bằng `react-markdown` + `remark-gfm` cùng phiên bản với admin (`10.1.0`), **không** bật HTML thô (mặc định an toàn); link ngoài `rel="noopener noreferrer nofollow"`.
- **Cache:** fetch theo slug gắn tag `search` (id chưa biết trước khi gọi; mọi thao tác Sheet và CRUD Composer/Genre/Series phát tag này), `force-cache`, `revalidate: 600` qua `publicFetch`.
- **Tái dùng cho 2.10:** toàn bộ phần thân trang nằm trong component `SheetDetail` nhận dữ liệu đã parse (không tự gọi API); `page.tsx` chỉ fetch, 404, metadata và truyền xuống.
- **i18n:** chuỗi mới trong `messages/{vi,en}.json`, giọng trang trọng, không emoji; focus ring brass 2px trên mọi link.
- **Test:** unit/integration API (200, 404 Draft/Archived/lạ giống nhau, không lộ key private, thứ tự `pages`, `seriesSheets`/`related`, allowlist), shared schema, component `SheetDetail` (bố cục, ẩn khối khi thiếu dữ liệu, không Download, link Composer/Genre, YouTube không autoplay), test trang với mock (404, metadata).

**Never:**
- Không làm player MIDI/MP3, phím đàn ảo (2.8), mini-preview (2.9), đếm lượt xem/beacon (2.7), preview Draft (2.10), JSON-LD/sitemap/Open Graph (2.11), nút Download hay file gốc.
- Không `$queryRawUnsafe`; không đổi hành vi `/admin/*`; không thêm dependency nào ngoài `react-markdown` và `remark-gfm`.
- Không để Draft/Archived xuất hiện trong chi tiết, `seriesSheets` hay `related`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sheet đầy đủ | `/en/sheet/fur-elise` (có ảnh, YouTube, lyrics, Series) | Đủ các khối theo thứ tự, sidebar có Series và liên quan | N/A |
| Slug lạ | slug không có trong DB | 404 | API 404 → `notFound()` |
| Draft/Archived | Sheet không PUBLISHED | 404 giống slug lạ, không lộ trạng thái | N/A |
| Slug quá dài | > 200 ký tự | 404 | API 400 → `notFound()` |
| Không YouTube | `youtubeUrl` null hoặc không parse được | Không có khối video | N/A |
| Không lyrics | `lyricsChords` null/rỗng | Không có khối Lyrics & Chords | N/A |
| Không ảnh trang | `pages` rỗng | Không có khối ảnh, trang vẫn render | N/A |
| Không Series/liên quan | Series null, không Sheet khớp | Sidebar ẩn mục tương ứng | N/A |
| Độ khó | `difficultyScore` 15 + note | `15/100 — {note}`; null thì ẩn | N/A |
| Ảnh superseded | PAGE_IMAGE/MIDI_JSON cũ | Không xuất hiện | N/A |
| Liên quan | cùng Series/Composer/Level | Tối đa 6, ưu tiên Series > Composer > Level, không trùng `seriesSheets`, không gồm chính nó | N/A |
| Markdown | lyrics có `<script>` hoặc HTML | Hiển thị như văn bản, không chạy | N/A |
| Download | mọi Sheet | Không có nút/link tải | N/A |
| Route public | quét controller | `GET /sheets/:slug` nằm trong allowlist, `facets` vẫn khớp trước | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/catalog/{public-sheets.controller,public-sheets.service}.ts` -- thêm `GET sheets/:slug` sau `sheets/facets`; tái dùng `PUBLIC_SELECT`, `toItem`, `publishedWhere`; mẫu NotFound ở `composerBySlug`.
- `apps/api/src/modules/catalog/sheets.service.ts` (`toSheet`, ~dòng 120-160) -- mẫu dựng `pages` và `noteJsonUrl` từ file hiện hành; **không** import (admin), chỉ làm theo.
- `packages/shared/src/sheet.ts` (+ spec) -- `publicSheetItemSchema`, `slugParamSchema` (đã có), `parseYoutubeUrl`, `youtubeEmbedUrl`; thêm `publicSheetDetailSchema`.
- `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- mẫu `addSheet`; thêm file ảnh trang và MIDI_JSON.
- `apps/web/src/lib/{catalog,query}.ts` (+test) -- thêm `fetchSheetDetail` (theo `getJsonOrNull`), `sheetHref`.
- `apps/web/src/components/catalog/{sheet-card,genre-tags}.tsx` -- khung/phong cách tag, link Composer; `apps/web/src/app/[locale]/composer/[slug]/page.tsx` -- mẫu trang SSR.
- `apps/web/src/components/sheet/` (mới) -- `sheet-detail.tsx`, `player-slot.tsx`, `lyrics.tsx`, `youtube-embed.tsx`, `breadcrumb.tsx`; `apps/web/src/app/[locale]/sheet/[slug]/{page,loading}.tsx`.
- `apps/web/src/messages/{vi,en}.json`, `apps/web/package.json` -- namespace `Sheet`; thêm `react-markdown`, `remark-gfm`; `apps/admin/src/components/sheets/markdown-editor.tsx` làm tham chiếu cấu hình an toàn.
- `apps/web/next.config.ts` -- CSP đã cho `frame-src` youtube-nocookie và `img-src` media; không đổi.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/sheet.ts` (+spec) -- `publicSheetDetailSchema` -- hợp đồng
- [x] `apps/api/src/modules/catalog/public-sheets.{service,controller}.ts` -- `GET /sheets/:slug`, `seriesSheets`, `related` -- FR4
- [x] `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- phủ Matrix API, allowlist -- AC
- [x] `apps/web/src/lib/{catalog,query}.ts` (+test) -- fetch chi tiết, `sheetHref` -- logic
- [x] `apps/web/package.json` + `apps/web/src/components/sheet/*` (+test) -- `SheetDetail`, `PlayerSlot`, `Lyrics`, `YoutubeEmbed`, `Breadcrumb` -- FR4, FR6, UX-DR16/17/22
- [x] `apps/web/src/app/[locale]/sheet/[slug]/{page,loading}.tsx` (+ `page.test.tsx`) + `messages/{vi,en}.json` -- trang SSR -- FR4
- [x] `README.md` -- ghi `GET /sheets/:slug` -- tài liệu

**Acceptance Criteria:**
- Given stack chạy và đã `pnpm db:seed`, when mở `/en/sheet/<slug đã publish>`, then thấy breadcrumb, H1, meta, ảnh từng trang, video (nếu có), lyrics (nếu có), sidebar bài liên quan; thu nhỏ màn hình thì sidebar xuống dưới; không có nút Download; Draft/Archived/slug lạ hiện 404.
- Given một Sheet có `youtubeUrl`, when trang render, then video nhúng lazy, không tự phát, có ghi chú bên thứ ba; Sheet không có `youtubeUrl` thì không có khối video.
- Given người dùng chưa đăng nhập, when xem ảnh, video và lyrics, then mọi nội dung đều truy cập được.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (cổng test Postgres đặt theo `.env`; build không đặt `NODE_ENV=development`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `related` lấy 60 ứng viên theo lượt xem rồi mới chấm điểm, Sheet điểm cao ít xem bị loại; không test | high | patch | Đúng: 8 Sheet chỉ trùng Level nhiều lượt xem đẩy Sheet trùng Composer ra. Viết lại duyệt theo bậc điểm (tổ hợp tiêu chí khớp chính xác), thêm 2 test |
| Markdown `![](https://…)` tải ảnh ngoài (theo dõi/hotlink) | medium | patch | `Lyrics` chỉ ghi đè `a`; nay `img` chỉ giữ chữ thay thế, thêm test |
| `<aside>` rỗng khi không có Series và liên quan | low | patch | Ẩn aside khi cả hai rỗng, thêm assert |
| `whitespace-pre-wrap` làm dư dòng trống giữa các khối Markdown | low | patch | Chỉ áp `whitespace-pre-line` cho `<p>` (giữ xuống dòng của lyrics) |
| `vi.sidebarLabel` "Bài viết liên quan" lệch "Bài liên quan" | low | patch | Đổi chuỗi |
| Sheet Series thứ 13 trở đi lọt vào `related` | low | - | Hành vi hợp lệ: spec chỉ loại các Sheet đã hiện ở `seriesSheets` |
| Hai PAGE_IMAGE cùng `pageNumber`; MIDI null duration/noteCount về 0 | low | - | `toSheet` của admin làm y hệt; dữ liệu do upload pipeline sinh, không có tình huống chứng minh được |
| `pageCount` > 0 mà `pages` rỗng; `updatedAt` không parse được; thiếu `error.tsx`; href Markdown rỗng/tương đối | low | - | Cần dữ liệu sai hợp đồng; các trang khác cũng để lỗi 5xx tới error boundary chung |
| Cache chỉ tag `search`, Sheet vừa gỡ publish có thể còn hiển thị | false | - | `CacheInvalidator.tagsFor` phát `search` khi trạng thái trước hoặc sau là PUBLISHED, gồm cả gỡ publish |
| Ba truy vấn tuần tự; ảnh trang thiếu width/height; thiếu `sandbox`/`allow` trên iframe | low | - | Tối ưu/hardening ngoài spec; không có hại cụ thể (CSP `frame-src` đã giới hạn nguồn) |
| Thiếu Open Graph, JSON-LD, `noindex` cho 404 | low | - | Thuộc Story 2.11 |
| H1 luôn "PDF, MIDI, MP4 & Tutorial" dù thiếu tài sản | false | - | H1 do UX-DR22/AC quy định |
| `PlayerSlot` và test chỉ kiểm `null` | low | - | Cố ý: giữ vị trí cho Story 2.8 |

## Design Notes

- **Tag `search` cho chi tiết:** như 2.5, web chưa biết `id` trước khi gọi theo slug nên không gắn được `sheet:{id}`; `search` được mọi thao tác Sheet phát, đủ để chỉnh sửa có hiệu lực ngay.
- **`PlayerSlot` rỗng:** tránh khối giả; Story 2.8 thay thân component, bố cục và thứ tự không đổi.
- **`related` xếp hạng bằng điểm khớp:** một truy vấn lấy ứng viên rồi chấm điểm phía ứng dụng, đủ cho vài chục ứng viên và tránh SQL thô.
- **Markdown không HTML thô:** `react-markdown` mặc định bỏ HTML, nên lyrics do admin soạn không thể chèn script.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `pnpm db:seed && curl -s localhost:4000/sheets/<slug> | head -c 600 && curl -s -o /dev/null -w '%{http_code}' localhost:4000/sheets/khong-co` -- expected: JSON đúng schema; `404`

**Manual checks:**
- Trình duyệt: `/vi/sheet/<slug>` và `/en/sheet/<slug>`: thứ tự các khối, breadcrumb, link Composer/Genre, video lazy không tự phát, lyrics Markdown, sidebar ở `lg`/`md`/`sm`, Tab qua các link thấy viền brass, không có Download.
