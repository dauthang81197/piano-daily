---
title: 'Thanh toán gói thuê bao bằng VietQR, đối soát tự động qua SePay (S4 thuê bao)'
type: 'feature'
created: '2026-10-14'
status: 'done'
baseline_commit: '864002eac0de8b898158177b723344ae18a1b67d'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sau S3 chỉ khách quốc tế mua được gói (PayPal, USD). Khách trong nước cần trả bằng chuyển khoản VND qua VietQR, và hệ thống phải tự biết tiền đã về để kích hoạt gói.

**Approach:** Khách tiếng Việt chọn VietQR trong modal mua gói; server tạo `subscription_payments` (provider `VIETQR`, VND) và trả ảnh QR + nội dung chuyển khoản gọn không dấu gạch. SePay gọi webhook khi tiền vào; server dò mã trong nội dung, so số tiền và kích hoạt qua `SubscriptionActivationService` dùng chung với S3. Admin có nút xác nhận thủ công khi khách ghi sai nội dung. Cấu hình SePay bằng biến môi trường tuỳ chọn nên code và test chạy được bằng webhook giả khi chưa có tài khoản SePay.

## Boundaries & Constraints

**Always:**
- Env tuỳ chọn: `SEPAY_API_KEY`, `SEPAY_BANK_ACCOUNT`, `SEPAY_BANK_NAME` (mã ngắn ngân hàng), `SEPAY_ACCOUNT_HOLDER` (tên hiển thị, tuỳ chọn). Thiếu API key hoặc tài khoản/ngân hàng thì VietQR không khả dụng: `create` trả 503, `GET /plans` có `vietqrEnabled=false` (web ẩn lựa chọn), webhook trả 503. Không bao giờ log API key, số tài khoản của khách hay nội dung chuyển khoản đầy đủ.
- Mã thanh toán `PS-XXXXXX` có dạng gọn `PSXXXXXX` (bỏ dấu gạch) làm **nội dung chuyển khoản** và `provider_ref` (unique). Đối soát: chuẩn hoá `code` rồi `content` (chữ hoa, bỏ mọi ký tự không phải chữ/số), dò `PS[A-Z0-9]{6}`, lần lượt từng ứng viên cho tới khi khớp một payment VIETQR.
- Tạo: khách đã đăng nhập, còn hoạt động, đã xác minh email, `payments_enabled=true`, gói đang bật và `priceVnd > 0`. Số tiền = `priceVnd` của gói lúc tạo (chụp trong payment). Tái dùng payment VIETQR PENDING cùng khách + cùng gói tạo trong 24 giờ qua (không sinh mã mới mỗi lần mở modal).
- Webhook `POST /webhooks/sepay`: xác thực `Authorization: Apikey <key>` bằng `safeEqual` (sai/thiếu → 401); ghi `payment_events` idempotent theo `sepay:<id>` (đã xử lý xong thì trả `{success:true}` ngay); chỉ xử lý `transferType='in'`; phản hồi thành công luôn là HTTP 200 `{"success": true}`; lỗi xử lý (DB…) trả 5xx để SePay gửi lại (tối đa 7 lần trong 5 giờ).
- Kết quả đối soát: không thấy mã hoặc không có payment → bỏ qua, vẫn `{success:true}`; payment `PAID`/`REFUNDED` → bỏ qua; `transferAmount == amount` → kích hoạt; `> amount` → kích hoạt và cảnh báo thừa tiền; `< amount` → `review_required` + cảnh báo, KHÔNG kích hoạt (tiền nằm đó để admin xử lý); payment `FAILED/CANCELLED` mà tiền đã về vẫn kích hoạt như capture muộn (có cảnh báo).
- Kích hoạt luôn qua `SubscriptionActivationService.activate()` (idempotent, cùng quy tắc gia hạn/thay gói như S3). Polling trạng thái chỉ trả của chính khách.
- Admin xác nhận thủ công: `POST /admin/subscription-payments/:id/confirm`, chỉ SUPER_ADMIN, chỉ payment `VIETQR` đang `PENDING`/`FAILED`; kích hoạt qua service dùng chung; ghi nhận vào log/cảnh báo ai xác nhận không cần; idempotent.
- Song ngữ vi/en; VietQR chỉ hiện cho khách tiếng Việt (PayPal vẫn là cách duy nhất cho khách quốc tế).

