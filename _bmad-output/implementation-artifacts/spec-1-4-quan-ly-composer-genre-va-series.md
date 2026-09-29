---
title: 'Story 1.4 — Quản lý Composer, Genre và Series'
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '841dd277f80d0234a79bc9005f27e02c2dc54f0b'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Founder chưa có nơi tạo phân loại (Composer, Genre, Series). Mọi Sheet ở Story 1.5 đều cần Composer, và Series/Genre là thông tin phân loại chính của thư viện.

**Approach:**
- **Module `catalog` (API):** tạo bảng `Composer`, `Genre`, `Series` và các endpoint CRUD `/admin/{composers,genres,series}`. Slug tự sinh từ tên (bỏ dấu), unique. List có phân trang và tìm theo tên.
- **Admin:** trang `/taxonomy` có 3 tab, mỗi tab gồm bảng dữ liệu, form tạo/sửa và nút xoá.
- Xoá bản ghi đang được tham chiếu thì bị từ chối bằng thông báo rõ ràng.

## Boundaries & Constraints

**Always:**
- Chỉ module `catalog` đọc/ghi 3 bảng này (AD-1). DTO là zod schema trong `packages/shared`, validate bằng `@Body({ schema })` / `@Query({ schema })`.
- **Slug:**
  - Sinh từ tên: bỏ dấu tiếng Việt (kể cả `đ` → `d`), lowercase, kebab-case, chỉ gồm `[a-z0-9-]`.
  - Unique trong từng bảng; trùng thì thêm hậu tố `-2`, `-3`…
  - Slug sinh một lần lúc tạo và **không đổi khi đổi tên** (giữ URL công khai ổn định cho Epic 2). Admin không sửa slug ở story này.
- **List:**
  - Trả `{items, page, pageSize, total}`; `page` bắt đầu từ 1, `pageSize` mặc định 20, tối đa 100, sắp xếp theo tên.
  - Tìm theo tên không phân biệt hoa thường **và không phân biệt dấu**: khớp khi `name` chứa `q` (ILIKE), hoặc `slug` chứa `slugify(q)`.
- **Series:** bắt buộc thuộc một Composer tồn tại; list Series trả kèm `{id, name}` của Composer và lọc được theo `composerId`.
- **Xoá khi đang được dùng:** Composer có Series (và sau này Sheet) tham chiếu, hoặc Genre/Series đang gắn với Sheet ở các story sau, thì trả 409 với mã `RESOURCE_IN_USE` và thông điệp nêu lý do. FK dùng `ON DELETE RESTRICT`; lỗi FK của Prisma được map sang 409, không bao giờ trả 500.
- **Quyết định:**
  - `Composer.avatar` là cột nullable, chưa xuất hiện trên form (upload thêm khi có module `media`, Story 1.6).
  - `Genre.icon` là tên icon chọn từ một danh sách lucide cố định trong `packages/shared` (dropdown); có thể để trống.
- **Admin UI:**
  - Bảng có ô tìm kiếm (debounce) và phân trang; click hàng mở form sửa.
  - Lỗi validate hiện bằng `FormError` ngay dưới trường; thao tác xoá có bước xác nhận ngay trong giao diện.
  - Mọi lời gọi đi qua `apiFetch`.

