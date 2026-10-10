---
title: 'Story 4.1 — Danh sách và chi tiết đơn hàng'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '74513e5dec7d864a799a618c14b65405f1715514'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Founder chưa có cách nào xem đơn hàng ở admin (trang Đơn hàng mới là placeholder), nên không tra được tình hình bán hàng hay trả lời khiếu nại của người mua.

**Approach:** Thêm API admin chỉ đọc trong module `commerce` (danh sách có lọc và phân trang, chi tiết một đơn) và thay trang `/orders` bằng bảng lọc cùng trang chi tiết `/orders/[id]`.

## Boundaries & Constraints

**Always:** Route `admin/orders` (`GET /` và `GET /:id`) nằm trong `commerce`, đọc `orders`, `download_tokens`, `download_logs` ngay trong module; không đi qua catalog, Sheet lấy bằng `select` quan hệ. Chỉ đọc, không ghi, không đổi `Order.status`. Danh sách lọc theo `status`, khoảng ngày `from`/`to` (theo `createdAt`), `email` (chứa một phần, không phân biệt hoa thường), `reviewRequired`; sắp xếp `createdAt` giảm dần rồi `id`; phân trang dùng `pageSchema`, `PAGE_SIZE_DEFAULT/MAX` của shared. Mỗi dòng: order code, email, tiêu đề Sheet, các file đã mua (từ `items`), số tiền USD (từ cent), trạng thái, ngày, cờ review. Ngày `from`/`to` là ngày theo `REPORT_TZ` (`Asia/Ho_Chi_Minh`, đặt hằng số trong shared) và đổi sang biên UTC (đầu ngày `from`, hết ngày `to`) khi truy vấn; mọi ngày hiển thị ở admin dùng `Intl.DateTimeFormat` với `timeZone: REPORT_TZ`. Chi tiết trả: `items` snapshot, `paypalOrderId`, `paypalCaptureId`, `payerEmail`, `payerName`, `paidAt`, `refundedAt`, `emailSentAt`, trạng thái token (hạn dùng, `usedDownloads`/`maxDownloads`, đã vô hiệu chưa; tái dùng `tokenStatus()`), lịch sử tải từ `DownloadLog` của token (thời điểm, loại file, UA) mới nhất trước, tối đa 100 dòng. Đơn `reviewRequired = true` nổi bật ở danh sách và chi tiết, có bộ lọc riêng. Không migration mới. Đơn không tồn tại -> 404.