**Never:**
- Không hoàn tiền tự động VietQR (chuyển khoản hoàn bằng tay, đổi trạng thái qua admin là việc sau); không tích hợp ngân hàng/NAPAS trực tiếp; không đụng PayPal S3, mua lẻ sheet, CSP, cưỡng chế mặc định tắt.
- Không tin client về số tiền hay trạng thái; không kích hoạt khi chưa thấy tiền hoặc khi thiếu tiền; không trả lỗi 4xx cho giao dịch không liên quan (SePay sẽ retry vô ích).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo VietQR | khách hợp lệ, gói bật, giá VND > 0, SePay đã cấu hình | 201 `{paymentCode, transferContent: "PSXXXXXX", amount, currency:"VND", qrUrl, bankAccount, bankName, accountHolder}`, payment PENDING | Chưa cấu hình 503; chưa đăng nhập 401; chưa xác minh 403; gói tắt/lạ 404; giá VND 0 400; tắt thanh toán 403 |
| Mở lại trong 24 giờ | PENDING cùng khách + gói | Trả lại cùng mã, không tạo mới | N/A |
| Webhook đủ tiền | `in`, content chứa mã, amount = số tiền | payment PAID, Subscription ACTIVE `provider=VIETQR`; `{success:true}` | N/A |
| Mã dính chuỗi khác | content "CK PS-abc234 cam on" / "…PSABC234…" | Vẫn khớp sau chuẩn hoá | N/A |
| Webhook lặp | cùng `id` giao dịch | Không kích hoạt thêm; `{success:true}` | N/A |
| Thiếu tiền | amount < số tiền | `review_required`, cảnh báo, không kích hoạt | `{success:true}` |
| Thừa tiền | amount > số tiền | Kích hoạt + cảnh báo | N/A |
| Không có mã / giao dịch ra | content lạ hoặc `out` | Bỏ qua | `{success:true}` |
| Sai API key | header sai/thiếu | Không xử lý | 401 |
| Lỗi hệ thống | DB lỗi khi xử lý | Không đánh dấu đã xử lý | 5xx để SePay retry |
| Admin xác nhận | VIETQR PENDING | Kích hoạt như đã nhận tiền; gọi lại an toàn | Không phải VIETQR/đã PAID/REFUNDED: 409 hoặc trả hiện trạng |
| Polling | `GET …/payments/:code` của khách | `{status}` + `entitlement` khi PAID | Mã của khách khác/lạ 404 |

</frozen-after-approval>

## Code Map