**Never:**
- Không làm trang Composer/Genre công khai (Epic 2) và không revalidate cache (Story 2.3).
- Không upload ảnh; không tạo bảng Sheet hay SheetGenre (Story 1.5).
- Không cho sửa slug bằng tay.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo Composer | `{name:"Trịnh Công Sơn", bio?}` | 201, slug `trinh-cong-son` | N/A |
| Slug trùng | Tạo Composer tên "Trinh Cong Son" khi đã có `trinh-cong-son` | slug `trinh-cong-son-2` | N/A |
| Tên chỉ có ký tự đặc biệt | `name:"!!!"` | slug dự phòng hợp lệ (vd. `composer`, rồi thêm hậu tố nếu trùng) | N/A |
| Đổi tên | PATCH `name` mới | Tên đổi, slug giữ nguyên | N/A |
| Tên rỗng / quá dài | `name:"  "` hoặc > 120 ký tự | 400 `VALIDATION_FAILED` kèm `details` | N/A |
| Tìm không dấu | `q=trinh` | Trả "Trịnh Công Sơn" | N/A |
| Phân trang | `page=2&pageSize=20` | Đúng lát cắt, `total` đúng | `pageSize>100` → 400 |
| Series với Composer không tồn tại | `composerId` lạ | 400 `VALIDATION_FAILED` (details `composerId`) | N/A |
| Xoá Composer còn Series | DELETE composer | 409 `RESOURCE_IN_USE` "Composer đang có Series…" | Không 500 |
| Sửa/xoá id không tồn tại | id lạ hoặc không phải UUID | 404 `NOT_FOUND` | N/A |
| Không có access token | Bất kỳ `/admin/*` | 401 `UNAUTHORIZED` | Guard global |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/identity/` -- mẫu module (controller/service, `AppException`, `@CurrentUser`). Route `/admin/*` được guard global bảo vệ; không cần `@Public`, và test allowlist public route không đổi.
- `apps/api/src/common/http-exception.filter.ts` -- `STATUS_TO_CODE` + `DEFAULT_MESSAGE`: cần thêm 409. `apps/api/src/common/validation.ts` -- `exceptionFactory` của pipe.
- `apps/api/prisma/schema.prisma` -- quy ước: uuidv7, `@map` snake_case, timestamptz. Có migration `20260928062508_identity`.
- `packages/shared/src/{errors,auth,index}.ts` -- catalog mã lỗi và mẫu schema. `apps/api/test/integration/{create-app,auth.spec}.ts` -- mẫu integration test (TRUNCATE giữa các test, login lấy token).
- `apps/admin/src/lib/api/client.ts` (`apiFetch`, `ApiError`), `components/{form-field,form-error}.tsx`, `components/ui/*` (button, card, input, label), `app/(admin)/taxonomy/page.tsx` (placeholder sẽ được thay). Component shadcn còn thiếu (table, tabs, dialog, select, textarea) thêm bằng `pnpm dlx shadcn@4.21.0 add` (preset `base-nova`).
- `apps/admin/src/test/helpers.ts` -- `stubFetch`, `jsonResponse`, `sessionBody`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/errors.ts` -- thêm `RESOURCE_IN_USE` -- catalog.
- [x] `packages/shared/src/slug.ts` (+spec) -- `slugify(text)`: bỏ dấu (NFD + bỏ combining mark, `đ/Đ` → `d`), lowercase, gộp ký tự không phải `[a-z0-9]` thành `-`, bỏ `-` ở đầu/cuối, cắt tối đa 80 ký tự -- dùng chung API và admin.
- [x] `packages/shared/src/catalog.ts` (+spec) -- `GENRE_ICONS` (danh sách tên icon lucide); schema create/update cho Composer (`name` 1–120 sau trim, `bio` ≤ 2000, nullable), Genre (`name`, `icon` thuộc `GENRE_ICONS` hoặc null), Series (`name`, `composerId` uuid); `listQuerySchema` (`q?`, `page`, `pageSize`, `composerId?`); response `pageSchema(item)` -- hợp đồng API.
- [x] `apps/api/prisma/schema.prisma` + migration `<ts>_catalog_taxonomy` -- `Composer(id, name, slug unique, bio?, avatar?, created_at, updated_at)`, `Genre(id, name, slug unique, icon?, …)`, `Series(id, name, slug unique, composer_id FK RESTRICT, …)`, index `series.composer_id` -- AD-1, AD-16.
- [x] `apps/api/src/modules/catalog/` -- `CatalogModule`; controllers `/admin/composers|genres|series` (GET list, GET `:id`, POST, PATCH `:id`, DELETE `:id`; `:id` được validate là UUID); service dùng chung helper `uniqueSlug(table, base)` (thử slug, trùng thì tăng hậu tố; bắt lỗi unique P2002 rồi thử lại khi hai request tạo đồng thời); map lỗi FK P2003 → 409 `RESOURCE_IN_USE` -- CRUD.
- [x] `apps/api/src/common/http-exception.filter.ts` -- 409 → `RESOURCE_IN_USE` -- lỗi chuẩn.
- [x] `apps/api/test/integration/catalog-taxonomy.spec.ts` + unit test cho `uniqueSlug` -- phủ toàn bộ I/O matrix trên DB thật -- AC.
- [x] `apps/admin/src/app/(admin)/taxonomy/page.tsx` + `components/taxonomy/*` -- 3 tab; mỗi tab là bảng (tên, slug, cột phụ: số Series / icon / Composer), ô tìm kiếm debounce 300ms, phân trang, nút "Tạo mới", click hàng mở dialog sửa, nút xoá có xác nhận; lỗi 409 hiện bằng `FormError` -- UX-DR20.
- [x] `apps/admin/src/lib/api/catalog.ts` -- hàm gọi API có kiểu (dùng `apiFetch`) -- tách logic gọi API.
- [x] `apps/admin/src/**/*.test.tsx` -- test tab Composer: list + tìm, tạo (lỗi validate dưới trường), xoá bị 409 hiện thông báo; Series form: chọn Composer -- phủ UI.

**Acceptance Criteria:**
- Given đã đăng nhập admin, when mở `/taxonomy`, then thấy 3 tab; tạo, sửa, xoá được Composer, Genre và Series; tìm "trinh" ra "Trịnh Công Sơn".
- Given `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Design Notes

- **Tìm không dấu không cần extension:** `WHERE name ILIKE %q% OR slug LIKE %slugify(q)%`. Slug đã là bản không dấu của tên (lúc tạo), nên đủ dùng cho admin. FTS đầy đủ với `unaccent` để dành cho Story 2.4.
- **Xoá Genre:** hiện chưa có bảng nào tham chiếu Genre, nên xoá luôn thành công. Story 1.5 thêm `SheetGenre` với FK RESTRICT, và mapping P2003 → 409 lúc đó tự áp dụng.

## Verification

