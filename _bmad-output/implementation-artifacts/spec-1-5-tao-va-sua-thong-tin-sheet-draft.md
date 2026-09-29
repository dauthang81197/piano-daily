---
title: 'Story 1.5 — Tạo và sửa thông tin Sheet (Draft)'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2c28fce4f3d05f932524c693b19d49f85ca4e49f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Thư viện chưa có thực thể Sheet. Founder cần soạn dần thông tin một bài (tiêu đề, tác giả, cấp độ, mô tả, lyrics & chords, video) ở trạng thái Draft, trước khi upload file (Story 1.6–1.7) và publish (Story 1.8).

**Approach:**
- **Bảng mới:** `Sheet` và `SheetGenre`, do module `catalog` sở hữu.
- **API:** `/admin/sheets` gồm list (tìm theo tiêu đề, lọc Level/Status/Composer), get, create (luôn là DRAFT), update. `recomputeDerived()` là nơi duy nhất ghi `has_*`.
- **Admin:**
  - trang danh sách `/sheets`;
  - trang tạo `/sheets/new` và trang sửa `/sheets/[id]`;
  - form có editor markdown (tab Soạn / Xem trước) và preview YouTube ngay trong form.

## Boundaries & Constraints

**Always:**
- **Bảng `Sheet`:**
  - Cột:
    - `id` uuidv7, `public_id` Int tự tăng (unique), `slug` unique.
    - `title`, `subtitle?`, `composer_id` (FK RESTRICT), `series_id?` (FK RESTRICT).
    - `level` enum `BEGINNER|INTERMEDIATE|ADVANCED|EXPERT`, `difficulty_score?` (0–100), `difficulty_note?`.
    - `description?`, `lyrics_chords?` (markdown), `youtube_url?`.
    - `has_sheet`, `has_chords`, `has_midi`, `has_mp3`, `has_video` (mặc định false), `page_count` (mặc định 0), `view_count` (mặc định 0), `is_hot` (mặc định false).
    - `status` enum `DRAFT|PUBLISHED|ARCHIVED` (mặc định DRAFT), `first_published_at?`, timestamps.
  - **Không có** `download_count`. Mọi cột thời gian là timestamptz.
- **`SheetGenre(sheet_id, genre_id)`:** PK kép; FK tới sheet `ON DELETE CASCADE`, FK tới genre `ON DELETE RESTRICT`. Nhờ vậy xoá Genre đang được dùng trả 409 `RESOURCE_IN_USE` qua mapping P2003 đã có ở Story 1.4. Có index `genre_id`.
- **Enum dùng chung:** `Level` và `SheetStatus` nằm trong `packages/shared`, có test khẳng định trùng với enum Prisma (giống `Role`).
- **DTO create/update (zod, shared):** chỉ nhận `title`, `subtitle`, `composerId`, `seriesId`, `level`, `difficultyScore`, `difficultyNote`, `description`, `lyricsChords`, `youtubeUrl`, `genreIds`.
  - Key lạ, trong đó có `has*`, `pageCount`, `thumbnail`, `status`, `slug`, `viewCount`, `isHot`, bị **từ chối** 400 (schema strict).
  - Bắt buộc lúc tạo: `title` (1–200 ký tự), `composerId`, `level`.
- **`recomputeDerived(sheetId, tx)`:**
  - Là nơi duy nhất ghi `has_*` và `page_count`; chạy `SELECT … FOR UPDATE` trên sheet trong cùng transaction với mỗi lần create/update.
  - Ở story này nó đặt `has_chords` = lyrics không rỗng, `has_video` = có `youtube_url`. `has_sheet/midi/mp3`, `page_count` giữ nguyên, để Story 1.6–1.7 bổ sung.
- **YouTube:**
  - Chấp nhận `youtube.com/watch?v=ID`, `youtu.be/ID`, `youtube.com/embed/ID`, `youtube.com/shorts/ID` (http/https, có hoặc không `www.`/`m.`), với ID gồm 11 ký tự `[A-Za-z0-9_-]`.
  - Lưu dạng chuẩn `https://www.youtube.com/watch?v=ID`. Link không hợp lệ trả 400, lỗi gắn với trường `youtubeUrl`.
  - Preview trong admin dùng iframe `youtube-nocookie.com/embed/ID`.
