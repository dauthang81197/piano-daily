---
title: 'Story 3.9 — Tự huỷ đơn PENDING quá hạn'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'b010b6057f714d1765d108288f28db4dc2d5f5c9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Đơn người mua bỏ dở nằm PENDING mãi, làm bẩn dữ liệu đơn hàng; nhưng huỷ nhầm đơn đã thanh toán (webhook/capture bị lỡ) thì mất tiền của người mua.

**Approach:** Cron `@nestjs/schedule` mỗi giờ (module `commerce`) quét Order PENDING tạo quá 24 giờ. Với mỗi đơn hỏi PayPal qua `PaymentProvider.getOrder()`: capture đã COMPLETED thì `fulfil()`; chỉ khi PayPal cho thấy đơn chưa APPROVED (hoặc không còn tồn tại) mới chuyển CANCELLED; lỗi PayPal thì bỏ qua đơn đó ở lần này.

## Boundaries & Constraints

**Always:** Service `PendingOrderCleanupService` có `@Cron(CronExpression.EVERY_HOUR)` gọi `run(now)`; cờ `running` chặn chạy chồng (mẫu `SheetViewDedupeGcService`). Mỗi lần xử lý tối đa 100 đơn, cũ nhất trước. Chọn đơn `status = PENDING AND created_at < now - 24h`. `CaptureResult` thêm trường tuỳ chọn `orderStatus` (status của order PayPal, null nếu không có); `toCaptureResult` điền từ `order.status`. Quyết định theo từng đơn: (1) đơn chưa có `paypal_order_id` -> CANCELLED (client chưa từng nhận id nên không thể trả tiền); (2) `getOrder` ném `ProviderOrderNotFoundError` (adapter đổi lỗi HTTP 404 của PayPal thành lỗi này) -> CANCELLED; (3) `capture.status === 'COMPLETED'` -> `OrderService.fulfil()` (lỗi fulfil chỉ log cảnh báo, đơn giữ nguyên); (4) `orderStatus` thuộc `CREATED|SAVED|PAYER_ACTION_REQUIRED|VOIDED` -> CANCELLED; (5) mọi trường hợp khác (APPROVED, COMPLETED mà capture chưa COMPLETED, thiếu/lạ) -> bỏ qua; (6) `getOrder` ném lỗi khác (mạng, 5xx, thiếu cấu hình) -> bỏ qua, log cảnh báo. CANCELLED chỉ qua `OrderService.transition(id, 'CANCELLED')` (UPDATE có điều kiện PENDING); đơn đã đổi trạng thái giữa chừng thì không sao. Lỗi một đơn không dừng cả lượt. Log chỉ mã đơn + tên lỗi, không email, không payload PayPal. Đơn CANCELLED sau đó vẫn có thể thành PAID nếu thanh toán đến muộn (máy trạng thái hiện có).