**Never:** Không trả `DownloadToken.token`, `ipHash`, `storageKey` hay payload PayPal thô. Không log email tìm kiếm hay email đơn (log chỉ mã đơn); không thêm hành động gửi lại email, gia hạn token, hoàn tiền (Story 4.2/4.3). Không sửa các hàm đọc/ghi đang phục vụ capture (`ORDER_FOR_CAPTURE`, `findById`, `findByOrderId`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Danh sách mặc định | Không lọc | Trang 1, đơn mới nhất trước, kèm `total` | N/A |
| Lọc trạng thái + email | `status=PAID`, `email=nguy` | Chỉ đơn PAID có email chứa "nguy" (không phân biệt hoa thường) | N/A |
| Khoảng ngày | `from=2026-10-01&to=2026-10-01` | Đơn tạo từ 00:00 đến 23:59:59 ngày 01/10 giờ Việt Nam | `from` > `to` -> 400 |
| Cần xem xét | `reviewRequired=true` | Chỉ đơn review_required, hiển thị nổi bật | N/A |
| Chi tiết đơn đã trả tiền | Đơn PAID có token và lượt tải | Đủ items, PayPal, mốc thời gian, token, lịch sử tải | N/A |
| Chi tiết đơn PENDING | Chưa có token | `token: null`, lịch sử rỗng | N/A |
| Không tồn tại | id lạ | 404 | `{error:{code,...}}` |
| Chưa đăng nhập | Không bearer | 401 | Guard toàn cục |

</frozen-after-approval>

## Code Map

- `packages/shared/src/order.ts` -- đã có `orderStatusSchema`, `orderItemSchema`; thêm `REPORT_TZ`, `adminOrderListQuerySchema` (mẫu `sheetListQuerySchema` ở `sheet.ts` ~L214), schema dòng danh sách và chi tiết; export qua `index.ts`; test `order.spec.ts`.
- `apps/api/src/modules/commerce/order.repository.ts` -- thêm `listForAdmin(where,page)` và `findDetailForAdmin(id)` (`$transaction([findMany,count])` theo `SheetsService.list`, `catalog/sheets.service.ts:321`); `select` riêng, không `token`.
- `apps/api/src/modules/commerce/download-token.repository.ts` -- `tokenStatus()` (~L38) tái dùng; không trả secret. `download-log.repository.ts` -- thêm đọc log theo `tokenId`.
- `apps/api/src/modules/commerce/admin-orders.controller.ts` + `admin-orders.service.ts` (mới) -- `@Controller('admin/orders')`, `@Query({ schema })`, `UuidParamPipe`; không `@Public()` (guard JWT mặc định chặn). Đăng ký trong `commerce.module.ts`.
- `apps/admin/src/app/(admin)/orders/page.tsx` (thay placeholder), `orders/[id]/page.tsx` (mới), `components/orders/order-table.tsx`, `order-detail.tsx` (mới), `lib/api/orders.ts` (mới) -- mirror `sheets/page.tsx`, `components/sheets/sheet-table.tsx` (debounce, AbortController, `FilterSelect`, row click `router.push`), `lib/api/sheets.ts`, `toQueryString`; nav `/orders` đã có.
- Test: unit `apps/api/test/unit`, integration `apps/api/test/integration` (mẫu `catalog-sheets.spec.ts`, `createApp`), admin `components/orders/*.test.tsx` (mẫu `sheets.test.tsx`, `test/helpers.ts`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/order.ts` -- `REPORT_TZ`, schema query/list/detail, export, test
- [x] `order.repository.ts`, `download-log.repository.ts` -- truy vấn danh sách/chi tiết/log, không lộ secret
- [x] `admin-orders.service.ts`, `admin-orders.controller.ts`, `commerce.module.ts` -- route, đổi ngày REPORT_TZ sang UTC, test đơn vị và integration theo ma trận
- [x] `apps/admin` -- trang danh sách (lọc, phân trang, nổi bật review), trang chi tiết, API client, formatter `REPORT_TZ`, test

**Acceptance Criteria:**
- Given trang Đơn hàng, when lọc theo trạng thái, khoảng ngày, email (một phần), then bảng hiển thị order code, email, Sheet, file đã mua, số tiền USD, trạng thái, ngày; có phân trang; click hàng mở chi tiết; ngày theo `REPORT_TZ`.
- Given trang chi tiết, when mở, then thấy items snapshot, thông tin PayPal, `paid_at`/`refunded_at`, `email_sent_at`, trạng thái token (hạn, lượt dùng/tối đa, đã vô hiệu chưa) và lịch sử tải (thời điểm, file, UA), không có token bí mật hay IP.
- Given Order `review_required = true`, when xem danh sách hoặc chi tiết, then đơn nổi bật và có bộ lọc riêng.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Token REVOKED (đơn REFUNDED / `revokedAt`) và `refundedAt` không có test | medium | patch (đã sửa) | Thêm test đơn vị `get` và test UI đơn hoàn tiền |
| Khoảng ngày sai: kết quả cũ còn hiển thị, `loading` kẹt | low | patch (đã sửa) | Nhánh `from > to` giờ `setData(null)` và `setLoading(false)` |
| `parseItems` nuốt lỗi snapshot hỏng, không log | low | patch (đã sửa) | Log cảnh báo chỉ kèm mã đơn |
| Helper đổi ngày REPORT_TZ nằm trong service `commerce`, Story 4.7 sẽ cần | low | defer | `analytics` không được import service module khác |
| Lịch sử tải cắt 100 dòng, UI không báo bị cắt | low | defer | API không trả tổng/cờ cắt bớt |
| Bộ lọc email có thể coi `%`, `_` là ký tự đại diện | maybe-false | reject | Prisma `contains` tự escape ký tự LIKE (chưa kiểm chứng bằng test); chỉ founder dùng |
| Phân quyền theo role, `Cache-Control`, index email/trigram, offset sâu | low | reject | Spec không đặt yêu cầu; dữ liệu nhỏ, chỉ founder dùng |
| URL không giữ bộ lọc, row không là link, aria-label ghi đè nội dung | low | reject | Cải tiến UX/a11y ngoài intent |
| Format ngày không giây, năm 2 chữ số, `Invalid Date` ném RangeError | low | reject | Server luôn trả ISO hợp lệ; định dạng theo mẫu admin hiện có |
| Race response chi tiết khi đổi id, Enter/Space từ phần tử con | low | reject | Đã có AbortController; hàng không chứa phần tử tương tác |
| Phụ thuộc `UuidParamPipe`/`notFound` của catalog | false | reject | Chỉ dùng helper chung, dữ liệu không đi qua catalog |
| Thiếu test FAILED/CANCELLED, EXPIRED, tie-break, email 254 ký tự | low | reject | Hành vi không đổi, ma trận đã phủ |
| Sprint-status/ghi chú spec rỗng/banner epic-4 context | low | reject | Theo dõi và tài liệu, cập nhật ở bước hoàn tất |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test shared, admin, API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Ở admin: mở Đơn hàng, lọc thử từng điều kiện, mở một đơn PAID đã có lượt tải và một đơn `review_required`; ngày hiển thị giờ Việt Nam.