- `apps/api/src/config/env.ts`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` -- 4 biến `SEPAY_*` tuỳ chọn.
- `apps/api/src/modules/billing/` -- thêm `sepay.service.ts` (chuẩn hoá nội dung, dò mã, dựng QR/URL, trạng thái cấu hình) hoặc đặt trong `commerce`; `subscription-payment.service.ts` (tìm VIETQR PENDING tái dùng, tạo với `provider_ref`), `subscription-activation.service.ts` (dùng nguyên), `billing.controller.ts` + `subscriptions.service.ts` (admin confirm), `plans.service.ts` (`vietqrEnabled` trong `GET /plans`).
- `apps/api/src/modules/commerce/` -- `plan-payment.service.ts` (+ `createVietqr`, `statusFor`), `plan-payments.controller.ts` (route VietQR + polling), `sepay-webhook.service.ts` + `webhooks.controller.ts` (`POST /webhooks/sepay`), mẫu: `webhook.service.ts`, `payment-event.repository.ts`, `common/safe-equal.ts`.
- `packages/shared/src/subscription.ts` -- schema create/status VietQR, `vietqrEnabled` trong `publicPlansResponseSchema`.
- `apps/admin/src/components/plans/payments-table.tsx` + `lib/api/plans.ts` -- nút "Xác nhận đã nhận tiền" cho VIETQR PENDING.
- `apps/web/src/components/pricing/plan-checkout.tsx`, `pricing-view.tsx`, `lib/customer-api.ts`, `messages/{vi,en}.json` -- chọn phương thức, panel QR + polling.
- `README.md`, `docs/`, `deferred-work.md` -- hướng dẫn cấu hình SePay.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/subscription.ts` -- schema VietQR và `vietqrEnabled` -- hợp đồng chung
- [x] `apps/api/src/config/env.ts`, `.env.example`, compose -- biến `SEPAY_*` -- cấu hình
- [x] `apps/api/src/modules/billing/**`, `commerce/**` -- tạo VietQR, polling, webhook SePay, admin confirm, `vietqrEnabled` -- nghiệp vụ
- [x] `apps/api/test/**` -- unit (chuẩn hoá/dò mã, dựng QR, so tiền) + integration (create/tái dùng, webhook đủ/thiếu/thừa tiền, lặp, không mã, sai key, key thiếu cấu hình, admin confirm, polling, quyền)
- [x] `apps/admin/src/**` -- nút xác nhận thủ công + test
- [x] `apps/web/src/**` -- chọn phương thức, panel QR + sao chép + polling + hết thời gian chờ, i18n + test
- [x] `README.md`, `docs/sepay.md` -- hướng dẫn SePay

**Acceptance Criteria:**
- Given khách tiếng Việt chọn VietQR, when SePay gửi webhook đủ tiền với nội dung chứa mã, then gói ACTIVE và modal tự báo thành công trong vài giây.
- Given cùng giao dịch SePay gửi lại, then chỉ kích hoạt một lần.
- Given chuyển thiếu tiền, then không kích hoạt và admin thấy "Cần xem xét".
- Given thiếu cấu hình SePay, then web không hiện VietQR và webhook trả 503.
- S3, mua lẻ sheet, lint, typecheck, build và các test cũ vẫn xanh.

## Implementation Notes

- Đã làm đủ theo spec: biến `SEPAY_*` (env, compose, `.env.example`), helper `billing/sepay.ts` (cấu hình, mã gọn, dựng URL QR, dò mã), `PlanPaymentService.createVietqr/paymentStatus`, `VietqrPaymentsController`, `SepayWebhookService` + `POST /webhooks/sepay`, `SubscriptionsService.confirmVietqr` + `POST /admin/subscription-payments/:id/confirm`, `vietqrEnabled` trong `GET /plans`, admin nút "Xác nhận đã nhận tiền", web `VietqrPanel` (QR, sao chép, polling) trong modal mua gói, `docs/sepay.md`, README, deferred-work.
- Quyết định: `provider_ref` của VietQR là mã gọn (`PSABC234`) nên webhook tra thẳng theo `providerRef`; tái dùng payment PENDING chỉ khi giá VND của gói không đổi; hết thời gian chờ ở web là 15 phút nhưng tiền về muộn vẫn kích hoạt; VietQR chỉ hiện cho locale vi.
- Bất ngờ: `AppModule` đọc env một lần cho mỗi file test nên trường hợp "chưa cấu hình SePay" nằm ở file riêng `vietqr-unconfigured.spec.ts`; tên menu SePay trong `docs/sepay.md` ghi là gợi ý vì chưa kiểm với giao diện thật; tài liệu SePay không nhất quán `qr.sepay.vn` / `vietqr.app` nên tên miền QR là hằng số `SEPAY_QR_BASE`.
- Kiểm tra: lint/typecheck/build xanh; shared 295, web 749, admin 213 test pass; API unit chỉ còn 6 lỗi sẵn của `backup-script` (macOS); API integration 579/579 pass.

## Spec Change Log

## Review Triage Log

Ba reviewer: Blind Hunter, Edge Case Hunter, Verification Gap.

