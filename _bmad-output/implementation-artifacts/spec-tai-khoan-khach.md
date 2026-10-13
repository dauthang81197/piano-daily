---
title: 'Tài khoản khách: đăng ký, đăng nhập Google/email, bắt buộc đăng nhập để tải (S1 thuê bao)'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_commit: '0ed3805c307349f44e4d2c7c3a7be34f60172800'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Web công khai không có tài khoản người dùng; mọi người tải sheet miễn phí ẩn danh (`GET /files/:id/:type/download`). Không thể giới hạn dùng thử 7 ngày / 2 lượt tải hay bán thuê bao (S2–S4) khi chưa biết khách là ai.

**Approach:** Thêm model `Customer` tách hẳn khỏi `User` admin, với đăng ký email + mật khẩu (xác minh email) và đăng nhập Google. Xem sheet/player vẫn công khai; tải file sheet miễn phí phải đăng nhập và đã xác minh email, qua endpoint API mới trả signed URL (thay đường tải ẩn danh cũ). Mua lẻ từng sheet bằng PayPal + email giữ nguyên. Chưa có quota/gói/thanh toán thuê bao (S2–S6).

## Boundaries & Constraints

**Always:**
- `Customer` là bảng riêng, không thêm vào enum `Role`; token khách không bao giờ qua được `JwtAuthGuard` của admin (token khách không có `role`, có claim `typ: 'customer'`), và token admin không qua được guard khách.
- Mật khẩu hash bằng `PasswordService` (bcrypt) sẵn có; tối thiểu 8 ký tự, ≤ 72 byte UTF-8. Email lưu chữ thường, không bao giờ ghi vào log.
- Không lộ tồn tại tài khoản: đăng ký email đã có, quên mật khẩu email lạ, đăng nhập sai đều trả phản hồi/độ trễ không phân biệt; login luôn chạy bcrypt.
- Token xác minh email (24 giờ) và đặt lại mật khẩu (1 giờ): 32 byte ngẫu nhiên, DB chỉ lưu sha256, dùng một lần; đặt lại mật khẩu thu hồi mọi refresh token của khách.
- Refresh token khách xoay vòng như admin (bảng riêng), cookie `customer_refresh` `HttpOnly; Secure; SameSite=Strict; Path=/customer`; access token sống 15 phút và chỉ giữ trong bộ nhớ trình duyệt.
- Google: client gửi `idToken` (Google Identity Services); server xác minh chữ ký/audience bằng `GOOGLE_CLIENT_ID`; chỉ chấp nhận `email_verified`; email trùng khách đã có thì liên kết vào tài khoản đó. Thiếu `GOOGLE_CLIENT_ID` → endpoint trả 503 và web ẩn nút Google, phần email vẫn chạy.
- Tải file phải: đã đăng nhập, `emailVerifiedAt` khác null, tài khoản `isActive`; vẫn ghi `DownloadLog` (kèm `customerId`) TRƯỚC khi phát signed URL, vẫn rate limit và `Cache-Control: no-store`.
- Rate limit đăng ký/đăng nhập/quên mật khẩu/gửi lại xác minh bằng `ThrottlerGuard` theo `getClientIp()`.
- Web song ngữ vi/en (next-intl), modal truy cập được (focus trap, trả focus), lỗi hiển thị rõ.

