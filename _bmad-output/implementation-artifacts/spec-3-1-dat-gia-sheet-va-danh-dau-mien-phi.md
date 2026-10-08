---
title: 'Story 3.1 — Đặt giá Sheet và đánh dấu Miễn phí'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'fb12873ee94a89268f8c6d4b8dc876a0bee3def4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet chưa có giá hay cờ Miễn phí, nên Epic 3 không có nguồn báo giá duy nhất để bán hoặc cho tải.

**Approach:** Thêm 4 cột giá cents + `is_free` vào `Sheet`, nhập USD ở form admin (đổi sang cents, không float), `PricingService.quote()` ở module `catalog` là nguồn báo giá duy nhất, `GET /sheets/:id/quote` công khai, và kiểm tra thêm ở publish.

## Boundaries & Constraints

**Always:** Giá là Int cents ở DB/API/shared; chỉ form admin đổi USD↔cents bằng xử lý chuỗi. Type mua được = có file hiện hành (PDF/MIDI/MP3, `supersededAt` null) và giá > 0. BUNDLE chỉ khi ≥ 2 type mua được, giá bundle > 0, và gồm mọi type mua được. Giá ∈ [0, 100000] cents; `null`/0 nghĩa là không bán. Sheet `is_free` luôn trả quote free, không bị giá riêng lẻ ảnh hưởng (giá đã nhập vẫn được giữ). Sheet đã PUBLISHED mà PATCH khiến nó không-free-và-không-mua-được thì bị từ chối (`price`). Đổi giá/miễn phí đi qua `cache.track` như các sửa đổi khác.

