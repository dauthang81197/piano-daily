---
title: 'Story 3.7 — Email link tải và mua lại cùng email'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ed1d4a5656994de24501da8e0f5011c14864a449'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người mua chỉ thấy link tải một lần trên màn hình; mất link hoặc capture lỗi giữa chừng thì không lấy lại được, và mua lại cùng bài bằng cùng email sẽ bị tính tiền lần hai.

**Approach:** Thêm module `notify` (`EmailPort` + adapter Resend). Sau khi Order PAID và transaction commit, gửi email link tải theo locale lần mua; lỗi gửi chỉ log. `create-order` phát hiện cùng email đã có đơn PAID còn token sống bao phủ các type yêu cầu thì không tạo đơn, gửi lại email (giới hạn theo email) và trả `ALREADY_PURCHASED`; modal hiện thông báo tương ứng.

## Boundaries & Constraints

**Always:** `EmailPort.send({to, subject, html, text})` là cổng duy nhất; adapter `ResendEmailAdapter` gọi REST `https://api.resend.com/emails` bằng `fetch` (Bearer `RESEND_API_KEY`, `from` = `EMAIL_FROM`), không thêm SDK. Thiếu `RESEND_API_KEY`/`EMAIL_FROM` thì adapter chỉ log cảnh báo và bỏ qua, không ném lỗi. `Order` thêm cột `locale` (`vi`|`en`, nullable, mặc định `vi`) từ `createOrderRequestSchema.locale` (optional); web gửi locale hiện tại. Email chứa mã đơn, tên bài, link `{SITE_URL}/{locale}/downloads/{token}` (`SITE_URL` mới, tuỳ chọn, mặc định `CORS_WEB_ORIGIN`), nội dung vi/en trang trọng, không emoji, không chi tiết thẻ. Chỉ lần `fulfil()` thắng (có token vừa cấp) mới gửi, sau commit, không chặn response; gửi thành công mới set `email_sent_at` (UPDATE `WHERE email_sent_at IS NULL`). Lỗi Resend: chỉ log tên lỗi + mã đơn (không email đầy đủ, không token), `email_sent_at` giữ null, thanh toán không đổi. `create-order`: sau khi qua kiểm tra `payments_enabled`, email, quote, `expectedTotalCents` và trước khi tạo Order, tìm đơn PAID cùng `email` (chữ thường) và `sheet_id` có token chưa revoked, chưa hết hạn, còn lượt, mà file của token bao phủ mọi type yêu cầu → ném 409 `ALREADY_PURCHASED` (response không có token), gửi lại email link tải. Gửi lại bị giới hạn tối đa 3 lần/giờ cho mỗi email (khoá băm, bộ nhớ trong tiến trình); vượt → 429 `TOO_MANY_REQUESTS`, không gửi. Không đủ điều kiện (token hết hạn/hết lượt/thiếu type) thì tạo đơn mới như thường. Modal: `ALREADY_PURCHASED` hiện thông báo kiểu thành công (`role="status"`, không phải `form-error`) "Bạn đã mua bài này — chúng tôi đã gửi lại link tải vào email." (EN tương ứng), không điều hướng, không mở PayPal. Biến mới `RESEND_API_KEY`, `EMAIL_FROM`, `SITE_URL` vào env, `.env.example`, compose (cả prod nếu có), `create-app.ts`.