- **Series:** nếu có `seriesId` thì Series phải thuộc đúng `composerId` của Sheet. Sai thì 400, lỗi gắn với trường `seriesId`. `composerId`, `seriesId` hay `genreIds` không tồn tại thì 400, lỗi gắn với trường tương ứng.
- **Slug:**
  - Sinh từ `title` bằng `slugify` và `uniqueSlug` của Story 1.4 (fallback `sheet`).
  - Khi đổi `title` mà `first_published_at` còn null, slug được sinh lại. Sau lần publish đầu tiên, slug đóng băng (AD-16).
- **List:**
  - Response `{items, page, pageSize, total}`. Query gồm `q` (tìm theo tiêu đề không phân biệt hoa thường và dấu: ILIKE `title` hoặc `slug` chứa `slugify(q)`), `level?`, `status?`, `composerId?`, `page`, `pageSize` ≤ 100.
  - Sắp xếp theo `updated_at` giảm dần.
  - Mỗi item có `id`, `publicId`, `title`, `slug`, `level`, `status`, `composer {id,name}`, `isHot`, `updatedAt`.
- **Admin:** mọi lời gọi qua `apiFetch`; lỗi trường hiện bằng `FormError` ngay dưới trường; bảng dùng lại khung từ Story 1.4.

**Never:**
- Không làm upload file, publish/archive/xoá, bật/tắt HOT (Story 1.6–1.8).
- Không làm trang công khai, không revalidate cache (Epic 2).
- Không render HTML thô trong markdown preview (react-markdown mặc định không cho phép).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo đủ trường | title "Für Elise", composer, level, 2 genreIds, lyrics, youtube `youtu.be/ID` | 201; `status=DRAFT`, slug `fur-elise`, `publicId` tăng dần, `hasChords=true`, `hasVideo=true`, youtube lưu dạng chuẩn | N/A |
| Tạo tối thiểu | title + composerId + level | 201; `hasChords=false`, `hasVideo=false`, genres rỗng | N/A |
| Gửi trường dẫn xuất | body có `hasSheet:true` hoặc `pageCount:5` | 400 `VALIDATION_FAILED` | Không ghi gì |
| YouTube sai | `youtubeUrl:"https://vimeo.com/1"` | 400, details `youtubeUrl` | N/A |
| Series khác Composer | seriesId thuộc Composer khác | 400, details `seriesId` | N/A |
| Genre không tồn tại | `genreIds:[uuid lạ]` | 400, details `genreIds` | N/A |
| Đổi tiêu đề khi còn Draft | PATCH title mới | slug sinh lại theo tiêu đề mới | N/A |
| Xoá lyrics và youtube | PATCH `lyricsChords:null, youtubeUrl:null` | `hasChords=false`, `hasVideo=false` | N/A |
| Thay danh sách genre | PATCH `genreIds:[g3]` | genres chỉ còn g3 | N/A |
| Xoá Genre đang gắn Sheet | DELETE /admin/genres/:id | 409 `RESOURCE_IN_USE` | Không 500 |
| Xoá Composer có Sheet | DELETE /admin/composers/:id | 409 `RESOURCE_IN_USE` | Không 500 |
| List lọc + tìm | `q=elise&level=BEGINNER&status=DRAFT` | Chỉ các Sheet khớp mọi điều kiện | N/A |
| Id lạ | GET/PATCH `/admin/sheets/:id` với id lạ hoặc không phải UUID | 404 `NOT_FOUND` | N/A |

</frozen-after-approval>

## Code Map

- **`apps/api/src/modules/catalog/`** -- `catalog.helpers.ts` (`UuidParamPipe`, `notFound`, `inUse`, `nameSearch`, `pagination`), `unique-slug.ts` (`createWithUniqueSlug`, `baseSlug`), `prisma-errors.ts`. Mẫu service/controller có ở `series.service.ts`. `composers.service.ts#remove` chỉ đếm Series: phải đếm thêm Sheet, hoặc dựa vào P2003 đã được bắt.
- **`apps/api/prisma/schema.prisma`** -- model `Composer`/`Genre`/`Series` cần thêm quan hệ ngược tới `Sheet`/`SheetGenre`.
- **`packages/shared/src/catalog.ts`** -- `listQuerySchema`, `Page`, `nameSchema`, `GENRE_ICONS`. `slug.ts` chứa `slugify`. `auth.ts` chứa mẫu enum + schema.
- **`apps/api/test/unit/role-enum.spec.ts`** -- mẫu test enum shared = enum Prisma. `test/integration/catalog-taxonomy.spec.ts` -- mẫu integration test (login, TRUNCATE).
- **`apps/admin/src/components/taxonomy/`**:
  - `taxonomy-table.tsx`: bảng, tìm debounce, phân trang, lùi trang.
  - `server-error.ts` (`applyServerError`), `field.tsx`, `use-composer-options.ts` (100 mục đầu, có `ensure`), `genre-icons.tsx`.
  - `apps/admin/src/app/(admin)/sheets/page.tsx` là placeholder sẽ được thay.
