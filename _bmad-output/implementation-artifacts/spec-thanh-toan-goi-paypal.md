---
title: 'Thanh toán gói thuê bao bằng PayPal, kích hoạt dùng chung cho VietQR (S3 thuê bao)'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '0297ed231a1031add9edef3228df14afe7a443e4'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** S2 đã có gói, dùng thử và paywall nhưng khách chưa mua được gói; nút "Chọn gói" là placeholder và gói chỉ cấp tay.

**Approach:** Khách đã đăng nhập mua gói bằng PayPal **trả trước theo kỳ** (một lần thanh toán = một kỳ `duration_days`), tái dùng hạ tầng PayPal Orders và nút PayPal hiện có. Bảng `subscription_payments` và `SubscriptionActivationService` (idempotent, nguyên tử) dùng chung để S4 (VietQR) chỉ cần thêm cách xác nhận tiền. Subscription chụp điều khoản (hạn mức) lúc kích hoạt để sửa gói về sau không ảnh hưởng người đã mua.

## Boundaries & Constraints

**Always:**
- Giá, tiền tệ và điều khoản lấy từ gói phía server lúc tạo đơn (USD cents của gói); client chỉ gửi `planId`. Gói phải đang bật và `priceUsdCents > 0`. Mua cần khách đã đăng nhập, còn hoạt động, đã xác minh email, và `payments_enabled=true` (nếu không 403 `PAYMENTS_DISABLED`). `subscriptions_enabled` không bắt buộc bật.
- Kích hoạt chỉ khi PayPal báo capture `COMPLETED` VÀ số tiền/tiền tệ khớp `subscription_payments`; lệch thì `review_required`, cảnh báo và 503, không kích hoạt.
- Kích hoạt idempotent: gọi lại, đồng thời, từ capture-order hoặc từ webhook đều chỉ kích hoạt một lần (khoá dòng payment và dòng khách). Capture lặp trả trạng thái hiện tại.
- Mua khi đang có gói ACTIVE còn hạn: **cùng gói → gia hạn** (`current_period_end` += `duration_days`, hạn mức cộng dồn, hoặc không giới hạn nếu một trong hai không giới hạn); **khác gói hoặc đã hết hạn → thay gói** (gói cũ `CANCELLED`, gói mới bắt đầu từ bây giờ). Luôn tối đa một ACTIVE.
- Entitlement và trừ lượt đọc hạn mức từ ảnh chụp trên Subscription (`subscriptions.download_quota`), không đọc từ `plans`; migration backfill cho bản ghi cũ, cấp tay cũng chụp.
- Webhook PayPal hiện có nhận ra đơn của gói (qua `custom_id`/order id → `subscription_payments`): `COMPLETED` → kích hoạt, `DENIED` → `FAILED` nếu còn PENDING, `REFUNDED` toàn phần → payment `REFUNDED` và Subscription do payment đó kích hoạt (nếu còn ACTIVE) sang `CANCELLED`; hoàn một phần chỉ cảnh báo. Đơn mua lẻ sheet giữ nguyên hành vi.
- Không log email, payload PayPal hay token; chỉ mã thanh toán. Rate limit 10/phút theo IP như luồng mua lẻ.
- Song ngữ vi/en; khách tiếng Việt vẫn thấy VND nhưng thanh toán PayPal tính bằng USD (ghi rõ trên modal); chỗ chọn phương thức sẵn cho S4.