**Never:** Không webhook, không UI admin gửi lại email (Story 4.2), không trả token qua `ALREADY_PURCHASED`, không log email đầy đủ/token, không để lỗi email rollback hay chặn thanh toán, không SDK Resend.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gửi sau PAID | capture thành công | 1 email (đúng locale, link token), `email_sent_at` được set | N/A |
| Resend lỗi | adapter ném lỗi | Order vẫn PAID, `email_sent_at` null, chỉ log | log lỗi |
| Chưa cấu hình Resend | thiếu API key | Bỏ qua gửi, thanh toán bình thường | log cảnh báo |
| Gọi capture lại | Order đã PAID | Không gửi email thứ hai | N/A |
| Mua lại cùng email | PAID + token sống bao phủ type | Không tạo Order, gửi lại email | 409 `ALREADY_PURCHASED`, không token |
| Token không bao phủ | Đã mua PDF, giờ mua MP3 | Tạo Order mới bình thường | N/A |
| Token hết hạn/hết lượt | Đơn PAID nhưng token chết | Tạo Order mới | N/A |
| Gửi lại quá hạn mức | > 3 lần/giờ cùng email | Không gửi | 429 `TOO_MANY_REQUESTS` |
| Modal nhận ALREADY_PURCHASED | 409 | Thông báo trạng thái, không điều hướng | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/notify/` (mới) -- `notify.module.ts` (export `EMAIL_PORT`), `email-port.ts` (Symbol + interface), `resend-email.adapter.ts` (fetch, ConfigService), mẫu DI như `payment-provider.ts`/`paypal.provider.ts`; đăng ký trong `app.module.ts`, import vào `commerce.module.ts`.
- `apps/api/prisma/schema.prisma` + migration `20261009140000_order_locale` -- `orders.locale`; `packages/shared/src/order.ts` -- `locale` optional trong `createOrderRequestSchema`; `errors.ts` -- `ALREADY_PURCHASED`; `http-exception.filter.ts` -- `DEFAULT_MESSAGE`.
- `apps/api/src/modules/commerce/order.service.ts` -- chèn kiểm tra đã mua sau kiểm tra giá (~L125) và gửi email sau `grantInTransaction` (nhánh `granted`); không gửi ở `existingFulfilment`/race-loser; `order.repository.ts` -- mở rộng `ORDER_FOR_CAPTURE` (email, locale, sheet title), `setEmailSentAt`, `findPaidByEmailAndSheet`; `download-token.repository.ts` -- tái dùng `tokenStatus`, `findByOrderId`.
- `apps/api/src/modules/commerce/download-email.ts` (mới) -- dựng subject/html/text vi/en; bộ giới hạn gửi lại theo email trong service.
- `apps/api/src/config/env.ts`, `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml`, `test/integration/create-app.ts`, `test/unit/env.spec.ts` -- biến mới.
- `apps/web/src/components/payment/payment-modal.tsx`, `lib/public-api.ts`, `messages/vi.json`, `en.json` -- gửi `locale` (`useLocale`), thông báo `ALREADY_PURCHASED` dạng trạng thái; test `payment-modal.test.tsx`.
- Test: unit `order.service.spec.ts` + adapter + template; integration `email-purchase.spec.ts` (EMAIL_PORT giả qua overrides, seed đơn PAID + token).

## Tasks & Acceptance

**Execution:**
- [x] `notify` module -- port + adapter Resend + template; test
- [x] migration `orders.locale`, `shared` (locale, `ALREADY_PURCHASED`), filter
- [x] `commerce` -- gửi sau fulfil, `setEmailSentAt`, kiểm tra đã mua + giới hạn gửi lại; test đơn vị và integration theo ma trận
- [x] env, `.env.example`, compose, `create-app.ts`
- [x] `web` -- locale trong request, thông báo `ALREADY_PURCHASED`, messages vi/en; test
- [x] README mục Story 3.7

**Acceptance Criteria:**
- Given Resend ném lỗi sau khi PAID, when capture, then response 200 vẫn có token và `email_sent_at` null.
- Given cùng email đã có token sống bao phủ type, when create-order, then không có Order mới và response 409 không chứa token.
- Given `fulfil()` chạy đồng thời, when xong, then đúng một email được gửi.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **medium | patch (đã sửa) — Gửi lại email không đi (Resend lỗi hoặc chưa cấu hình) vẫn trả `ALREADY_PURCHASED` "đã gửi lại" và trừ lượt gửi:** nay trả 503 chung và hoàn lượt; test đơn vị cho cả hai trường hợp.
- **low | patch (đã sửa) — Thông báo `ALREADY_PURCHASED` vẫn hiện sau khi đổi email hoặc lựa chọn file:** xoá thông báo khi đổi email/chọn file.
- **medium | defer — Email sau thanh toán chỉ gửi một lần (fire-and-forget), không có thử lại hay job quét đơn PAID có `email_sent_at` null; `ALREADY_PURCHASED` lộ việc một email đã mua Sheet (đúng theo AC) và có thể bị dùng để gửi email dồn cho người mua; bộ đếm gửi lại nằm trong bộ nhớ tiến trình:** ghi vào `deferred-work.md`.
- **false — 429 `TOO_MANY_REQUESTS` không có thông điệp riêng ở modal:** `errorKeyOf` đã ánh xạ sang `tooMany`.
- **false — Race `markPaid` và kiểm tra mua lại tạo hai đơn:** kiểm tra chỉ áp cho đơn đã PAID theo AC; đơn PENDING song song là hành vi có từ Story 3.3.
- **low (rejected) — Union type qua nhiều đơn, cap 20 đơn/N+1 trong `findCoveringPurchase`, `locale` nullable, CRLF trong tiêu đề ở phần text, lỗi `setEmailSentAt` chưa xử lý, timeout 10s chờ trong request resend, thiếu cảnh báo khởi động khi chưa cấu hình Resend, Reply-To/hạn dùng trong email, `SITE_URL` prod dựa `SITE_HOST`:** không có tác hại cụ thể ở quy mô hiện tại hoặc cần thêm nhánh/bề mặt mới, spec không yêu cầu.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test`, `--filter @piano-daily/web test` -- expected: pass
- API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Gửi thật qua Resend cần domain đã xác minh và `RESEND_API_KEY`; kiểm tra email nhận được và link mở đúng trang tải.
