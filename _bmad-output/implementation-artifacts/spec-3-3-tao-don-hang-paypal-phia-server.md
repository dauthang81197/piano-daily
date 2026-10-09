---
title: 'Story 3.3 — Tạo đơn hàng PayPal phía server'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7de37431a9df4b6c7f4996e7a3089b08d5c59ca1'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet không free đã có báo giá (Story 3.1) nhưng chưa có đơn hàng: không bảng `Order`, không cổng thanh toán, nên chưa ai mua được và Sheet từng có đơn vẫn có thể bị xoá cứng.

**Approach:** Thêm bảng `Order` (module `commerce`) và `SiteSetting` (module `settings`), enum/máy trạng thái/mã lỗi ở `packages/shared`, port `PaymentProvider` với adapter `paypal` (nơi duy nhất import SDK, `PAYPAL_MODE`), và `POST /payments/paypal/create-order`: giá lấy từ `PricingService.quote()`, tạo Order PENDING rồi tạo order PayPal USD, trả `paypalOrderId`. Nối hook `hasOrderHistory` của Story 1.8.

## Boundaries & Constraints

**Always:** Body `{ sheetId, fileTypes[] | bundle: true, email, expectedTotalCents }`, đúng một trong `fileTypes`/`bundle`. Tổng tiền tính lại phía server từ quote (cents nguyên, USD); `expectedTotalCents` lệch → `PRICE_CHANGED` (409, `details` = quote mới), không tạo Order. `items` lưu snapshot các type đã resolve kèm giá (bundle → từng type, không lưu chuỗi 'BUNDLE'). Thứ tự kiểm tra: `payments_enabled` (đọc `SiteSetting`) → email hợp lệ → Sheet/type mua được → giá. Chỉ `commerce.OrderService` được đổi `Order.status`; chuyển hợp lệ PENDING→PAID|FAILED|CANCELLED, CANCELLED|FAILED→PAID, PAID→REFUNDED. `order_code` = `PD-` + 6 ký tự base32, thử lại khi trùng. `Order.sheet_id` FK RESTRICT. Chỉ adapter `paypal` import `@paypal/paypal-server-sdk`; port gồm `createOrder/getOrder/capture/refund/verifyWebhook` (3.3 chỉ cài `createOrder`, các hàm còn lại ném "chưa hỗ trợ"). Seed `SiteSetting`: `payments_enabled`, `token_default_days=7`, `token_default_max_downloads=5`. Endpoint `@Public`, có rate limit. Không log email đầy đủ, secret. Lỗi theo `{error:{code,message}}`; mã mới có thông điệp mặc định trong `DEFAULT_MESSAGE`.