**Never:**
- Không dùng PayPal Billing Subscriptions/tự gia hạn (ghi vào deferred); không làm VietQR (S4); không hoàn tiền gói từ admin (deferred); không đổi mua lẻ sheet, CSP, hay bật cưỡng chế mặc định.
- Không tin client về giá hay trạng thái; không kích hoạt từ trạng thái khác `COMPLETED`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo đơn | khách đã xác minh, gói bật, giá USD > 0 | 201 `{paymentCode, paypalOrderId}`, payment PENDING chụp điều khoản | Chưa đăng nhập 401; chưa xác minh 403; gói tắt/lạ 404; giá USD 0 400; tắt thanh toán 403; PayPal lỗi → FAILED + 503 |
| Capture thành công | PayPal COMPLETED, tiền khớp | 200 entitlement; payment PAID; Subscription ACTIVE `provider=PAYPAL` | N/A |
| Capture lặp / đồng thời | payment đã PAID | 200 entitlement hiện tại, không kích hoạt thêm | N/A |
| Mua cùng gói khi còn hạn | ACTIVE cùng gói | Gia hạn cộng `duration_days`, hạn mức cộng dồn | N/A |
| Mua gói khác | ACTIVE gói khác | Gói cũ CANCELLED, gói mới ACTIVE từ bây giờ | N/A |
| Bị từ chối | PayPal DECLINED | payment FAILED, không kích hoạt | 402 `PAYMENT_DECLINED` |
| Lệch tiền | capture ≠ payment | payment `review_required`, không kích hoạt | 503 + cảnh báo |
| Đơn của người khác | `paypalOrderId` thuộc khách khác/lạ | Không gọi PayPal | 404 |
| Webhook COMPLETED trước capture | event hợp lệ | Kích hoạt một lần, capture-order sau đó trả hiện trạng | N/A |
| Webhook REFUNDED toàn phần | payment PAID | payment REFUNDED; Subscription do nó kích hoạt → CANCELLED | Một phần: cảnh báo, giữ nguyên |
| Sửa gói sau khi mua | admin đổi `download_quota` | Subscription đang dùng giữ hạn mức đã chụp | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration `20261015100000_subscription_payments` -- enum `SubscriptionPaymentStatus`, bảng `subscription_payments`, cột `subscriptions.download_quota` (+ backfill từ `plans`).
- `apps/api/src/modules/billing/` -- thêm `subscription-payment.service.ts` (chủ bảng `subscription_payments`: tạo PENDING, đánh dấu FAILED/review, tìm theo mã/provider_ref, liệt kê cho admin), `subscription-activation.service.ts` (kích hoạt/gia hạn/thay gói, hoàn tiền → huỷ), cập nhật `entitlement.service.ts` (đọc hạn mức từ `subscriptions.download_quota`), `subscriptions.service.ts` (cấp tay chụp hạn mức), `billing.controller.ts` (`GET /admin/subscription-payments`).
- `apps/api/src/modules/commerce/` -- thêm `plan-payment.service.ts` + `plan-payments.controller.ts` (`POST /customer/subscriptions/paypal/create-order|capture-order`, dùng `PAYMENT_PROVIDER`), nối `webhook.service.ts` (nhận đơn gói), mẫu: `order.service.ts` (create/capture/fulfil/refund, `formatUsd`, cảnh báo).
- `apps/api/src/modules/customers/customer-access.service.ts` -- `requireDownloadAccess` (đang hoạt động + đã xác minh) dùng lại cho việc mua.
- `packages/shared/src/subscription.ts`, `errors.ts` -- schema create/capture gói, `subscriptionPaymentSchema` cho admin.
- `apps/admin/src/components/plans/` + `lib/api/plans.ts` -- bảng "Thanh toán gói" (chỉ đọc).
- `apps/web/src/components/pricing/` (nút chọn gói + modal thanh toán), `components/payment/payment-modal.tsx` (mẫu PayPal), `auth/auth-provider.tsx` (+`getToken`, `refreshEntitlement`), `lib/customer-api.ts`, `messages/{vi,en}.json`.
- `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/subscription.ts` -- schema tạo/capture đơn gói và danh sách thanh toán admin -- hợp đồng chung
- [x] `apps/api/prisma/schema.prisma` + migration -- bảng/cột/backfill -- nền dữ liệu
- [x] `apps/api/src/modules/billing/**` -- payment service, activation service, entitlement dùng ảnh chụp, cấp tay chụp, route admin
- [x] `apps/api/src/modules/commerce/**` -- PlanPaymentService + controller, nối webhook
- [x] `apps/api/test/**` -- unit (kích hoạt/gia hạn/thay gói, hạn mức cộng dồn), integration (create/capture với provider giả, idempotent/đồng thời, lệch tiền, declined, đơn người khác, webhook COMPLETED/DENIED/REFUNDED, quota đọc từ ảnh chụp, admin list)
- [x] `apps/admin/src/**` -- bảng thanh toán gói + test
- [x] `apps/web/src/**` -- modal thanh toán gói, nút chọn gói yêu cầu đăng nhập rồi quay lại, cập nhật entitlement, i18n + test
- [x] `README.md`, `deferred-work.md` -- tài liệu

**Acceptance Criteria:**
- Given khách đã đăng nhập, when chọn gói và thanh toán PayPal thành công, then Subscription ACTIVE, `/customer/entitlement` có gói và header cập nhật, tải theo gói.
- Given capture-order gọi hai lần hoặc song song với webhook, then chỉ một lần kích hoạt.
- Given admin sửa `download_quota` của gói sau khi khách mua, then hạn mức của khách không đổi.
- Given khách chưa đăng nhập bấm Chọn gói, when đăng nhập xong, then modal thanh toán gói đó tự mở.
- Mua lẻ sheet, test hiện có, lint, typecheck, build xanh; `midi-player-bundle` vẫn xanh.

## Implementation Notes

- Đã làm đủ theo spec: migration `20261015100000_subscription_payments` (bảng `subscription_payments`, cột `subscriptions.download_quota` + backfill, không drift), `SubscriptionPaymentService` + `SubscriptionActivationService` (billing), `PlanPaymentService` + `PlanPaymentsController` (commerce, dùng `PAYMENT_PROVIDER`), nối webhook, entitlement/trừ lượt đọc hạn mức chụp, cấp tay chụp hạn mức, admin bảng "Thanh toán gói", web nút Chọn gói + modal PayPal, README, deferred-work.
- Quyết định: PayPal trả trước theo kỳ (không Billing Subscriptions); mã thanh toán `PS-` để phân biệt đơn mua lẻ `PD-` và webhook dò theo `custom_id`; activation khoá dòng payment rồi dòng khách; bản ACTIVE quá hạn ghi `EXPIRED` ngay lúc kích hoạt mới (tránh vướng unique một phần); PayPal client id thiếu thì nút Chọn gói bị vô hiệu ghi "Sắp có".
- Bất ngờ: `commerce` phụ thuộc `billing` nên payment service nằm ở `commerce` (giữ `billing` không phụ thuộc `PAYMENT_PROVIDER`, tránh vòng); một số test integration (`catalog-taxonomy`, `sheet-views`, `sheet-files`, `public-sheets`) chập chờn khi chạy cả bộ nhưng pass khi chạy riêng.
- Kiểm tra: lint/typecheck/build xanh; shared 295, web 741, admin 210 test pass; API unit chỉ còn 6 lỗi sẵn của `backup-script` (macOS); API integration 554/556 trong lần chạy cả bộ (2 test chập chờn nói trên, pass khi chạy riêng).

