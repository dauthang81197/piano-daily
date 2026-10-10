---
title: 'Story 3.10 — Đặt giá hàng loạt'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd12dc7d3a31c3a753acd327e4e7b06ff13de06b5'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-1-dat-gia-sheet-va-danh-dau-mien-phi.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Founder phải sửa giá từng Sheet một, rất tốn công khi muốn đổi giá cả một Level, Composer hoặc Genre.

**Approach:** Màn admin "Đặt giá hàng loạt": chọn tiêu chí (Level, Composer, Genre), nhập giá PDF/MIDI/MP3/Bundle hoặc chọn Miễn phí, xem trước danh sách và số Sheet bị ảnh hưởng, rồi xác nhận để `catalog` áp dụng trong một transaction và revalidate cache.

## Boundaries & Constraints

**Always:** Chỉ áp dụng cho Sheet DRAFT và PUBLISHED (bỏ qua ARCHIVED, cả preview lẫn apply). Nếu sau khi áp dụng có Sheet PUBLISHED không miễn phí và không còn type nào bán được (file hiện hành + giá > 0) thì rollback cả lô và trả 422 kèm danh sách Sheet vi phạm. Giá trị Miễn phí là ba chế độ "Giữ nguyên | Miễn phí | Có giá": Miễn phí đặt `isFree = true`, Có giá đặt `isFree = false`, cả hai giữ nguyên các cột giá. Tiêu chí kết hợp bằng AND và cần ít nhất một tiêu chí (không có "áp dụng cho tất cả"). Preview và apply dùng chung một hàm dựng điều kiện lọc. Apply gửi kèm tiêu chí và `expectedCount`; nếu số Sheet khớp tiêu chí lúc apply khác `expectedCount` thì trả 409 để founder xem trước lại. Ô giá để trống = không đụng cột đó (khác với đặt null). Giá là số nguyên cent, dùng `priceCentsSchema` (0..100000) và `parseUsdToCents` của shared. Mọi ghi chạy trong một `$transaction` của `catalog`, khoá hàng Sheet theo thứ tự id. Sau commit mới gọi revalidate: gom tag của mọi Sheet bị ảnh hưởng (`tagsFor`), chia lô ≤ 100 tag, lỗi revalidate không làm hỏng kết quả. Không đụng `Order.items` và `order.service.ts` (PRICE_CHANGED tự đúng nhờ `pricing.quote`). Giá lưu cho type chưa có file vẫn được lưu như Story 3.1.

**Never:** Không thêm API public hay đổi `/quote`. Không sửa `Order` hiện có. Không tạo ngoại lệ bỏ qua bất biến "Sheet PUBLISHED phải miễn phí hoặc bán được". Không ghi `Sheet` ngoài `catalog`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Preview | Level=BEGINNER + Genre=Pop | Danh sách (id, tiêu đề, giá hiện tại) và tổng số | Không tiêu chí -> 400 |
| Apply giá | PDF=3.00, các ô khác trống | Chỉ `pricePdfCents` đổi cho mọi Sheet khớp; cache revalidate | N/A |
| Apply Miễn phí / Có giá | Chế độ Miễn phí hoặc Có giá | `isFree` thành true/false; cột giá giữ nguyên | N/A |
| Vi phạm bất biến | Sheet PUBLISHED không free thành không bán được | Không ghi gì | 422, danh sách Sheet vi phạm |
| Sheet ARCHIVED khớp tiêu chí | Level khớp nhưng ARCHIVED | Không nằm trong preview, không bị đổi | N/A |
| Số lượng lệch | `expectedCount` ≠ số khớp thật | Không ghi gì | 409, kèm số mới |
| Không khớp Sheet nào | Tiêu chí không có kết quả | Không ghi gì | 400/422 rõ ràng |
| Không nhập gì | Mọi ô trống, chế độ Giữ nguyên | Không ghi gì | 400 |
| Giá ngoài khoảng | PDF=1001 | Không ghi gì | 400 |
| Đổi giá khi có Order PENDING | Order tạo trước đó | Capture dùng snapshot cũ; create-order giá cũ nhận `PRICE_CHANGED` | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/pricing.ts`, `sheet.ts` -- `priceCentsSchema`, `parseUsdToCents`; thêm schema `bulkPriceFilter`/`bulkPricePreview`/`bulkPriceApply` ở shared.
- `apps/api/src/modules/catalog/sheets.service.ts` -- `list` (~L290-313) dựng `where` theo level/composerId, chưa có genre; tách helper lọc dùng chung (thêm `genres: { some: { genreId } }`). `PRICE_FIELDS`, `isSheetMonetisable`, `assertMonetisable` (~L182-205) để kiểm bất biến trong transaction; `updateRow` (~L381) là mẫu khoá `FOR UPDATE`.
- `apps/api/src/modules/catalog/sheets.controller.ts` -- thêm `POST admin/sheets/bulk-pricing/preview` và `/apply` (đặt trước `:id`).
- `apps/api/src/modules/catalog/cache-invalidator.ts` -- `tagsFor`, `snapshot`, `notify` (tối đa 3 lần, không ném). Thêm phương thức nhận nhiều Sheet, chia lô 100 (route web nhận 1..100 tag).
- `apps/api/src/modules/catalog/pricing.service.ts` -- `computeQuote`, `isMonetisable`, `PRICE_SELECT`; không đổi.
- `apps/admin/src/app/(admin)/sheets/bulk-pricing/page.tsx` (mới), `components/sheets/`, `lib/api/catalog.ts` -- form tiêu chí + giá, bảng preview, xác nhận; thêm link từ trang Sheets. Mẫu bộ lọc: `sheet-table.tsx`, `use-catalog-options.ts`; form giá: `sheet-form.tsx`.
- Test: `packages/shared/src/*.spec.ts`; `apps/api/test/unit/` (service, ma trận); `apps/api/test/integration/` (Postgres: transaction, giữ nguyên ô trống, 409, revalidate); `apps/admin/src/**/*.test.tsx` (mock API client).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared` -- schema tiêu chí/giá/apply + test
- [x] `sheets.service.ts` -- helper lọc dùng chung (thêm genre), `previewBulkPricing`, `applyBulkPricing` trong một transaction
- [x] `cache-invalidator.ts` -- revalidate nhiều Sheet theo lô
- [x] `sheets.controller.ts` -- hai route preview/apply
- [x] `apps/admin` -- trang đặt giá hàng loạt + link + test
- [x] Test đơn vị và integration theo ma trận

