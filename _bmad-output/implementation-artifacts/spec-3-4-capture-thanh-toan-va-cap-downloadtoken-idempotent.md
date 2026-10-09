---
title: 'Story 3.4 — Capture thanh toán và cấp DownloadToken idempotent'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '4d4fee41d9becfe0e098f4427539e0d98d22b190'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Đơn PayPal đã tạo được (Story 3.3) nhưng chưa ai capture tiền, đánh dấu PAID hay cấp quyền tải, nên người mua trả tiền vẫn không nhận được hàng.

**Approach:** Thêm `POST /payments/paypal/capture-order { paypalOrderId }`: gọi PayPal capture rồi `OrderService.fulfil()` chuyển Order PAID và cấp đúng một `DownloadToken` trong cùng transaction, trả `{orderCode, token, files}`. Nối hook GC của Story 1.8 để không xoá file còn token sống tham chiếu.

## Boundaries & Constraints

**Always:** `fulfil()` chỉ chuyển PAID khi capture `COMPLETED` và amount/currency khớp Order (so `formatUsd(amountCents)` với chuỗi PayPal); chạy `UPDATE ... WHERE id AND status IN (PENDING, CANCELLED, FAILED)` cùng transaction với tạo token, set `paid_at`, `paypal_capture_id`, `payer_email`, `payer_name`. Hạn và số lượt của token lấy từ `SettingsService` (`token_default_days`, `token_default_max_downloads`) tại thời điểm cấp. UPDATE 0 dòng → đọc lại Order: đã PAID thì trả `{orderCode, token, files}` từ token hiện có, không tạo token thứ hai (token `UNIQUE order_id`). Amount/currency lệch → không PAID, `review_required=true`, log error. Từ CANCELLED/FAILED sang PAID log `LATE_CAPTURE`. PayPal từ chối (422 `INSTRUMENT_DECLINED` hoặc capture DECLINED/FAILED) → Order FAILED qua `OrderService`, trả `PAYMENT_DECLINED` kèm lý do hiển thị được. `ORDER_ALREADY_CAPTURED` → `getOrder` rồi fulfil. Token là chuỗi ngẫu nhiên mật mã học, unique. `files` = `{fileType, name}` của file hiện hành tại lúc cấp (không có `storage_key`); token giữ danh sách `sheet_file_id` đó (bảng `download_token_files`) để GC tham chiếu. Chỉ `OrderService` đổi `Order.status`. Không log email, token, chi tiết PayPal. Endpoint `@Public`, rate limit như create-order, `Cache-Control: no-store`.

**Never:** Không webhook, trang tải, tải qua token, email (Story 3.5, 3.7, 3.8). Không tin client về số tiền. Không PAID khi PayPal chưa `COMPLETED`. Không gọi PayPal thật trong test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Capture thành công | Order PENDING, PayPal COMPLETED khớp | Order PAID, 1 token (hạn/lượt từ settings), `{orderCode, token, files}` | N/A |
| Gọi hai lần đồng thời | Hai capture/fulfil cùng Order | Cả hai trả cùng token; DB đúng 1 token | N/A |
| Đã PAID | Capture lại | Trả token cũ, không đổi gì | N/A |
| Lệch amount/currency | PayPal COMPLETED nhưng sai tiền | Không PAID, `review_required=true`, log error | 503 `SERVICE_UNAVAILABLE` chung (thanh toán đang được xem xét), không lộ chi tiết |
| Trễ | Order CANCELLED/FAILED, capture khớp | PAID + log `LATE_CAPTURE` + token | N/A |
| Bị từ chối | PayPal 422 declined | Order FAILED | 402 `PAYMENT_DECLINED` + lý do |
| Không tìm thấy | `paypalOrderId` lạ | Không gọi PayPal | 404 `NOT_FOUND` |
| GC | Token chưa hết hạn/chưa revoked/chưa hết lượt tham chiếu file | GC không xoá object của file đó | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration `20261009120000_download_tokens` -- `DownloadToken(id, order_id UNIQUE FK cascade, token UNIQUE, expires_at, max_downloads, used_downloads default 0, revoked_at null, created_at)`; `DownloadTokenFile(token_id, sheet_file_id)` (PK kép, FK file RESTRICT); FK `download_logs.token_id` → `download_tokens` (SET NULL). Theo mẫu `20261009100000_orders_site_settings`.
- `packages/shared/src/order.ts`, `errors.ts`, `index.ts` -- `captureOrderRequestSchema`, `captureOrderResponseSchema`, mã `PAYMENT_DECLINED`; `http-exception.filter.ts` thêm `DEFAULT_MESSAGE`.
- `commerce/payment-provider.ts`, `paypal.provider.ts` -- kiểu `CaptureResult` (status, captureId, amount, currency, payer); `capture` dùng `OrdersController.captureOrder` (`paypalRequestId`=orderCode), `getOrder`; map 422 declined.
- `commerce/order.repository.ts`, `order.service.ts` -- `findByPaypalOrderId`, `fulfil` trong `prisma.$transaction` (repository nhận `tx`); `captureOrder()`; `download-token.repository.ts` (chủ bảng token).
- `commerce/payments.controller.ts` -- `capture-order`; `settings.service.ts` -- `tokenDefaultDays()`, `tokenDefaultMaxDownloads()`.
- `catalog/sheet-file-gc.service.ts` (~L82) -- `hasLiveDownloadTokenReference(fileIds)` truy vấn token chưa hết hạn/chưa revoked/`used < max` qua `download_token_files`.
- Test: unit `order.service`/paypal provider, `sheet-enums.spec` không đổi, integration `capture-order.spec.ts` (fake provider, gọi đồng thời), GC spec.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- `download_tokens`, `download_token_files`, FK `token_id`
- [x] `packages/shared` + filter -- schema capture, `PAYMENT_DECLINED`; test
- [x] `payment-provider`/`paypal.provider` -- `capture`, `getOrder` có kiểu; test mock SDK
- [x] `commerce` -- repository/service `fulfil`, controller `capture-order`; test đơn vị và integration theo ma trận I/O
- [x] `sheet-file-gc.service.ts` -- hook token; test GC giữ file có token sống
- [x] README mục Story 3.4