- **patch (high)**: webhook không kiểm tài khoản nhận tiền (khoá SePay liên kết nhiều tài khoản) → bỏ qua giao dịch có `accountNumber` khác `SEPAY_BANK_ACCOUNT` (so sánh không phân biệt khoảng trắng/dấu gạch); có test.
- **patch (high)**: payload sai định dạng trả 400 trái nguyên tắc "không 4xx cho giao dịch SePay" (retry vô ích, lặp cảnh báo) → ép kiểu số dạng chuỗi, payload không đọc được thì log + cảnh báo và trả success; `AppException` 4xx khi kích hoạt (vd. payment vừa bị hoàn tiền) coi là đã xử lý, đánh dấu event và trả success; có test.
- **patch (medium)**: xác nhận thủ công: kiểm VIETQR trước nhánh `PAID` (PayPal đã PAID không còn trả 200); kích hoạt xoá `review_required` (không còn nhãn "Cần xem xét" trên payment đã xử lý); ghi log id admin + mã thanh toán; test REFUNDED/CANCELLED → 409, FAILED → 200.
- **patch (medium)**: hai lần mở modal đồng thời tạo hai payment PENDING → `findOrCreatePending` trong transaction có khoá advisory theo khách+gói+cách trả; polling nhận cả mã gọn lẫn mã có dấu gạch; ứng viên dò mã tối đa 10; có test.
- **patch (medium)**: web: polling dừng hẳn sau 15 phút (tiền về muộn không được báo) → hỏi tiếp thưa hơn (20 giây) và vẫn báo thành công; REFUNDED/CANCELLED hiện thông báo riêng; phiên hết hạn hiện thông báo; callback/token qua ref thay vì tắt cảnh báo phụ thuộc; bỏ kết quả tạo mã cũ khi đổi gói; có test.
- **patch (medium)**: admin: nút xác nhận hai bước (hỏi lại rồi "Chắc chắn"), khoá mọi nút khi đang xử lý; cấu hình SePay dở dang (có một vài biến) dừng khởi động với tên biến thiếu thay vì âm thầm tắt VietQR; nhập trùng import, `.env.example` đặt lại đúng chỗ.
- **reject**: CSP chặn ảnh QR (`img-src` đã có `https:`, reviewer xác nhận); webhook thiếu throttle (khoá bí mật, SePay cần gửi lại khi lỗi); thêm bảng audit cho xác nhận thủ công (đã có log id admin; bảng audit để sau); `ALTER TABLE … CHECK (false)` trong test gây xung đột (`fileParallelism=false`, luôn gỡ trong `finally`); bắt buộc bank name/account theo regex (URL QR đã mã hoá tham số).
- **defer**: cộng dồn nhiều lần chuyển thiếu cùng một mã (hiện cần admin xác nhận, đã ghi trong cảnh báo và docs); ghi số tiền thực nhận/mã tham chiếu ngân hàng cho từng giao dịch; thao tác admin hoàn tiền VietQR (REFUNDED + huỷ gói); panel giữ polling khi khách đổi sang PayPal hoặc đóng modal (gói vẫn tự kích hoạt và header cập nhật ở lần tải sau); reset trạng thái "đã sao chép" sau vài giây; job dọn payment PENDING; VietQR cho locale en.

## Design Notes

Webhook SePay trả lỗi 401 chỉ khi sai/thiếu API key; mọi giao dịch hợp lệ nhưng không liên quan tới mình vẫn trả `{success:true}` để SePay không retry. Số tiền VND lưu nguyên (không nhân chia). Nội dung chuyển khoản gọn `PSXXXXXX` khớp cấu hình "tiền tố mã thanh toán" `PS` của SePay; nếu cấu hình khác, đối soát vẫn tìm mã trong `content`.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: không lỗi
- test shared/web/admin; API unit + integration (`POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test`, `set -a && . ./.env && set +a && unset NODE_ENV`) -- expected: pass (trừ 6 test `backup-script` lỗi sẵn trên macOS)

**Manual checks (if no CLI):**
- Sau khi có tài khoản SePay: đặt 4 biến `SEPAY_*`, tạo webhook trỏ `https://api.<domain>/webhooks/sepay` kèm API Key, chuyển khoản thật số tiền nhỏ với nội dung `PSXXXXXX`.