**Acceptance Criteria:**
- Given tiêu chí hợp lệ, when xem trước, then thấy danh sách và số Sheet bị ảnh hưởng trước khi áp dụng.
- Given xác nhận áp dụng, when `catalog` cập nhật, then mọi thay đổi nằm trong một transaction, ô giá trống giữ nguyên giá cũ, và tag cache của các Sheet bị ảnh hưởng được revalidate.
- Given Order PENDING tạo trước khi đổi giá, when capture, then dùng snapshot trong `Order.items`; create-order mới với giá cũ nhận `PRICE_CHANGED`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Thiếu test PUBLISHED chỉ còn file superseded / giá type chưa có file | medium | patch (đã sửa) | Thêm 2 test integration trong `bulk-pricing.spec.ts` (chưa chạy được cục bộ, CI chạy) |
| Không test `touch()` xoá preview | medium | patch (đã sửa) | Thêm test admin: sửa ô sau preview thì mất nút áp dụng |
| 422 "không có Sheet khớp" hiện thông điệp vi phạm giá sai | low | patch (đã sửa) | Form rẽ nhánh theo `details[].path === 'filter'`; có test |
| `priceErrors` không bị xoá khi sửa ô | low | patch (đã sửa) | `touch()` gọi `setPriceErrors({})` |
| `expectedCount` chỉ so số lượng, hoán đổi Sheet cùng số lượng vẫn qua | low | defer | Cần ids/hash trong hợp đồng apply (khối đóng băng) |
| Sheet PUBLISHED đã không bán được từ trước làm cả lô 422 | low | defer | Chỉ xảy ra ở dữ liệu cũ (xem mục hoãn gỡ file cuối); spec không phân biệt |
| Danh sách vi phạm 422 không giới hạn | low | defer | Chỉ khi hàng nghìn Sheet vi phạm cùng lúc |
| Race candidate/lock | false | reject | Lấy lại tập khớp sau khoá với `id in candidateIds`, đếm đúng số đã khoá |
| `void notifySheets` không await; lỗi một lô dừng các lô sau | false | reject | Cùng kiểu `track` hiện có; `notify` đã retry 3 lần và không ném |
| Race preview, mạng 5xx, key trùng | low/false | reject | Message có `publicId` nên duy nhất; còn lại ít gặp, fix thêm phức tạp |
| Audit/undo, so sánh trước-sau, cast kiểu, role=status, parse response | low | reject | Ngoài intent; chỉ cosmetic |
| Thiếu test thứ tự khoá, đồng thời, PAID trên free không giá, composer-only, 401/403 | low | reject | Khó test hoặc đã bảo vệ bởi guard toàn cục; hành vi không đổi |
| Order PENDING/PRICE_CHANGED không có test trong diff | low | reject | Không đụng code đơn hàng; `create-order.spec.ts` hiện có đã phủ PRICE_CHANGED và snapshot |
| Sprint-status, Code Map lệch đường dẫn, log rỗng | low | reject | Sửa spec/theo dõi, không phải lỗi code; sprint-status cập nhật ở bước hoàn tất |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test shared, admin, API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Ở admin: chọn một Level, xem preview, áp dụng giá PDF; kiểm tra các Sheet khớp đổi giá còn ô trống giữ nguyên, trang công khai cập nhật.