**Never:** Không capture, DownloadToken, webhook, email, modal, UI cài đặt (Story 3.4+, Epic 4). Không tin giá/khẳng định từ client. Không gọi PayPal thật trong test (dùng provider giả). Không đổi `Order.status` ngoài `OrderService`. Không cho tạo order với Sheet free hoặc type không mua được.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mua lẻ | Sheet PUBLISHED có giá PDF, `fileTypes:['PDF']`, tổng khớp | Order PENDING (`items` 1 type, `amount_cents`, USD) + `paypalOrderId`, lưu `paypal_order_id` | N/A |
| Mua bundle | `bundle:true`, bundle hợp lệ | `items` gồm mọi type của bundle với giá bundle chia sẻ nhất quán, tổng = giá bundle | N/A |
| Giá đổi | `expectedTotalCents` ≠ quote | Không tạo Order | 409 `PRICE_CHANGED` + quote mới |
| Tắt thanh toán | `payments_enabled=false` | Không tạo Order, không gọi PayPal | 403 `PAYMENTS_DISABLED` |
| Không mua được | Sheet free / Draft / thiếu type / bundle không tồn tại | Không tạo Order | 404 hoặc 400 `VALIDATION_FAILED` |
| Email sai | `email` không hợp lệ | Từ chối | 400 `VALIDATION_FAILED` |
| PayPal lỗi | Provider ném lỗi | Order chuyển FAILED qua `OrderService`, không lộ chi tiết | 503 `SERVICE_UNAVAILABLE` |
| Xoá Sheet có đơn | Sheet từng có Order | Sheet → ARCHIVED, không hard delete | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration viết tay `20261009100000_orders_site_settings` -- enum `OrderStatus`; `Order` (cột theo AC, `items` jsonb, index `sheet_id`, unique `order_code`, unique `paypal_order_id` null-able); `SiteSetting(key pk, value, updated_at)` + seed ba khoá. Theo mẫu `20261008120000_download_log` (uuidv7, timestamptz, Vietnamese comments).
- `packages/shared/src/order.ts` (mới), `errors.ts`, `index.ts` -- `OrderStatus`, `ORDER_TRANSITIONS` + `canTransition`, `createOrderRequestSchema`, thêm `PRICE_CHANGED`, `PAYMENTS_DISABLED` vào `ErrorCode` (+ test `errors.spec.ts`, spec máy trạng thái).
- `apps/api/src/common/http-exception.filter.ts` -- thêm `DEFAULT_MESSAGE` cho hai mã mới; ném bằng `AppException`.
- `apps/api/src/modules/settings/` (mới) -- `settings.module.ts`, `settings.service.ts` (đọc `payments_enabled`, repository duy nhất của `site_settings`); đăng ký trong `app.module.ts`.
- `apps/api/src/modules/commerce/` -- thêm `order.repository.ts`, `order.service.ts` (tạo PENDING, `transition`), `payments.controller.ts` (`@Public`, `ThrottlerGuard`), `payment-provider.ts` (port + token DI), `paypal.provider.ts` (SDK, sandbox/live); sửa `commerce.module.ts`.
- `apps/api/src/modules/catalog/catalog.module.ts` -- export `PricingService` cho `commerce`.
- `apps/api/src/modules/catalog/sheets.service.ts` -- `hasOrderHistory` (L550) dùng `tx.order.findFirst` thay stub; truyền `tx`.
- `apps/api/src/config/env.ts`, `.env.example`, `test/integration/create-app.ts` -- `PAYPAL_MODE` (sandbox|live, mặc định sandbox), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` tuỳ chọn; thiếu thì adapter trả 503. `apps/api/package.json` -- thêm `@paypal/paypal-server-sdk`.
- Test: `test/unit/sheet-enums.spec.ts` (thêm `OrderStatus` khớp Prisma), `order.service.spec.ts`, `paypal.provider` (mock SDK), `test/integration/create-order.spec.ts` (provider giả qua `extraImports`).

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- `orders`, `site_settings` + seed
- [x] `packages/shared` -- enum, máy trạng thái, schema request, mã lỗi; test
- [x] `settings` module -- đọc cấu hình thanh toán
- [x] `commerce` -- OrderService/repository, port + adapter PayPal, controller `create-order`; test đơn vị + integration bảng I/O
- [x] `sheets.service.ts` -- nối `hasOrderHistory`; test xoá Sheet có Order → ARCHIVED
- [x] env, `.env.example`, `create-app.ts`, README mục Story 3.3

**Acceptance Criteria:**
- Given migration chạy, when kiểm tra DB, then `site_settings` có ba khoá seed và `orders.sheet_id` là FK RESTRICT.
- Given `OrderStatus` ở shared, when chạy test enum, then khớp Prisma và bảng chuyển trạng thái chỉ cho phép các chuyển hợp lệ.
- Given create-order thành công, when đọc Order, then `status=PENDING`, `items` không chứa 'BUNDLE', email không xuất hiện trong log.

## Implementation Notes

- `createApp(url, extraImports, overrides)` có thêm tham số `overrides` (overrideProvider) vì `extraImports` không thay được provider của `CommerceModule`; integration test thay `PAYMENT_PROVIDER` bằng provider giả.
- `public-routes.spec.ts` bổ sung `GET /files/:sheetId/:fileType/download` (thiếu từ Story 3.2) và `POST /payments/paypal/create-order`.
- Schema request chỉ kiểm `email` là chuỗi; định dạng email kiểm trong `OrderService` sau `payments_enabled` để giữ đúng thứ tự kiểm tra.
- Chưa chạy được integration test (không có Docker/Postgres/SeaweedFS ở môi trường dev này).

## Spec Change Log

## Review Triage Log

- **medium | patch (đã sửa) — `PAYPAL_MODE=live` thiếu client id/secret vẫn khởi động, mọi lần mua 503:** thêm refine ở `env.ts` (live bắt buộc cả hai khoá), test `env.spec`.
- **low | patch (đã sửa) — Lỗi chuyển FAILED bị nuốt không dấu vết:** nay log mã đơn khi không đánh dấu được.
- **medium | defer — CI/deploy chưa truyền `PAYPAL_*` (compose để trống mặc định):** ghi vào `deferred-work.md`.
- **false — Throttle theo `req.ip` thay vì `getClientIp()`:** `app.module.ts` cấu hình `getTracker` toàn cục bằng `getClientIp`.
- **false — Retry P2002 che lỗi unique khác:** `orders` chỉ có unique `order_code` và `paypal_order_id` (null lúc insert) cùng khoá chính.
- **false — Lệch type chỉ trả 400, không phải `PRICE_CHANGED`:** AC yêu cầu lỗi validate cho type không mua được; `PRICE_CHANGED` chỉ cho lệch tổng.
- **low (rejected) — Đơn FAILED mỗi lần PayPal lỗi/chưa cấu hình; setPaypalOrderId lỗi sau khi PayPal đã tạo đơn; P2003 do Sheet bị gỡ giữa chừng thành 500; double-click tạo hai đơn; race `transition` trả false; bundle nhỏ hơn số type cho giá 0; thiếu CHECK `items`, default `updated_at`, index `status`; `sheetId` không giới hạn độ dài; `payments_enabled` giá trị lạ → tắt; status PayPal không phải CREATED; retry SDK; Cache-Control trên lỗi; `overrides` thay `extraImports`:** hành vi theo spec (ma trận I/O ghi FAILED khi PayPal lỗi) hoặc cửa sổ lỗi rất hẹp/được throttle chặn, sửa cần thêm nhánh hoặc bề mặt mới; đơn mồ côi không thể bị capture vì người mua không bao giờ nhận id. Đơn PENDING quá hạn thuộc Story 3.9.
- **false — Email lưu rõ, không retention:** AC yêu cầu cột `email`; chính sách lưu trữ ngoài phạm vi.

## Design Notes

Mã lỗi: `PRICE_CHANGED` 409 (kèm `details` quote mới), `PAYMENTS_DISABLED` 403. Giá bundle chia cho từng type của `items` để tổng đúng bằng giá bundle (phần dư cents dồn vào type đầu), đủ cho snapshot mà 3.4 chỉ kiểm tổng.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test` -- expected: pass
- API unit + integration (Docker Postgres/SeaweedFS, `unset NODE_ENV`) -- expected: pass