- **`apps/admin/src/lib/api/catalog.ts`** -- mẫu API client có kiểu.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/sheet.ts` (+spec) -- enum `Level`, `SheetStatus`, `levelSchema`, `sheetStatusSchema`; `parseYoutubeUrl(url) → id | null` và `youtubeCanonicalUrl(id)`; `createSheetSchema` (strict), `updateSheetSchema` (strict, partial), `sheetListQuerySchema`, `sheetSchema` (response đầy đủ, có `genres [{id,name}]`, `series {id,name} | null`, `composer {id,name}`, các `has*`, `pageCount`, `viewCount`, `isHot`, `status`, `publicId`, `slug`, `createdAt`, `updatedAt`), `sheetListItemSchema` -- hợp đồng API.
- [x] `apps/api/prisma/schema.prisma` + migration `<ts>_catalog_sheet` -- enum `Level`, `SheetStatus`; bảng `sheets`, `sheet_genres` theo mục Boundaries; index `sheets(status)`, `sheets(composer_id)`, `sheets(level)`, `sheet_genres(genre_id)` -- AD-1, AD-16, AD-20.
- [x] `apps/api/src/modules/catalog/sheets.{controller,service}.ts` + `sheet-derived.ts` (`recomputeDerived`) -- CRUD `/admin/sheets` (không có DELETE) theo I/O matrix; mọi ghi chạy trong transaction; kiểm tra composer/series/genres tồn tại và Series khớp Composer -- nghiệp vụ.
- [x] `apps/api/src/modules/catalog/composers.service.ts` -- thông điệp 409 khi xoá Composer có Sheet (đếm Sheet cùng với Series) -- rõ lý do.
- [x] `apps/api/test/unit/sheet-enums.spec.ts`, `test/integration/catalog-sheets.spec.ts` -- enum shared = Prisma; phủ toàn bộ I/O matrix trên DB thật -- AC.
- [x] `apps/admin/src/lib/api/sheets.ts` -- API client có kiểu -- tách lớp gọi API.
- [x] `apps/admin/src/app/(admin)/sheets/page.tsx` + `components/sheets/sheet-table.tsx` -- bảng: tiêu đề, `#publicId`, Composer, Level, Status, cập nhật lúc (format vi-VN); ô tìm, bộ lọc Level/Status/Composer, phân trang; nút "Tạo Sheet"; click hàng tới `/sheets/[id]` -- UX-DR20.
- [x] `apps/admin/src/app/(admin)/sheets/new/page.tsx`, `sheets/[id]/page.tsx`, `components/sheets/sheet-form.tsx` -- form đủ trường; Genre chọn nhiều (checkbox list hoặc multi-select); ô độ khó 0–100 kèm ghi chú; `markdown-editor.tsx` (textarea + tab Xem trước bằng `react-markdown` + `remark-gfm`); `youtube-preview.tsx` (iframe hiện khi link hợp lệ, lỗi tại trường khi sai); tạo xong chuyển sang trang sửa; sửa xong báo "Đã lưu" -- UX-DR23.
- [x] `apps/admin/src/**/sheets/*.test.tsx` -- test form: validate, YouTube preview hiện/ẩn và báo lỗi, chọn Series lọc theo Composer, gửi đúng body; bảng: lọc và tìm gửi đúng query -- phủ UI.