## Spec Change Log

## Review Triage Log

Ba reviewer: Blind Hunter, Edge Case Hunter, Verification Gap.

- **patch (high)**: hoàn tiền một kỳ đã gia hạn thu hồi cả gói (cả ba reviewer) → `refund()` giờ chỉ rút ngắn `current_period_end` đúng `durationDays` và trừ hạn mức đã cộng dồn khi còn thanh toán PAID khác trên cùng Subscription; chỉ huỷ khi là khoản duy nhất hoặc hết hạn sau khi rút; có 2 test tích hợp.
- **patch (medium)**: cấp tay chụp `download_quota` không có test → thêm test cấp gói có hạn mức (200 rồi 402 `QUOTA_EXCEEDED`); capture muộn (DENIED rồi COMPLETED) không có test → thêm; kích hoạt gặp payment đã REFUNDED ném lỗi trần (500) → trả 404.
- **patch (medium)**: lệch số tiền gửi lại cảnh báo mỗi lần PayPal retry → chỉ cảnh báo ở lần đầu (`markReviewRequired` trả true khi vừa chuyển).
- **patch (medium)**: web: sau "chưa xác nhận được capture" nút PayPal vẫn bấm được (có thể trả tiền lần hai dù đã dặn đừng) → khoá nút PayPal; nút Chọn gói vô hiệu khi gói không có giá USD.
- **patch (low)**: bảng chữ cái mã `PS-` trùng ký tự `A` (không đều) → 32 ký tự khác nhau, có test; thêm CHECK DB: payment PAID luôn có `subscription_id` và `paid_at`; bảng thanh toán admin có dòng "Đang tải…".
- **reject**: cấp tay và kích hoạt đua nhau (grant đã khoá dòng khách `FOR UPDATE` từ review S2, thứ tự khoá không gây deadlock); throttle theo IP proxy (ThrottlerModule dùng `getClientIp()` toàn cục); `payments_enabled` dùng chung cho mua lẻ và gói, bán gói khi cưỡng chế tắt, `requireDownloadAccess` làm điều kiện mua (đều là quyết định thiết kế, ghi trong spec); capture cho khách bị khoá sau khi tạo đơn (tiền đã thu nên vẫn kích hoạt); capture trên payment FAILED vẫn gọi PayPal (cố ý, cho phép thử lại bằng cách trả khác).
- **defer**: webhook `REVERSED`/`CUSTOMER.DISPUTE.*` và cộng dồn nhiều lần hoàn một phần; dọn payment PENDING bỏ dở / `setProviderRef` lỗi sau khi PayPal tạo đơn (webhook theo `custom_id` vẫn cứu được); thay gói khác làm mất ngày còn lại (chưa cảnh báo trên modal, chưa tính tỉ lệ); email xác nhận/biên lai; hiển thị mã `PS-` cho khách khi cần hỗ trợ; công cụ "kiểm tra lại/capture lại" cho admin; phân trang, lọc `review_required` và mã PayPal trong bảng thanh toán admin; bỏ `wantsCheckout` khi khách đóng modal đăng nhập mà không đăng nhập; test migration backfill trên dữ liệu cũ; mã đơn mua lẻ `PD-` cũng có ký tự lặp (thiên lệch nhẹ).

## Design Notes

Tiền của `subscription_payments.amount` là đơn vị nhỏ nhất của `currency` (USD cents cho PayPal; VND nguyên cho VietQR ở S4). `provider_ref` unique: PayPal order id (S3) hoặc mã đối soát chuyển khoản (S4). Hạn mức chụp cộng dồn khi gia hạn: `null` nếu một trong hai là không giới hạn, ngược lại tổng hai hạn mức; `downloads_used_in_period` giữ nguyên nên khách mua thêm kỳ không mất lượt đã dùng nhưng được thêm hạn mức.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: không lỗi
- test shared/web/admin; API unit + integration (`POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test`, `set -a && . ./.env && set +a && unset NODE_ENV`) -- expected: pass (trừ 6 test `backup-script` lỗi sẵn trên macOS)

**Manual checks (if no CLI):**
- Với PayPal sandbox: bật thanh toán, mua một gói ở `/en/pricing` bằng tài khoản sandbox, xem header và quyền tải; thử webhook sandbox nếu đã cấu hình `PAYPAL_WEBHOOK_ID`.
