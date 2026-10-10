---
title: 'Story 4.3 — Hoàn tiền từ admin'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f3bf7bffd2882e9a0c087d924cbea5613b602e74'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-2-gui-lai-email-va-gia-han-token.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-3-8-webhook-paypal.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Muốn hoàn tiền cho người mua, founder phải đăng nhập PayPal riêng rồi chờ webhook; `PaypalProvider.refund()` hiện chỉ ném lỗi "chưa hỗ trợ".

**Approach:** Thêm nút "Hoàn tiền" (brass, xác nhận ngay trong trang) ở chi tiết đơn PAID: `commerce` gọi `PaymentProvider.refund()` hoàn toàn bộ capture, chỉ khi PayPal xác nhận mới chuyển Order sang REFUNDED và vô hiệu hoá token bằng `OrderService.refund()` sẵn có.

## Boundaries & Constraints

**Always:** Route `POST admin/orders/:id/refund` (không body, 200, trả chi tiết đơn đã làm mới như `GET admin/orders/:id`). Chỉ đơn PAID có `paypalCaptureId`; đơn không PAID -> 409 `ORDER_NOT_PAID`; PAID mà thiếu capture id -> 409 thông điệp rõ ràng; không tồn tại -> 404. Hoàn tiền toàn phần (không partial). Cổng `refund(captureId, requestId)` trả kết quả chuẩn hoá; adapter dùng `PaymentsController.refundCapturedPayment` của SDK PayPal (dùng chung Client với `OrdersController`), body rỗng, gửi `paypalRequestId` suy ra từ đơn (`refund-<orderCode>`) để bấm lại/retry an toàn. PayPal từ chối (422 hoặc lỗi nghiệp vụ) -> adapter ném `RefundRejectedError(reason)` với lý do lấy từ `details[].description`/`issue`/`message`; service trả 422 mã mới `REFUND_REJECTED` (thêm vào `ErrorCode` và `DEFAULT_MESSAGE`) kèm lý do trong `message`; Order giữ PAID, token không đổi. Lỗi mạng/5xx/thiếu cấu hình -> 503 `SERVICE_UNAVAILABLE`, Order giữ PAID. Issue `CAPTURE_FULLY_REFUNDED` coi như đã hoàn: hội tụ DB như thành công. Gọi PayPal ngoài mọi transaction DB; sau khi PayPal xác nhận gọi `OrderService.refund(id)` (đã điều kiện PAID -> REFUNDED, đặt `refunded_at`, vô hiệu token trong một transaction); nó trả false vì webhook thắng đua thì vẫn là thành công, không lỗi. Không đổi trạng thái trước khi PayPal xác nhận. Nếu PayPal thành công mà ghi DB lỗi: log mã đơn + tên lỗi và trả lỗi; webhook `PAYMENT.CAPTURE.REFUNDED` sẽ hội tụ. Admin hoàn tiền và webhook chạy trước/sau/đồng thời: Order chỉ REFUNDED một lần, `refunded_at` không đổi, doanh thu (đếm theo `refunded_at` null) không trừ hai lần. Người mua dùng lại token bị từ chối (410 `TOKEN_REVOKED`). Log chỉ mã đơn và tên lỗi, không email/payload/token PayPal. UI: nút "Hoàn tiền" `variant="secondary"` (brass), bấm lần một mở xác nhận ngay trong trang theo mẫu `taxonomy/delete-confirm.tsx` ("Xác nhận hoàn tiền" / "Huỷ", không `window.confirm`); lỗi hiện qua `FormError` với lý do PayPal; thành công cập nhật ngay chi tiết (REFUNDED, token đã vô hiệu); nút vô hiệu với lý do khi không PAID.

