---
title: 'Story 4.7 — Dashboard doanh thu và lượt dùng'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b20330006bedd727e2c76b9f4b02d71a90482f2f'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-danh-sach-va-chi-tiet-don-hang.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trang Dashboard của admin vẫn là placeholder, founder không biết doanh thu, đơn hàng, lượt xem/tải và bài nào hiệu quả nếu không truy vấn DB.

**Approach:** Module `analytics` (chỉ đọc, không sở hữu bảng) có `GET /admin/analytics/dashboard?from&to&granularity=day|month`; trang Dashboard admin hiển thị thẻ tổng quan, bảng theo Level, doanh thu theo ngày/tháng, top Sheet và Sheet cập nhật gần đây, không thêm thư viện biểu đồ (bảng kèm thanh CSS).

## Boundaries & Constraints

**Always:** Doanh thu = tổng `amount_cents` của Order có `paid_at` trong khoảng và `refunded_at IS NULL`, nhóm theo ngày/tháng của `paid_at` quy về `REPORT_TZ` (`Asia/Ho_Chi_Minh`, dùng `AT TIME ZONE` trong SQL); số đơn = số Order cùng điều kiện đó. Khoảng `from`/`to` là `YYYY-MM-DD` theo `REPORT_TZ`, `to` bao gồm cả ngày cuối; mặc định 30 ngày gần nhất; `from > to` hoặc khoảng > 366 ngày bị từ chối 400. Chuyển helper `dayStartUtc`/`reportRangeToUtc` từ `commerce/admin-orders.service.ts` sang `packages/shared` (cập nhật import và spec cũ), `analytics` chỉ import từ shared và `PrismaService`, không import service module khác. Lượt tải theo Level = đếm `DownloadLog` (cả free `token_id IS NULL` và paid) trong khoảng, join `sheets` lấy Level. Số Sheet theo Level = Sheet `PUBLISHED` hiện tại và tổng lượt xem theo Level = `SUM(view_count)` của chúng (cộng dồn, không lọc theo khoảng; UI ghi rõ). Top bán chạy = Sheet có nhiều Order đủ điều kiện nhất trong khoảng (kèm số đơn và doanh thu), top xem nhiều = `view_count` cao nhất; mỗi top 10; Sheet cập nhật gần đây = 10 Sheet theo `updated_at` giảm dần. Tiền là Int cents ở API/shared; UI format USD bằng `formatUsd` của admin (`lib/format.ts`), không dùng số thực. Schema response nằm trong `packages/shared/src/analytics.ts` (zod), route dùng JWT guard global, mọi admin xem được. Ngày không có đơn vẫn xuất hiện với 0 trong chuỗi theo ngày; tháng tương tự.