**Acceptance Criteria:**
- Given hai `fulfil()` đồng thời, when xong, then đúng 1 `download_tokens` cho Order và cả hai response cùng token.
- Given capture lệch tiền, when fulfil, then Order không PAID và `review_required=true`.
- Given token chưa hết hạn tham chiếu file đã superseded quá 24 giờ, when GC chạy, then object không bị xoá.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **high | patch (đã sửa) — Order PAID kèm token rỗng/thiếu file khi file đã mua không còn hiện hành:** huỷ transaction bằng `MissingPurchasedFileError`, đặt `review_required`, log, 503 chung; test đơn vị.
- **medium | patch (đã sửa) — Cấu hình token khổng lồ làm tràn INT4 / Date không hợp lệ sau khi PayPal đã thu tiền:** `SettingsService` kẹp 3650 ngày / 1000 lượt; test đơn vị mọi biên.
- **medium | patch (đã sửa) — `paypalRequestId` cố định ở capture phát lại kết quả bị từ chối khi người mua đổi phương thức:** bỏ khỏi capture (PayPal đã idempotent bằng `ORDER_ALREADY_CAPTURED`).
- **low | patch (đã sửa) — Chỉ `INSTRUMENT_DECLINED` được coi là từ chối:** thêm `TRANSACTION_REFUSED`, `PAYER_CANNOT_PAY`, `PAYER_ACCOUNT_RESTRICTED`.
- **low | patch (đã sửa) — `downloadFileName`/giá trị cấu hình chưa có test; `padStart(5, '2')` gõ nhầm:** thêm `token-settings.spec.ts`, sửa thành `'0'`.
- **medium | defer — GC (catalog) xoá trực tiếp `download_token_files` của commerce bằng SQL thô; thiếu test tích hợp capture bundle nhiều type:** ghi vào `deferred-work.md`.
- **false — Ai biết `paypalOrderId` cũng lấy được token:** id do PayPal sinh, chỉ trình duyệt người mua và PayPal biết; spec yêu cầu khoá theo `paypalOrderId`.
- **false — Race GC giữa kiểm tra token sống và DELETE:** GC giữ `FOR UPDATE` trên Sheet và `fulfil` chỉ cấp file hiện hành, không bao giờ file superseded quá hạn.
- **false — Người mua đã trả bị 402 do race:** 402 chỉ khi PayPal báo DECLINED/FAILED, tức chưa thu tiền.
- **false — `items` null/hỏng:** `items` do chính `create-order` ghi, có schema.
- **low (rejected) — Token cũ trả về dù hết hạn/revoked khi gọi lại; capture PENDING trả 503 chung; chọn `captures[0]`; so chuỗi amount; hardcode trạng thái trong `markPaid`; thiếu index `download_logs.token_id`/`expires_at`; thông điệp `PAYMENT_DECLINED` cố định:** spec yêu cầu trả token đã có và 3.5 sẽ từ chối token hết hạn khi tải; webhook (3.8) xử lý PENDING; PayPal luôn trả chuỗi 2 chữ số cho USD; sửa cần thêm nhánh/bề mặt mới, không có tác hại cụ thể ở quy mô hiện tại.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test` -- expected: pass
- API unit + integration (Docker Postgres/SeaweedFS) -- expected: pass (CI chạy integration)