**Commands:**
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `docker compose up -d --build --wait`, login lấy token, `curl -X POST localhost:4000/admin/composers -H "Authorization: Bearer …" -d '{"name":"Trịnh Công Sơn"}'` -- expected: 201 với slug `trinh-cong-son`

**Manual checks:**
- Mở `http://localhost:3001/taxonomy` trong trình duyệt: tạo, sửa, xoá, tìm, phân trang ở cả 3 tab.

## Implementation Notes

- `uniqueSlug` (apps/api/src/modules/catalog/unique-slug.ts) kiểm tra ứng viên theo lô 20 (`slug IN (...)`), cắt base để slug có hậu tố vẫn ≤ 80 ký tự; `createWithUniqueSlug` thử lại tối đa 5 lần khi gặp P2002. Slug dự phòng: `composer` / `genre` / `series`.
- `:id` validate bằng `UuidParamPipe` (không phải UUID → 404). Composer có đếm Series trước khi xoá để thông điệp nêu số lượng; P2003 vẫn được map sang 409 phòng race (có test giả lập race).
- List Composer trả thêm `seriesCount` (cột phụ của bảng admin). Response không có `createdAt/updatedAt`.
- Dropdown Composer (form Series và bộ lọc tab Series) tải tối đa 100 Composer đầu theo tên; Composer hiện tại của Series đang sửa luôn có mặt. Khi số Composer > 100 cần combobox có tìm kiếm.
- Nút xoá nằm trong dialog sửa (click hàng), xác nhận hai bước ngay trong giao diện.
- Component shadcn thêm: table, tabs, dialog, select, textarea (focus ring textarea/select chỉnh về `ring-2 ring-ring` như input).

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap — hai reviewer sau chạy lại do lần đầu bị ngắt vì chạm giới hạn phiên).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Map 409 → `RESOURCE_IN_USE` toàn cục, nên mọi 409 sau này đều thành "không thể xoá" | low | Có thật; `AppException` đã tự mang mã riêng, nên chỉ cần xoá dòng map ở filter | patch |
| 2 | Tìm không dấu theo slug sai sau khi đổi tên; `q=2` khớp mọi slug `-2` | low | Có thật; Design Notes đã chấp nhận, FTS với `unaccent` để dành cho Story 2.4 | defer |
| 3 | Lùi trang khi trang rỗng không có guard (có thể refetch lặp) | low | Chỉ lặp khi server trả dữ liệu mâu thuẫn (trang rỗng nhưng `ceil(total/20)` ≥ trang hiện tại); guard rất rẻ | patch |
| 4 | "Lưu" vẫn bấm được khi đang xoá | low | Hiếm gặp; sửa cần nâng state `busy` lên form | reject (low) |
| 5 | Status tracking lệch nhau | false | Status do workflow quản lý theo bước | reject |
| 6 | Sắp xếp tên tiếng Việt sai collation | false | DB dùng `en_US.utf8`; đã thử: `an, Ánh, Bach, Đặng, Zeta` | reject |
| 7 | Ô tìm kiếm không có `maxLength`, nhập > 120 ký tự nhận lỗi chung | low | Có thật; sửa chỉ cần thêm `maxLength` | patch |
| 8 | `applyServerError` giấu thông điệp của server (VALIDATION_FAILED không có details, FORBIDDEN, 429) | low | Có thật; sửa chỉ cần fallback về `err.message` | patch |
| 9 | Load lỗi vẫn hiện các hàng cũ | low | Có thật; sửa chỉ cần xoá data khi lỗi | patch |
| 10 | `useComposerOptions` không có nút thử lại | low | Sửa cần thêm state/retry | reject (low) |
| 11 | Giới hạn đã biết chưa được ghi vào ledger (dropdown Composer tối đa 100) | low | Có thật | defer |
| 12 | Form Genre (dropdown icon, map về `null`) chưa có test UI | medium | Verification-gap đã xác minh sẵn | patch |
| 13 | Bộ lọc Composer ở tab Series chưa có test UI | medium | Verification-gap đã xác minh sẵn | patch |
| 14 | Xoá thành công (đóng dialog, reload, lùi trang) chưa có test UI | medium | Verification-gap đã xác minh sẵn | patch |
| 15 | Race P2003 khi create/update Series chưa có test | medium | Verification-gap đã xác minh sẵn, disposition `defer` | defer |
| 16 | Nhánh NOT_FOUND và details không map được trong `applyServerError` chưa có test | low | Verification-gap đã xác minh sẵn | patch |
| 17 | `composerId` được chấp nhận ở mọi endpoint list | low | Chỉ lỏng hợp đồng, không gây hại | reject (low) |
| 18 | Nhãn icon là tên lucide thô | low | Chỉ ảnh hưởng thẩm mỹ với một admin | reject (low) |
| 19 | Không xem trước slug khi tạo | low | Tính năng thêm | reject (low) |
| 20 | Icon trong DB không có trong map component thì crash tab Genre | low | Hiện chỉ ghi qua schema; sửa chỉ cần guard một dòng | patch |
| 21 | PATCH Series với id lạ + composerId lạ trả 400 thay vì 404 | low | Tổ hợp hiếm | reject (low) |