**Never:**
- Không làm quota, dùng thử, gói, paywall, thanh toán VietQR/PayPal thuê bao (S2–S6); không gắn khách vào `Order` hay `DownloadToken` (mua lẻ giữ nguyên bằng email + token).
- Không dùng SMS, không đăng nhập Facebook/Apple, không nhớ mật khẩu ở localStorage, không lưu access token ở localStorage/cookie.
- Không nới CSP ngoài domain Google Identity (`accounts.google.com`) cho script/frame/connect/style.
- Không xoá hay đổi hành vi auth admin; không tải file trả phí qua endpoint mới.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đăng ký email | email mới + mật khẩu hợp lệ | 202, tạo Customer chưa xác minh, gửi email xác minh | Email đã tồn tại: vẫn 202, không tạo mới (gửi email thông báo/đặt lại cho chủ tài khoản) |
| Xác minh email | token đúng, chưa hết hạn | `emailVerifiedAt` = now, token bị dùng; đăng nhập được | Token sai/hết hạn/đã dùng: 400 `INVALID_TOKEN` |
| Đăng nhập email | đúng email + mật khẩu, đã xác minh | 200, access token + cookie refresh | Sai/không tồn tại/bị khoá: 401 `INVALID_CREDENTIALS`; chưa xác minh: 403 `EMAIL_NOT_VERIFIED` (chỉ sau khi mật khẩu đúng) |
| Đăng nhập Google | idToken hợp lệ, email_verified | Tạo mới (đã xác minh) hoặc liên kết khách cùng email, 200 | idToken sai/hết hạn/không verified: 401; chưa cấu hình: 503 |
| Quên/đặt lại mật khẩu | email bất kỳ → 204; token + mật khẩu mới | Gửi email nếu tồn tại; đặt lại thu hồi refresh token | Token sai: 400 `INVALID_TOKEN` |
| Tải sheet free | access token khách đã xác minh, Sheet free PUBLISHED | `POST /customer/downloads/:sheetId/:type` → `{url}` (signed URL 5 phút), log kèm `customerId` | Không đăng nhập: 401; chưa xác minh: 403 `EMAIL_NOT_VERIFIED`; sheet không free/thiếu file: 404 |
| Route cũ | `GET /files/:sheetId/:type/download` | Không còn tải ẩn danh | Trả 404 (route gỡ) |
| Refresh/đăng xuất | cookie refresh hợp lệ | Xoay token mới / thu hồi + xoá cookie | Cookie sai/hết hạn/đã thu hồi: 401 và xoá cookie |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration viết tay mới `20261013100000_customers` -- thêm `Customer`, `CustomerRefreshToken`, `CustomerToken` (purpose `VERIFY_EMAIL|RESET_PASSWORD`), `DownloadLog.customerId` (nullable, FK SET NULL, index).
- `apps/api/src/modules/identity/*` -- mẫu cần theo: `auth.service.ts` (session/bcrypt cân thời gian), `refresh-token.service.ts` (xoay vòng), `auth.controller.ts` (cookie), `jwt-auth.guard.ts` (deny-by-default, `@Public()`), `password.service.ts`.
- `apps/api/src/modules/customers/` (mới, module chủ bảng Customer*) -- `customer-auth.controller/service`, `customer-refresh-token.service`, `customer-token.service`, `google-verifier.service`, `customer-auth.guard.ts`, `current-customer.decorator.ts`, `customers.module.ts`; đăng ký vào `app.module.ts`.
- `apps/api/src/modules/commerce/downloads.{controller,service}.ts`, `download-log.repository.ts` -- gỡ route GET ẩn danh; thêm `POST /customer/downloads/:sheetId/:fileType` (dùng lại `FreeDownloadSource`, `ipHash`, `StorageService`, `recordFree` + `customerId`).
- `apps/api/src/modules/notify/email-port.ts` (`EMAIL_PORT`, `EmailMessage`) -- gửi email xác minh/đặt lại, mẫu `commerce/download-email.ts` (vi/en).
- `apps/api/src/bootstrap.ts` -- CORS: origin web được `credentials: true` (cookie `customer_refresh` chỉ đặt/đọc ở path `/customer`); cập nhật `test/integration/cors.spec.ts`.
- `apps/api/src/config/env.ts` -- thêm `GOOGLE_CLIENT_ID` (tuỳ chọn); `.env.example`, `docker-compose*.yml`, workflow ci-cd nếu liệt kê biến.
- `packages/shared/src/customer-auth.ts` (mới) + `errors.ts` -- zod: register/login/google/verify/forgot/reset/response, `CustomerUser`; thêm mã lỗi `EMAIL_NOT_VERIFIED`, `INVALID_TOKEN`.
- `apps/web/src/lib/customer-auth.ts` + `components/auth/` (mới) -- `AuthProvider` (access token trong bộ nhớ, refresh khi mount, `fetch(..., {credentials:'include'})`), `AuthModal` (tab đăng nhập/đăng ký/quên mật khẩu, nút Google), hook `useCustomer`.
- `apps/web/src/components/sheet/download-buttons.tsx` -- nút tải thành client: chưa đăng nhập → mở `AuthModal`; chưa xác minh → báo kèm nút gửi lại; ok → `POST` rồi điều hướng tới `url`.
- `apps/web/src/components/layout/header.tsx` (+ `mobile-menu.tsx`) -- nút Đăng nhập / tên khách + Đăng xuất.
- `apps/web/src/app/[locale]/account/verify/page.tsx`, `.../reset-password/page.tsx` (mới) -- nhận `?token=`.
- `apps/web/src/lib/csp.ts` + `csp.test.ts` -- thêm `accounts.google.com` vào `script-src`/`frame-src`/`connect-src`/`style-src`.
- `apps/web/src/messages/{vi,en}.json` -- khoá `Auth.*`.
- `README.md`, `.env.example` -- hướng dẫn tạo OAuth Client ID Google, biến mới.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/customer-auth.ts`, `errors.ts`, `index.ts` -- schema zod và mã lỗi mới -- hợp đồng chung API/web
- [x] `apps/api/prisma/schema.prisma` + migration `20261013100000_customers` -- 3 bảng mới, `download_logs.customer_id` -- nền dữ liệu (cộng thêm, không đụng dữ liệu cũ)
- [x] `apps/api/src/modules/customers/**`, `app.module.ts`, `config/env.ts` -- đăng ký/đăng nhập/xác minh/quên/đặt lại/Google/refresh/logout/me + guard khách
- [x] `apps/api/src/modules/commerce/downloads.*`, `download-log.repository.ts` -- gỡ route ẩn danh, thêm `POST /customer/downloads/...` ghi `customerId`
- [x] `apps/api/src/bootstrap.ts`, `test/integration/cors.spec.ts` -- credentials cho origin web
- [x] `apps/api/test/**` -- integration: đăng ký/xác minh/đăng nhập/Google (verifier giả)/reset/tải free (401/403/404/200)/không lộ tồn tại/token admin≠khách; cập nhật `free-download.spec.ts`; unit cho token service/guard
- [x] `apps/web/src/components/auth/**`, `lib/customer-auth.ts`, `download-buttons.tsx`, `header.tsx`, trang `account/*`, `csp.ts`, `messages/*.json` -- UI song ngữ + test (modal, luồng tải, CSP, ẩn nút Google khi thiếu client id)
- [x] `README.md`, `.env.example` -- tài liệu biến môi trường và hướng dẫn Google

**Acceptance Criteria:**
- Given khách chưa đăng nhập, when bấm Tải trên sheet free, then hiện modal đăng nhập/đăng ký và không có request tải nào được ghi log.
- Given khách vừa đăng ký, when chưa xác minh email, then đăng nhập được sau xác minh và tải bị chặn `EMAIL_NOT_VERIFIED` cho tới lúc đó.
- Given token khách, when gọi route admin (hoặc ngược lại), then 401.
- Given sheet trả phí, when mua bằng PayPal + email như trước, then luồng token/email không đổi và vẫn không cần đăng nhập.
- Given thiếu `GOOGLE_CLIENT_ID`, when mở modal, then không có nút Google và đăng ký email vẫn hoạt động.
- Lint, typecheck, test API và web xanh; test `midi-player-bundle` vẫn xanh.

## Implementation Notes

- Đã làm đủ theo spec: `Customer`/`CustomerRefreshToken`/`CustomerToken` + `download_logs.customer_id` (migration `20261013100000_customers`, không drift), module `customers`, `POST /customer/downloads/:sheetId/:fileType` thay route ẩn danh, web (AuthProvider/AuthModal/HeaderAuth/trang xác minh và đặt lại mật khẩu), CSP Google, biến `GOOGLE_CLIENT_ID`/`NEXT_PUBLIC_GOOGLE_CLIENT_ID` qua turbo/Dockerfile/compose/CI/.env.example.
- Quyết định nhỏ: Google xác minh bằng endpoint `tokeninfo` (không thêm SDK); `CustomerAccessService` là điểm chốt quyền tải để S2 thêm quota; refresh token khách dùng lại các hàm sinh/băm của admin; `IdentityModule` export thêm `PasswordService` (một instance dùng chung); `CommerceModule` import `IdentityModule` để `CustomerAuthGuard` có `JwtService`.
- Bất ngờ: CORS trước đó cố ý tắt credentials cho origin web, nên phải bật (cập nhật `cors.spec.ts`); `test/unit/backup-script.spec.ts` có 6 test lỗi sẵn trên máy macOS này (xác nhận lỗi cả trên `develop` sạch), không liên quan thay đổi.
- Test: web 713 pass; API unit mới (google-verifier, customer-auth.guard, customer-email, customer-token.service) và integration mới `customer-auth.spec.ts` + `free-download.spec.ts` viết lại. Postgres test chạy ở cổng 55433 (`POSTGRES_TEST_PORT=55433`) vì 5433 bị chiếm.

## Spec Change Log

## Review Triage Log

Ba reviewer: Blind Hunter, Edge Case Hunter, Verification Gap.

- **patch (high)**: đăng ký trước bằng email nạn nhân rồi nạn nhân đăng nhập Google → mật khẩu của kẻ tấn công còn sống. Liên kết vào tài khoản chưa xác minh giờ xoá `passwordHash` và thu hồi phiên; có test.
- **patch (medium)**: Google với `sub` khác cho cùng email (đã liên kết) → từ chối 401; race tạo tài khoản Google đồng thời (P2002) → đọc lại, không 500; `iss`/`exp` kiểm cục bộ; Google 5xx/429 → 503 thay vì 401.
- **patch (medium)**: refresh thất bại không còn xoá cookie (tab thua refresh đồng thời xoá mất cookie mới của tab thắng); refresh bọc khoá liên tab (Web Locks).
- **patch (medium)**: trang xác minh email gọi API một lần cho mỗi token (Strict Mode chạy effect hai lần làm hỏng link tốt).
- **patch (medium)**: bấm Tải khi chưa đăng nhập → sau đăng nhập tự tải tiếp; đóng modal thì bỏ lượt chờ.
- **patch (low)**: 503 ở luồng không phải Google không còn hiện "Google không dùng được"; đăng nhập 403 chưa xác minh dùng `switchTab` (xoá trạng thái cũ).
- **patch (test)**: thêm test refresh sau khi khoá tài khoản (401), cờ `Secure` và cookie bị xoá khi đăng xuất, nhánh tải 401 ở web, đăng nhập Google đồng thời, sub khác.
- **reject**: `tokeninfo` là endpoint "debug" (dùng để giữ không thêm SDK, đã bù bằng kiểm aud/iss/exp; ghi vào deferred nếu lưu lượng tăng); `secure: true` ở dev http (localhost vẫn nhận cookie); `refresh`/`logout` không throttle (gọi mỗi lần tải trang, throttle 5/phút phá NAT); sendFor nuốt lỗi email (cố ý, chống lộ email tồn tại); guard không tra DB (cố ý, quyền tải kiểm DB ở `CustomerAccessService`).
- **defer**: cooldown gửi email theo từng email (chống spam hộp thư) và throttle theo tài khoản; thu hồi cả họ token khi dùng lại token đã thu hồi; dọn định kỳ `customer_tokens`/`customer_refresh_tokens`; CORS credentials chỉ cho đường dẫn `/customer`; đổi/đặt mật khẩu khi đang đăng nhập, xoá tài khoản, admin quản lý khách; chuẩn hoá alias Gmail; quota tải theo khách (S2); test P2002 của `register`; redirect/410 cho link tải ẩn danh cũ.

## Design Notes

Tải file là điều hướng trình duyệt nên không gửi được header `Authorization`; vì thế đổi từ liên kết `<a href>` sang `POST` (Bearer) trả `{url}` rồi `window.location = url`. Refresh cookie `Path=/customer` + `SameSite=Strict` đủ an toàn vì web và API cùng site (cùng domain gốc); CORS cho origin web bật credentials chỉ để gửi cookie này. S2 sẽ thêm `canDownload()` (trial 7 ngày VÀ 2 lượt, gói) ngay trong `POST /customer/downloads`, nên endpoint mới là điểm chốt quyền tải duy nhất.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck` -- expected: không lỗi
- `pnpm --filter @piano-daily/web test` -- expected: toàn bộ pass
- API integration (`set -a && . ./.env && set +a && unset NODE_ENV`, Docker postgres-test 55433) -- expected: toàn bộ pass
- `pnpm build` -- expected: thành công

**Manual checks (if no CLI):**
- Cần tạo OAuth Client ID (Web) trong Google Cloud Console, thêm `GOOGLE_CLIENT_ID` (API) và `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (web), Authorized JavaScript origins là domain web, rồi thử đăng nhập Google thật.