**Never:** Không partial refund; không sửa `OrderService.refund`, `markRefunded`, `revokeByOrder`, `dispatch`/`findOrder` của webhook; không khớp REFUNDED event theo `resource.id`; không đổi hành vi `capture()` (không gửi request id); không ghi `Order.status` ngoài `OrderService`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hoàn tiền thành công | PAID, PayPal xác nhận | REFUNDED, `refunded_at` đặt, token `revokedAt` đặt, token tải -> 410 | N/A |
| PayPal từ chối | 422 (vd `REFUND_NOT_ALLOWED`) | Order giữ PAID, token nguyên | 422 `REFUND_REJECTED` kèm lý do; `FormError` |
| Đã hoàn trên PayPal | `CAPTURE_FULLY_REFUNDED` | DB hội tụ REFUNDED | N/A |
| Lỗi mạng/5xx | `refund` ném | Order giữ PAID | 503 |
| Đơn không PAID | REFUNDED/PENDING/... | Không gọi PayPal | 409 `ORDER_NOT_PAID` |
| Thiếu capture id | PAID, `paypalCaptureId` null | Không gọi PayPal | 409 thông điệp rõ |
| Webhook đến sau | Admin đã hoàn | Webhook 200, không đổi `refunded_at` | N/A |
| Webhook đến trước | Order đã REFUNDED | Admin: 409 `ORDER_NOT_PAID`, không gọi PayPal | N/A |
| Đồng thời | Admin + webhook cùng lúc | Đúng một chuyển REFUNDED | N/A |
| Chưa đăng nhập / id lạ | N/A | N/A | 401 / 404 |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/commerce/payment-provider.ts` -- cổng `refund(captureId)` trả `unknown`; đổi thành `refund(captureId, requestId): Promise<RefundResult>`, thêm `RefundRejectedError(reason)` (mẫu `OrderAlreadyCapturedError`). Các fake `refund: vi.fn()` không vỡ.
- `apps/api/src/modules/commerce/paypal.provider.ts` -- `refund()` (~L104) đang ném `PaymentProviderNotSupportedError`; cài bằng `PaymentsController` lazy chung Client (mẫu `private controller()` L37-50); helper lấy lý do từ `result.details[].description/issue`, `result.message` (mở rộng cạnh `apiErrorIssues` L153); `CAPTURE_FULLY_REFUNDED` -> thành công.
- `apps/api/src/modules/commerce/order.service.ts` -- thêm `adminRefund(orderId)`: `orders.findById`, kiểm PAID/`paypalCaptureId` (`orderNotPaid()` từ `token.service.ts`), gọi provider ngoài transaction, rồi `this.refund(id)` (L266-275, giữ nguyên); ánh xạ lỗi theo `callProvider` (~L441).
- `apps/api/src/modules/commerce/admin-orders.service.ts`, `admin-orders.controller.ts` -- `@Post(':id/refund') @HttpCode(200)`; `await orderService.adminRefund(id); return this.get(id)` như `resendEmail` (L140-149).
- `packages/shared/src/errors.ts`, `apps/api/src/common/http-exception.filter.ts` -- mã `REFUND_REJECTED` + thông điệp mặc định (bảng exhaustive).
- `apps/admin/src/components/orders/order-actions.tsx`, `apps/admin/src/lib/api/orders.ts` -- nút, xác nhận inline (mẫu `delete-confirm.tsx`), `busy` thêm 'refund', `ordersApi.refund`; `actionErrorMessage` đã hiện `err.message`.
- Test: unit `paypal.provider.spec.ts` (SDK mock, ánh xạ lỗi), unit `order.service.spec.ts` (adminRefund); integration `admin-orders-actions.spec.ts` hoặc spec mới (Postgres, PAYMENT_PROVIDER giả, mẫu `webhook-paypal.spec.ts` L25/L198-216: thành công + 410, từ chối, không PAID, webhook trước/sau, `Promise.all` đồng thời); admin `orders.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `payment-provider.ts`, `paypal.provider.ts`, `errors.ts`, filter -- cài `refund` qua SDK, `RefundRejectedError`, mã `REFUND_REJECTED`, test
- [x] `order.service.ts`, `admin-orders.*` -- `adminRefund` + route, test đơn vị và integration (kể cả đua với webhook)
- [x] `apps/admin` -- nút Hoàn tiền (brass) + xác nhận inline + `FormError`, test

**Acceptance Criteria:**
- Given Order PAID, when founder bấm "Hoàn tiền" và xác nhận, then `commerce` gọi `PaymentProvider.refund()`, khi PayPal xác nhận Order thành REFUNDED với `refunded_at`, token bị vô hiệu và người mua dùng lại token bị từ chối.
- Given webhook `PAYMENT.CAPTURE.REFUNDED` đến sau hoặc trước khi admin hoàn tiền, when cả hai luồng chạy, then Order chỉ REFUNDED một lần, không lỗi, doanh thu không trừ hai lần (có test).
- Given PayPal từ chối refund, when hoàn tiền, then Order giữ PAID và admin thấy `form-error` với lý do PayPal trả về.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Refund PENDING được coi là đã hoàn: Order sang REFUNDED và thu hồi token trước khi tiền thực sự hoàn | high | patch (đã sửa) | Adapter chỉ chấp nhận `COMPLETED`; PENDING -> `RefundRejectedError` giữ PAID, webhook sẽ hội tụ; thiếu `status` -> lỗi hệ thống (503) |
| Không có test cho FAILED/CANCELLED/PENDING, 400/403/404, 401/409/5xx | high | patch (đã sửa) | Thêm `it.each` trong `paypal.provider.spec.ts` |
| 409 (xung đột tạm thời) bị hiện như "PayPal từ chối" | medium | patch (đã sửa) | Bỏ 409 khỏi nhóm lỗi nghiệp vụ, đi đường 503 |
| Double-click xác nhận gửi hai POST | low | patch (đã sửa) | `refund()` thoát sớm khi `busy`; server vẫn có `PayPal-Request-Id` |
| `refund()` trả false nhưng không có dấu vết | low | patch (đã sửa) | Log cảnh báo kèm mã đơn |
| Lý do PayPal không giới hạn độ dài | low | patch (đã sửa) | Cắt 300 ký tự |
| Request id cố định `refund-<mã đơn>` có thể phát lại kết quả từ chối cũ | maybe-false | defer | Chưa kiểm chứng hành vi lưu cache của PayPal với lần thất bại |
| Thiếu test DB lỗi sau khi PayPal đã hoàn, test đua chưa kiểm soát thứ tự | low | defer | Đường đã log và ném lại; webhook hội tụ |
| Đơn PAID thiếu capture id dùng mã `ORDER_NOT_PAID` | low | reject | Thông điệp tiếng Việt nêu rõ nguyên nhân |
| Chi tiết đơn không tải lại sau 409; thiếu `aria-describedby`; audit trail; `errorIssues` thiếu guard | low | reject | `isRefundBusinessError` đã chặn trước; còn lại ngoài intent |
| `PaymentProviderNotSupportedError` có thể thành mã chết | low | reject | Vẫn được export và dùng bởi test hiện có |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test shared, admin, API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Với PayPal sandbox: tạo đơn, capture, bấm Hoàn tiền ở admin; kiểm tra tiền hoàn trên PayPal, Order REFUNDED, link tải bị từ chối; thử lại một đơn đã hoàn từ PayPal.
