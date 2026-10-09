---
title: 'Story 3.8 — Webhook PayPal'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'a2206861b19a1266981806301e407b5e36642819'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nếu người mua đóng trình duyệt trước khi `capture-order` chạy, hoặc PayPal hoàn tiền/từ chối sau đó, hệ thống không biết: mất đơn đã trả tiền, token vẫn dùng được sau hoàn tiền.

**Approach:** Thêm `POST /webhooks/paypal` (`@Public`). Xác thực chữ ký bằng `PaymentProvider.verifyWebhook` (REST `verify-webhook-signature`, raw body, `PAYPAL_WEBHOOK_ID`), ghi `PaymentEvent` (UNIQUE `provider_event_id`) rồi xử lý: `PAYMENT.CAPTURE.COMPLETED` → `fulfil()`; `PAYMENT.CAPTURE.REFUNDED` → `refund()` (REFUNDED + thu hồi token); `PAYMENT.CAPTURE.DENIED` → Order PENDING sang FAILED. Mọi xử lý idempotent.

## Boundaries & Constraints

**Always:** Bật `rawBody: true` ở `main.ts` và `createApp` (test); controller đọc `req.rawBody`. Header PayPal lấy: `paypal-auth-algo`, `paypal-cert-url`, `paypal-transmission-id`, `paypal-transmission-sig`, `paypal-transmission-time`. Adapter `verifyWebhook` lấy OAuth token (`/v1/oauth2/token`, Basic client id:secret), gọi `POST /v1/notifications/verify-webhook-signature` (host sandbox/live theo `PAYPAL_MODE`), dựng body JSON giữ nguyên bytes của raw body trong `webhook_event`; chỉ `verification_status === 'SUCCESS'` mới là true. SDK không dùng cho phần này (SDK không có API đó); vẫn chỉ nằm trong `paypal.provider.ts`. `PAYPAL_WEBHOOK_ID` là biến môi trường mới, tuỳ chọn; thiếu thì webhook trả 503 (PayPal sẽ gửi lại) và log cảnh báo, không bỏ qua xác thực. Chữ ký sai hoặc thiếu header → 400 `VALIDATION_FAILED`, không ghi gì; lỗi gọi PayPal khi xác thực → 503. Body không phải JSON hoặc thiếu `id`/`event_type`/`resource` → 400 (sau xác thực). Migration `payment_events(id uuidv7, provider_event_id TEXT UNIQUE, type TEXT, payload JSONB, processed_at TIMESTAMPTZ NULL, created_at)`; model Prisma `PaymentEvent`; chỉ `commerce` ghi bảng. Insert event TRƯỚC khi xử lý; trùng `provider_event_id` mà đã `processed_at` → trả 200, không xử lý; trùng mà chưa processed (lần trước lỗi) → xử lý lại. Xử lý xong mới set `processed_at`; lỗi xử lý → 500/503 để PayPal gửi lại, `processed_at` giữ null. Tìm Order: theo `resource.supplementary_data.related_ids.order_id` (= `paypal_order_id`), nếu thiếu thì `resource.custom_id` (= `order_code`); không tìm thấy → log cảnh báo (không log payload), đánh dấu processed, 200. `COMPLETED`: dựng `CaptureResult` COMPLETED từ `resource` (id, amount.value, amount.currency_code) rồi gọi `OrderService.fulfil()` — email gửi trong `fulfil()` như capture; Order đã REFUNDED thì bỏ qua. `REFUNDED`: `OrderService.refund(orderId)`: một transaction UPDATE có điều kiện PAID→REFUNDED + `refunded_at`, đặt `revoked_at` cho DownloadToken; Order không phải PAID thì không làm gì. Hoàn tiền một phần cũng coi là REFUNDED (founder xử lý thủ công). `DENIED`: chỉ Order PENDING → FAILED qua `transition`; trạng thái khác giữ nguyên. Event type khác: lưu, processed, 200. Route không dùng `ThrottlerGuard`. Thêm route vào allowlist `public-routes.spec.ts`. Biến mới vào env (`env.ts`), `.env.example`, `docker-compose.yml`/`prod`, `create-app.ts`. Không log payload, email, token.