**Never:** Không migration, không bảng/cột mới; không ghi dữ liệu; không thêm thư viện biểu đồ; không đếm Order `REFUNDED` hoặc không PAID vào doanh thu/số đơn; không dùng `Number` float để cộng tiền.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Có PAID và REFUNDED trong khoảng | 3 PAID (1000, 2000, 500) + 1 REFUNDED (700) | doanh thu 3500, số đơn 3, khớp tổng PAID trừ REFUNDED | N/A |
| Ranh giới ngày theo giờ VN | Order `paid_at` = 2026-10-09T18:00Z (01:00 ngày 10 VN) | Tính vào ngày 10/10 | N/A |
| Chuỗi theo tháng | granularity=month, đơn ở hai tháng | Hai điểm theo tháng VN, tháng trống = 0 | N/A |
| Không có dữ liệu | DB trống | Mọi tổng = 0, danh sách top rỗng, đủ 4 Level với 0 | N/A |
| Tải free và paid | DownloadLog có và không có `token_id` | Cả hai được tính vào lượt tải theo Level | N/A |
| Khoảng sai | `from` > `to`, ngày sai định dạng, > 366 ngày | N/A | 400 `VALIDATION_FAILED` |
| Chưa đăng nhập | Không có JWT | N/A | 401 |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` -- `Sheet` (level, status, viewCount, updatedAt), `Order` (amountCents, paidAt, refundedAt, status), `DownloadLog` (sheetId, tokenId, createdAt); chỉ đọc.
- `apps/api/src/modules/commerce/admin-orders.service.ts` (dòng ~44-53) -- `dayStartUtc`, `reportRangeToUtc`, `zoneOffsetMs`; chuyển sang `packages/shared/src/report-range.ts` + spec, giữ hành vi, sửa `test/unit/admin-orders.service.spec.ts`.
- `packages/shared/src/order.ts` -- `REPORT_TZ`, `isValidDateOnly`; `sheet.ts` -- `Level`, `levelSchema`; thêm `analytics.ts` (+ `analytics.spec.ts`) và export trong `index.ts`.
- `apps/api/src/modules/ads/` -- mẫu module (`ads.module.ts`, controller `@Query({ schema })`); `apps/api/src/app.module.ts` -- đăng ký `AnalyticsModule`. Tạo `modules/analytics/{analytics.module,analytics.controller,analytics.service}.ts`, dùng `prisma.$queryRaw` cho nhóm theo ngày/tháng.
- `apps/api/test/integration/admin-orders.spec.ts` -- mẫu test tích hợp; thêm `analytics.spec.ts` với dữ liệu mẫu PAID/REFUNDED, ranh giới ngày VN, free+paid download.
- `apps/admin/src/app/(admin)/page.tsx` -- thay `PlaceholderPage`; `components/orders/order-table.tsx` -- mẫu fetch (AbortController, loading/error, ô ngày); thêm `lib/api/analytics.ts`, `components/dashboard/*` + test (mẫu `orders.test.tsx`, helpers `src/test/helpers.ts`); `components/ui/card`, `table`, `tabs`; `lib/format.ts` -- `formatUsd`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/report-range.ts`, `analytics.ts`, `index.ts` -- chuyển helper ngày và thêm schema query/response -- dùng chung API và admin
- [x] `apps/api/src/modules/commerce/admin-orders.service.ts` + spec -- import helper từ shared -- không đổi hành vi
- [x] `apps/api/src/modules/analytics/*`, `app.module.ts` -- endpoint dashboard chỉ đọc -- AC doanh thu/lượt dùng
- [x] `apps/api/test/integration/analytics.spec.ts`, unit nếu cần -- phủ mọi dòng ma trận -- chứng minh khớp PAID trừ REFUNDED
- [x] `apps/admin/src/app/(admin)/page.tsx`, `lib/api/analytics.ts`, `components/dashboard/*` + test -- UI chọn khoảng/granularity, thẻ, bảng, thanh CSS -- trạng thái loading/lỗi/rỗng

**Acceptance Criteria:**
- Given Order PAID và REFUNDED trong khoảng, when mở Dashboard, then doanh thu bằng tổng PAID trừ REFUNDED theo `paid_at` ở `REPORT_TZ`, hiển thị USD từ cents chính xác.
- Given founder đổi khoảng thời gian hoặc granularity, when dữ liệu tải xong, then thẻ, chuỗi doanh thu, lượt tải theo Level và top Sheet cập nhật theo khoảng; số Sheet và lượt xem theo Level là số hiện tại.
- Given module `analytics`, when xem code, then không có ghi DB và không import service của module khác.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Phát hiện | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Phản hồi cũ ghi đè dữ liệu mới (nhánh `.then` không kiểm abort) | medium | patch | Đã thêm kiểm `controller.signal.aborted`. |
| Lỗi cũ còn khi khoảng sai | low | patch | Đã `setError(null)` ở nhánh khoảng sai (sửa một dòng). |
| `topViewed`/`recentSheets` gồm Sheet không PUBLISHED, lượt tải gồm mọi Sheet | low | reject | Spec không giới hạn; founder cần thấy Sheet nháp vừa sửa, lượt tải của Sheet đã lưu trữ vẫn là lượt tải thật. |
| Cộng tiền bằng `Number` sau khi SQL đã SUM | low | reject | Cents trong phạm vi an toàn của số nguyên; không có giá trị nào gần 2^53. |
| Ép kiểu `reportRangeToUtc` | low | reject | Khoảng đã được kiểm hợp lệ ngay trước đó. |
| Khoảng tương lai/tháng biên một phần/bảng 366 dòng | low | reject | Không vi phạm spec; cosmetic. |
| Gọi API mỗi lần gõ ô ngày | low | reject | Chỉ gọi khi cả hai ngày hợp lệ, request huỷ được; thêm debounce là phức tạp thừa. |
| Không có kiểm vai trò; index; migration | false | reject | Spec: mọi admin xem được, cấm migration. |
| Doanh thu của đơn hoàn tiền sau kỳ bị trừ lùi | false | reject | Đúng định nghĩa trong spec (trừ Order có `refunded_at`). |
| Giá trị thô (status/kỳ), hydration, SQL gắn tên cứng, thiếu test phụ | low | reject | Cosmetic hoặc tồn tại ở mã hiện có; integration test là chốt chặn. |

## Verification

**Commands:**
- Test api (unit + integration), shared, admin; `tsc --noEmit` từng package -- expected: pass

**Manual checks (if no CLI):**
- Mở Dashboard admin với dữ liệu seed: đổi khoảng và granularity, đối chiếu doanh thu với danh sách đơn đã lọc PAID.