**Acceptance Criteria:**
- Given đã đăng nhập admin, when tạo một Sheet đủ trường ở `/sheets/new`, then Sheet xuất hiện ở `/sheets` với status DRAFT; mở lại thì thấy đủ dữ liệu; dán link YouTube hợp lệ thì thấy preview video trong form.
- Given `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Design Notes

- **Series lọc theo Composer trong form:** khi đổi Composer, dropdown Series tải lại theo `composerId`; nếu Series đang chọn không thuộc Composer mới thì bỏ chọn.
- **`first_published_at`:** ở story này luôn null (chưa có publish). Cột được thêm sẵn để quy tắc "slug đóng băng sau publish" có chỗ dựa; Story 1.8 sẽ ghi vào cột này.
- **Strict DTO:** `z.strictObject` từ chối key lạ, là cách đơn giản nhất để đáp ứng yêu cầu "trường dẫn xuất bị từ chối".

## Verification

**Commands:**
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `docker compose up -d --build --wait`, đăng nhập, rồi `POST /admin/sheets` với `youtu.be/ID` -- expected: 201, `youtubeUrl` ở dạng chuẩn, `hasVideo:true`

**Manual checks:**
- Trình duyệt: `/sheets` → "Tạo Sheet" → điền form, dán link YouTube (thấy preview), xem tab Xem trước markdown, lưu, quay lại danh sách, lọc và tìm.

## Implementation Notes

- Migration `20260929090000_catalog_sheet` sinh bằng `prisma migrate diff` và thêm tay CHECK `difficulty_score BETWEEN 0 AND 100`; có thêm index `sheets(series_id)` cho FK RESTRICT.
- `parseYoutubeUrl` chấp nhận link thiếu scheme (coi như https), vì I/O matrix dùng `youtu.be/ID`.
- Slug sinh lại khi đổi tiêu đề (Draft) loại trừ chính Sheet đang sửa khi dò trùng, nên đổi tiêu đề mà slug cơ sở không đổi thì không thêm hậu tố. Retry P2002 bọc cả transaction (lỗi trong interactive transaction làm hỏng transaction).
- PATCH chỉ kiểm tra Series khớp Composer khi request gửi `composerId` hoặc `seriesId`.
- Form admin dùng lại field schema của `createSheetSchema`; ô độ khó là chuỗi, chuyển sang số ở schema form. Form gửi đầy đủ các trường (cả khi PATCH).

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | `composerId`/`seriesId` viết hoa khiến bước kiểm tra Series–Composer báo lệch sai | low | Có thật: `z.uuid` chấp nhận A-F viết hoa, DB trả chữ thường; `genreIds` đã được lowercase còn hai trường này thì chưa. Sửa chỉ cần một transform | patch |
| 2 | Slug có thể sinh lại sau lần publish đầu nếu publish chạy xen giữa bước đọc và bước ghi | maybe-false | Hiện chưa có publish (Story 1.8); nếu xảy ra thì phá AD-16 (medium) | defer (Story 1.8) |
| 3 | Không chống lost update (hai tab cùng lưu) | low | Chỉ có một admin; muốn chống phải thêm version/If-Match | reject (low) |
| 4 | PATCH không thay đổi gì vẫn bump `updated_at` | low | Chỉ đổi thứ tự trong list | reject (low) |
| 5 | Fallback race P2003 trả 400 không kèm details, và chưa có test | medium | Verification-gap đã xác minh sẵn, disposition `defer` | defer |
| 6 | Các danh sách lựa chọn Genre/Series/Composer bị cắt ở 100 mục mà không báo | low | Có thật; cần picker có tìm kiếm | defer |
| 7 | `seriesId` cũ còn lại khi đổi Composer mà tải Series lỗi | low | Có thật; sửa chỉ cần xoá luôn khi lỗi | patch |
| 8 | "Đã lưu." vẫn hiện khi form đã có thay đổi chưa lưu | low | Có thật; sửa trực tiếp được | patch |
| 9 | Bảng Sheet không lùi trang khi trang hiện tại vượt quá tổng số trang; thông điệp trang rỗng báo sai | low | Có thật; dùng lại guard của Story 1.4 | patch |
| 10 | Tìm không dấu hỏng sau khi slug đóng băng | low | Cùng nguyên nhân với mục đã hoãn ở Story 1.4 (dùng `unaccent`, Story 2.4) | defer |
| 11 | Phân trang và reset về trang 1 của SheetTable chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 12 | Thông điệp 409 khi Composer có cả Series lẫn Sheet chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 13 | Status spec và sprint lệch nhau | false | Status do workflow quản lý theo bước | reject |
| 14 | A11y của bảng (aria-label của hàng, role của icon, hàng chưa phải link) | low | Sửa cần đổi cấu trúc hàng | reject (low) |
| 15 | `toQueryString(object)` làm mất type safety | low | Chỉ ảnh hưởng tới developer | reject (low) |
| 16 | Markdown preview tải ảnh ngoài; link điều hướng ra khỏi form và mất dữ liệu đang sửa | low | Có thật; sửa trực tiếp (link mở tab mới) | patch |
| 17 | DB thiếu ràng buộc bất biến (CHECK `page_count`/`view_count`, liên hệ `first_published_at`–`status`) | low | Sẽ thêm khi làm publish ở Story 1.8 | reject (low) |
| 18 | Tạo thành công xong nút bật lại trước khi điều hướng, bấm lần nữa tạo trùng Draft | low | Có thật; sửa trực tiếp được | patch |