**Never:** Không tin giá client; không lộ giá trong response công khai ngoài `/quote`; không thêm vào PATCH metadata các trường lifecycle; không làm Order/PayPal/nút Download (Story 3.2+); không đặt giá hàng loạt (3.10); không cache quote.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đủ 3 type | PDF 2.99, MIDI 1.99, MP3 1.99, bundle 4.99, đủ file | `items` 3 type + `bundle` gồm 3 type | N/A |
| Thiếu MP3 | Giá MP3 có nhưng không có file MP3 | MP3 không trong `items`; bundle gồm PDF+MIDI | N/A |
| Chỉ 1 type | Chỉ PDF mua được, có giá bundle | `items` 1 type, `bundle: null` | N/A |
| Free | `is_free` true | `free: true`, `items: []`, `bundle: null` | N/A |
| Giá 0/null | Giá = 0 hoặc null | Type bị loại | N/A |
| Quote Sheet không PUBLISHED / không tồn tại | Draft hoặc id lạ | 404 | `NOT_FOUND` |
| Publish không-free, không mua được | Không giá/file hợp lệ | Từ chối publish, `details.path = 'price'` | `VALIDATION_FAILED` |
| Publish free | `is_free`, chỉ có PDF | Publish được | N/A |
| Nhập USD sai | "4,5", "-1", "1.234", "1001" | Lỗi tại ô, không gửi API | `form-error` |
| Tick Miễn phí | Form | Ô giá bị vô hiệu, giá cũ giữ nguyên | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` -- model `Sheet`: thêm cột; migration viết tay mới `20261008090000_sheet_pricing` (CHECK 0..100000).
- `packages/shared/src/pricing.ts` (mới) -- `MAX_PRICE_CENTS`, `parseUsdToCents`, `formatUsd`, `priceCentsSchema`, `quoteSchema`, `PURCHASABLE_FILE_TYPES`; export từ `index.ts`.
- `packages/shared/src/sheet.ts` -- `sheetFields`/`sheetSchema` thêm `isFree`, `price*Cents`.
- `apps/api/src/modules/catalog/sheets.service.ts` -- `SELECT`, `toSheet`, `createRow`, `updateRow` (guard PUBLISHED), `setStatusRow` (kiểm tra mua được).
- `apps/api/src/modules/catalog/pricing.service.ts` (mới) -- `quote(sheetId)`; đăng ký trong `catalog.module.ts`; tái dùng truy vấn file hiện hành như `setStatusRow`.
- `apps/api/src/modules/catalog/public-sheets.controller.ts` -- `GET sheets/:id/quote` (`@Public`, ThrottlerGuard 60/phút, `Cache-Control: no-store`).
- `apps/admin/src/components/sheets/sheet-form.tsx` -- mục "Giá bán" (checkbox Miễn phí + 4 ô USD) dùng `sheetFormSchema`.
- `apps/api/prisma/seed-data.ts` -- gán giá/free cho sheet mẫu.
- `packages/shared/src/*.test.ts`, `apps/api/test/*`, `apps/admin/.../sheets.test.tsx` -- test; README mục Story 3.1.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- cột `price_pdf_cents`, `price_midi_cents`, `price_mp3_cents`, `price_bundle_cents` (Int null), `is_free` (bool default false), CHECK -- AD-3.
- [x] `packages/shared` -- `pricing.ts` + mở rộng schema Sheet; test parse/format USD, schema quote.
- [x] `pricing.service.ts` + controller + module -- `quote()` và `GET /sheets/:id/quote`; unit test (thiếu MP3, 1 type, free, giá 0).
- [x] `sheets.service.ts` -- lưu/trả giá & `isFree`; publish kiểm tra mua được; PATCH guard cho Sheet đã PUBLISHED; integration test.
- [x] `sheet-form.tsx` -- mục Giá bán, đổi USD↔cents, disable khi Miễn phí; test form.
- [x] `seed-data.ts`, README -- giá mẫu và hướng dẫn.

**Acceptance Criteria:**
- Given founder nhập "4.99" ở ô PDF, when lưu, then DB lưu 499 và form hiển thị lại "4.99".
- Given Sheet free, when GET quote, then `free: true` và không có `items`/`bundle`.
- Given Sheet PUBLISHED không-free, when PATCH xoá hết giá, then 400 và dữ liệu không đổi.
- Given giá Sheet PUBLISHED đổi, when lưu, then các cache tag của Sheet được revalidate (test với `CacheInvalidator`).
- Given metadata PATCH, when gửi `status`/`isHot`, then vẫn bị từ chối như trước.

## Implementation Notes

- Triển khai trực tiếp (không dùng subagent triển khai). `computeQuote()`/`isMonetisable()` là hàm thuần trong `pricing.service.ts`, dùng chung cho `PricingService.quote()` và kiểm tra publish/PATCH (`assertMonetisable` trong `sheets.service.ts`).
- PATCH guard chạy trong transaction đã khoá hàng, sau `tx.sheet.update`, nên throw sẽ rollback; publish trả 422, PATCH trả 400 (đúng spec).
- Test cũ phải đặt giá PDF trước khi publish qua API (`catalog-sheets`, `cache-revalidate`); seed gán giá qua `seedPricing` (cứ 3 Sheet 1 free, chỉ ghi khi chưa có cấu hình giá).
- Việc gỡ file cuối cùng của Sheet đã publish ghi vào `deferred-work.md`.

## Spec Change Log

## Review Triage Log

- **medium | patch — Sửa Sheet PUBLISHED chưa bán được bị 400:** Form luôn gửi đủ trường giá nên Sheet đã publish trước migration (hoặc vừa gỡ file cuối) không sửa được tiêu đề/mô tả. Guard giờ chỉ chặn khi PATCH biến một Sheet đang bán được thành không bán được; có test tích hợp cho PATCH đầy đủ trường giá null.
- **low | patch — Seed chưa có kiểm chứng:** `seed.spec` nay khẳng định mọi Sheet PUBLISHED mẫu miễn phí hoặc mua được, có Sheet free và Sheet giá 299/bundle 499.
- **low (rejected) — Migration không backfill Sheet đã PUBLISHED:** Chưa có dữ liệu production (Epic 5); đặt Sheet cũ thành Miễn phí là quyết định kinh doanh, không tự làm. Dữ liệu dev được `seedPricing` xử lý; sửa Sheet cũ không còn bị chặn nhờ bản vá trên.
- **false — Chuyển ARCHIVED→PUBLISHED bỏ qua kiểm tra mua được:** `assertMonetisable` nằm trong khối `if (status === 'PUBLISHED')` của `setStatusRow`, chạy cho mọi chuyển sang PUBLISHED.
- **false — Đổi giá không phát cache tag:** `cache.track` tính tag từ trạng thái trước/sau của Sheet PUBLISHED bất kể trường nào đổi; test `cache-revalidate` xác nhận.
- **false — Ô giá bị `disabled` không được gửi:** RHF lấy giá trị từ state nội bộ, không từ DOM; test form xác nhận `pricePdfCents: 300` vẫn gửi khi Miễn phí.
- **false — Mã 422 (publish) khác 400 (PATCH) cho cùng quy tắc:** Đúng theo spec (Publish dùng lỗi lifecycle sẵn có 422, PATCH dùng lỗi validate 400).
- **false — Payload công khai thiếu giá/free, quote thiếu version token:** Ngoài ý định: web lấy giá bằng `/quote` no-store và `expectedTotalCents` (AD-17) là cơ chế phát hiện đổi giá.
- **false — Seed vi phạm bất biến mua được; seed.ts so với seed-data.ts trong Code Map:** Test seed khẳng định mọi Sheet PUBLISHED mua được; Code Map chỉ lệch tên file, không ảnh hưởng.
- **low (rejected) — Bundle không kiểm tra so với tổng giá lẻ; `formatUsd` với cents âm/NaN; MAX_PRICE_CENTS so với CHECK chỉ khớp bằng comment; khoá file khi đua; throttle quote chưa test; seed ghi đè giá bỏ trống có chủ ý:** Spec không yêu cầu; giá bundle là lựa chọn của founder; `formatUsd` chỉ nhận cents đã qua CHECK DB; thêm guard là phức tạp hoá cho khả năng gặp thấp. Race file/check đã có trong deferred-work cho phần gỡ file.

## Design Notes

Quote: `{ sheetId, currency: 'USD', free, items: [{ fileType, priceCents }], bundle: { priceCents, fileTypes } | null }`. Chỉ `PricingService` đọc cột giá để tính; web/commerce sau này chỉ gọi quote.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test` và `pnpm --filter @piano-daily/admin test` -- expected: pass
- API unit + integration (Docker Postgres/SeaweedFS, `unset NODE_ENV`) -- expected: pass
- `pnpm build` (không `NODE_ENV=development`) -- expected: pass