**Never:** Không huỷ đơn khi chưa biết trạng thái PayPal (trừ đơn không có `paypal_order_id`); không huỷ đơn APPROVED; không đổi `Order.status` ngoài `OrderService`; không thêm API hay UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đơn mới < 24h | PENDING 1 giờ | Không đụng tới, không gọi PayPal | N/A |
| Bỏ dở | PENDING > 24h, PayPal CREATED | CANCELLED | N/A |
| Đã thanh toán nhưng lỡ | PENDING > 24h, capture COMPLETED | `fulfil()` -> PAID + token | lỗi fulfil: log, giữ PENDING |
| Đã approve chưa capture | PayPal APPROVED | Giữ PENDING | N/A |
| PayPal lỗi/timeout | `getOrder` ném | Giữ PENDING, log cảnh báo | tiếp đơn kế |
| PayPal không còn đơn | 404 | CANCELLED | N/A |
| Chưa có paypal_order_id | PENDING > 24h | CANCELLED, không gọi PayPal | N/A |
| Đơn không PENDING | PAID/FAILED quá 24h | Không đụng tới | N/A |
| Chạy chồng | `run` đang chạy | Lần gọi sau bỏ qua | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/commerce/payment-provider.ts` -- thêm `orderStatus?: string | null` vào `CaptureResult`, lớp `ProviderOrderNotFoundError`. `paypal.provider.ts` -- `toCaptureResult` điền `orderStatus`; `getOrder` bắt `statusCode === 404` ném `ProviderOrderNotFoundError` (xem `apiErrorIssues` để lấy `statusCode`).
- `apps/api/src/modules/commerce/order.repository.ts` -- `findStalePending(cutoff, limit)` trả `{id, orderCode, paypalOrderId}`.
- `apps/api/src/modules/commerce/pending-order-cleanup.service.ts` (mới) -- cron + `run(now)`; mẫu `catalog/sheet-view-dedupe-gc.service.ts`; dùng `OrderService.fulfil/transition`, `PAYMENT_PROVIDER`. Đăng ký provider trong `commerce.module.ts` (ScheduleModule đã `forRoot()` ở `app.module.ts`).
- Test: unit `test/unit/pending-order-cleanup.service.spec.ts` (mock) phủ ma trận; integration `test/integration/pending-order-cleanup.spec.ts` (Postgres, PAYMENT_PROVIDER giả, seed đơn cũ bằng `createdAt`) cho CANCELLED/fulfil/giữ nguyên; `paypal.provider.spec.ts` cho 404 và `orderStatus`.

## Tasks & Acceptance

**Execution:**
- [x] `CaptureResult.orderStatus`, `ProviderOrderNotFoundError`, adapter map 404; test
- [x] `OrderRepository.findStalePending`
- [x] `PendingOrderCleanupService` + đăng ký module; test đơn vị và integration theo ma trận

**Acceptance Criteria:**
- Given PENDING > 24h và PayPal báo CREATED, when cron chạy, then Order CANCELLED.
- Given PENDING > 24h và capture COMPLETED, when cron chạy, then Order PAID với đúng một token (không CANCELLED).
- Given `getOrder` lỗi hoặc order APPROVED, when cron chạy, then Order giữ PENDING.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Cron `@Cron` không có test đăng ký | medium | patch (đã sửa) | Thêm test metadata `SCHEDULE_CRON_OPTIONS` + `SchedulerRegistry` theo mẫu `sheet-files.spec.ts` |
| Ánh xạ `orderStatus` SDK chỉ test APPROVED | low | patch (đã sửa) | Thêm `it.each` CREATED/SAVED/PAYER_ACTION_REQUIRED/VOIDED trong `paypal.provider.spec.ts` |
| >100 đơn kẹt chiếm hết batch (đói đơn mới) | low | defer | Batch 100, cũ nhất trước nằm trong khối đóng băng; cần quy mô lớn mới gặp |
| fulfil lệch số tiền gọi `markReviewRequired` lặp mỗi giờ | low | defer | Đơn giữ PENDING, bị quét lại mỗi lượt |
| 404 do sai môi trường làm huỷ hàng loạt | false | reject | Sai credential trả 401; ID lạ vẫn là RESOURCE_NOT_FOUND nên guard không phân biệt được; quy tắc (2) do spec quy định |
| Đua getOrder -> CANCELLED | false | reject | Spec nêu rõ CANCELLED vẫn có thể thành PAID khi thanh toán đến muộn |
| ScheduleModule/transition có điều kiện không thấy trong diff | false | reject | `ScheduleModule.forRoot()` ở `app.module.ts:33`; `transition` là UPDATE có điều kiện (spec) |
| Nhiều instance / không timeout / thiếu metrics, alert, cấu hình | low | reject | Spec quy định cờ `running` theo mẫu có sẵn; sửa cần thêm cơ chế phức tạp, ít gặp |
| APPROVED/COMPLETED-chưa-capture kẹt mãi, không cảnh báo | low | reject | Đúng quy tắc (5) trong spec |
| transition lỗi do đua bị log warn | low | reject | Chỉ là nhiễu log |
| `let capture` kiểu any, thông điệp lỗi tiếng Việt | false | reject | TS suy kiểu theo luồng điều khiển; thông điệp cùng kiểu các lỗi khác |
| Thiếu test biên 24h, batch, 404 integration | low | reject | Ma trận đã phủ bằng unit test; thêm test không đổi hành vi |

## Verification

**Commands:**
- `typecheck`, `lint` -- expected: pass
- API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Với PayPal sandbox: tạo đơn rồi để quá hạn (hoặc hạ `created_at` trong DB), gọi `run()` và xem đơn bị huỷ; đơn đã approve nhưng chưa capture phải giữ nguyên.