**Never:** Không xử lý event khi chữ ký chưa xác thực; không đổi `Order.status` ngoài `OrderService`; không tạo hai token cho cùng Order; không refund PayPal chủ động (admin ở Story 4.x); không ghi `PAYPAL_WEBHOOK_ID` vào log.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chữ ký sai | `verifyWebhook` false | 400, không có `PaymentEvent` | N/A |
| COMPLETED, chưa capture-order | Order PENDING | PAID + 1 token + 1 email, 200 | N/A |
| COMPLETED sau capture-order | Order đã PAID | Không token/email thứ hai, 200 | N/A |
| Cùng event gửi hai lần | `provider_event_id` trùng, đã processed | 200, không xử lý lại | N/A |
| Event trùng, lần trước lỗi | `processed_at` null | Xử lý lại | N/A |
| REFUNDED | Order PAID có token | REFUNDED, `refunded_at`, token `revoked_at`; tải bằng token → 410 `TOKEN_REVOKED` | N/A |
| DENIED | Order PENDING | FAILED | N/A |
| DENIED khi đã PAID | Order PAID | Giữ nguyên PAID | N/A |
| Order không tìm thấy | id lạ | 200, processed | log cảnh báo |
| Thiếu `PAYPAL_WEBHOOK_ID` | env trống | 503 | log cảnh báo |
| Amount lệch | COMPLETED khác Order | `review_required`, không PAID | 503 (PayPal gửi lại) |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/commerce/payment-provider.ts` -- `verifyWebhook` đã có trong port; giữ chữ ký. `paypal.provider.ts` -- cài `verifyWebhook` bằng `fetch`, đọc `PAYPAL_CLIENT_ID/SECRET/MODE/WEBHOOK_ID` từ ConfigService; gỡ khối `DECLINE_ISSUES` bị lặp ở đầu file.
- `apps/api/prisma/schema.prisma` + migration `20261009160000_payment_events` -- model `PaymentEvent` (`@@map("payment_events")`).
- `apps/api/src/modules/commerce/payment-event.repository.ts` (mới) -- `record(eventId, type, payload)` (INSERT ... ON CONFLICT DO NOTHING, trả `{ created, processedAt }`), `markProcessed`.
- `apps/api/src/modules/commerce/webhooks.controller.ts` + `webhook.service.ts` (mới) -- verify → record → dispatch; dùng `OrderService`.
- `order.service.ts` -- thêm `refund(orderId)` và `failIfPending(orderId)`; `order.repository.ts` -- `findByOrderCode`, `markRefunded(tx, id)`; `download-token.repository.ts` -- `revokeByOrder(tx, orderId)`.
- `commerce.module.ts` -- đăng ký controller/service/repository. `main.ts`, `test/integration/create-app.ts` -- `rawBody: true`.
- `config/env.ts`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` -- `PAYPAL_WEBHOOK_ID`.
- Test: unit `paypal.provider.spec.ts` (verifyWebhook, mock fetch), `webhook.service` (dispatch); integration `webhook-paypal.spec.ts` (PAYMENT_PROVIDER giả qua overrides, EMAIL_PORT giả); `public-routes.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] migration + model `PaymentEvent`, `PaymentEventRepository`
- [x] `PaypalProvider.verifyWebhook`, env `PAYPAL_WEBHOOK_ID`, `rawBody: true`
- [x] `OrderService.refund` / `failIfPending`, repository/ token revoke
- [x] `WebhooksController` + `WebhookService`, đăng ký module, allowlist public
- [x] env/compose/`.env.example`, test đơn vị và integration theo ma trận

**Acceptance Criteria:**
- Given chữ ký sai, when POST `/webhooks/paypal`, then 400 và không có bản ghi `payment_events`.
- Given event COMPLETED gửi hai lần (và cả capture-order), when xử lý, then đúng một token và một email.
- Given event REFUNDED, when xử lý, then Order REFUNDED, token bị thu hồi và tải lại bị từ chối.
- Given event DENIED cho Order PENDING, when xử lý, then Order FAILED.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **medium | patch (đã sửa) — `REFUNDED` đến trước `COMPLETED` (PayPal không đảm bảo thứ tự): hoàn tiền no-op, event bị đánh dấu processed, sau đó `COMPLETED` cấp PAID + token cho khoản đã hoàn:** nay `dispatch` ném 503 khi Order chưa PAID/REFUNDED để PayPal gửi lại sau khi đơn PAID; test đơn vị và integration.
- **medium | patch (đã sửa) — `rawBody: true` đặt riêng ở `main.ts` và `create-app.ts`, bỏ một nơi thì CI vẫn xanh mà production 400 mọi webhook:** gom thành `APP_OPTIONS` trong `bootstrap.ts`, cả hai dùng chung.
- **medium | defer — Mỗi webhook (kể cả chữ ký giả từ người lạ) gọi 2 request tới PayPal (OAuth + verify), không cache token, không giới hạn:** ghi vào `deferred-work.md`.
- **low | defer — `payment_events.payload` lưu vô hạn, có thể chứa tên/email người trả:** ghi vào `deferred-work.md` (cần job dọn).
- **false — COMPLETED đến trước khi lưu `paypal_order_id` thì bị bỏ:** capture chỉ xảy ra sau khi người mua duyệt đơn đã lưu id; resource còn có `custom_id` để dò theo mã đơn.
- **false — Số tiền định dạng khác ("4.9"):** PayPal luôn trả chuỗi 2 chữ số thập phân, cùng định dạng `formatUsd`.
- **false — `rawBody.toString('utf8')` làm lệch bytes:** body PayPal là JSON UTF-8 hợp lệ nên giải mã không mất mát.
- **false — `failIfPending` lách `canTransition`:** PENDING→FAILED nằm trong bảng; UPDATE có điều kiện `status = PENDING`.
- **rejected (theo spec) — Hoàn một phần coi như REFUNDED, amount lệch trả 503 mãi, DENIED rồi COMPLETED chạy LATE_CAPTURE:** đã chốt trong spec/Story 3.4.
- **low (rejected) — Trùng lặp song song (fulfil/refund đã là UPDATE có điều kiện), 404 hiếm khi race REFUNDED, `record()`/`markProcessed` ném 500 thay 503 (PayPal đều gửi lại), `\u0000` trong payload, parse JSON hai lần, `findByOrderCode` không nhận tx, body không JSON gây 503 thay 400, `rawBody` toàn app, đối chiếu capture id/số tiền hoàn một phần, test thiếu cho `custom_id` fallback:** không có tác hại cụ thể ở quy mô hiện tại hoặc cần thêm nhánh/bề mặt mới.

## Verification

**Commands:**
- `typecheck`, `lint` -- expected: pass
- API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- PayPal sandbox: tạo webhook trỏ tới route `POST /webhooks/paypal` của API (URL công khai theo reverse proxy) (sự kiện PAYMENT.CAPTURE.*), lấy Webhook ID đặt vào `PAYPAL_WEBHOOK_ID`; dùng Webhooks Simulator/đơn sandbox thật để xác nhận chữ ký hợp lệ.
