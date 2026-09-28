---
title: 'Story 1.2 — API xác thực admin với guard deny-by-default'
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f87de402478a13ae12ff2900121f37b336b058d2'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** API chưa có xác thực. Mọi route admin ở các story sau cần một cơ chế đăng nhập an toàn, và guard phải chặn mặc định để không route nào vô tình bị lộ.

**Approach:** Module `identity` với bảng `User` và `RefreshToken`, seed 1 SUPER_ADMIN từ env, các endpoint `/auth/{login,refresh,logout,me,change-password}`. Access JWT 15 phút trả trong body, refresh token xoay vòng trong cookie httpOnly. Guard JWT global với `@Public()` có test allowlist; DTO là zod schema trong `packages/shared`, validate bằng `StandardSchemaValidationPipe` của Nest 12.

## Boundaries & Constraints

**Always:**
- Mật khẩu hash bằng bcrypt (cost 12). Refresh token chỉ lưu dạng hash sha256; bản rõ chỉ tồn tại trong cookie.
- Cookie refresh: `httpOnly; Secure; SameSite=Strict; Path=/auth`.
- Login sai (email không tồn tại, sai mật khẩu, tài khoản bị vô hiệu) luôn trả cùng một response 401 `INVALID_CREDENTIALS`, và thời gian xử lý tương đương (vẫn chạy bcrypt khi email không tồn tại).
- IP khách chỉ lấy qua `getClientIp()`.
- Mã lỗi mới nằm trong catalog `packages/shared`; mọi DTO auth là zod schema trong shared.
- Không log email đầy đủ, mật khẩu, token hay cookie.
- **Quyết định:** refresh token sống 30 ngày (`REFRESH_TOKEN_TTL_DAYS=30` mặc định); cookie `Max-Age` khớp với hạn này.

**Never:**
- Không làm CORS, admin UI hay trang login (Story 1.3).
- Không dùng passport. Không dùng `nestjs-zod`.
- Không thêm role EDITOR vào luồng nào (enum vẫn có giá trị này).
- Không lưu access token phía server.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Login đúng | email (không phân biệt hoa thường) + mật khẩu đúng | 200 `{accessToken, expiresIn:900, user:{id,email,name,role}}`, set cookie refresh, cập nhật `last_login_at` | N/A |
| Login sai | email lạ / sai mật khẩu / user `is_active=false` | 401 `INVALID_CREDENTIALS`, body giống hệt nhau | Không tiết lộ email tồn tại |
| Login quá ngưỡng | > 5 request/phút từ cùng IP | 429 `TOO_MANY_REQUESTS` | Theo `getClientIp()` |
| Body sai | thiếu email hoặc email sai định dạng | 400 `VALIDATION_FAILED` kèm `details` | Từ exceptionFactory của pipe |
| Refresh hợp lệ | cookie refresh còn hạn, chưa thu hồi | 200 access token mới + cookie mới; token cũ bị thu hồi | N/A |
| Refresh token cũ | cookie đã xoay vòng/thu hồi/hết hạn/không có | 401 `UNAUTHORIZED`, xoá cookie | Log warn khi token đã thu hồi bị dùng lại |
| Route không `@Public` | không có hoặc sai Bearer token | 401 `UNAUTHORIZED` | N/A |
| Me | token hợp lệ | 200 `{id,email,name,role}` | User bị vô hiệu → 401 |
| Change-password | mật khẩu cũ sai | 400 `INVALID_CREDENTIALS` | Không thu hồi token |
| Change-password | mật khẩu cũ đúng, mới hợp lệ | 204; mọi refresh token của user bị thu hồi | N/A |
| Logout | có cookie refresh | 204, token bị thu hồi, xoá cookie | Không có cookie → vẫn 204 |

</frozen-after-approval>

## Code Map

- `apps/api/src/app.module.ts` -- đăng ký `IdentityModule`, `ThrottlerModule`, `APP_GUARD` (JwtAuthGuard), `APP_PIPE` (StandardSchemaValidationPipe).
- `apps/api/src/common/http-exception.filter.ts` -- `STATUS_TO_CODE` + `DEFAULT_MESSAGE`: thêm 401/403/429. Unit test hiện assert `401 → INTERNAL_ERROR` (phải đổi thành `UNAUTHORIZED`).
- `apps/api/src/bootstrap.ts` -- `configureApp()` dùng chung cho main và integration test: thêm `cookie-parser`.
- `apps/api/src/config/env.ts` -- zod `envSchema`: thêm biến mới; test `env.spec.ts` assert object mặc định (phải cập nhật).
- `apps/api/test/integration/create-app.ts` -- đặt env trước khi import AppModule: phải set thêm `JWT_ACCESS_SECRET`.
- `apps/api/prisma/schema.prisma`, `apps/api/prisma.config.ts` -- chưa có model; thêm model, migration đầu tiên và `migrations.seed`.
- `packages/shared/src/errors.ts` -- catalog mã lỗi (hiện có 4 mã).
- `node_modules/@nestjs/common/pipes/standard-schema-validation.pipe.d.ts` -- API pipe: options `exceptionFactory`; schema gắn qua `@Body({ schema })`.
- Không sửa: `logger.ts` (đã redact authorization/cookie), cấu hình Docker ngoài phần env của api.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/errors.ts` -- thêm `UNAUTHORIZED`, `FORBIDDEN`, `INVALID_CREDENTIALS`, `TOO_MANY_REQUESTS` -- catalog duy nhất.
- [x] `packages/shared/src/auth.ts` (+ export) -- enum `Role` (`SUPER_ADMIN`, `EDITOR`); zod `loginRequestSchema` (email chuẩn hoá trim + lowercase, password 1–128), `changePasswordRequestSchema` (mật khẩu mới 12–128 ký tự, khác mật khẩu cũ), `authUserSchema`, `loginResponseSchema` -- hợp đồng API.
- [x] `apps/api/prisma/schema.prisma` + `prisma/migrations/<ts>_identity/` -- enum `Role`; `User(id uuid @default(dbgenerated("uuidv7()")), email unique, password_hash, name, role, is_active, last_login_at, created_at, updated_at)`; `RefreshToken(id uuidv7, user_id FK cascade, token_hash unique, expires_at, revoked_at, created_at)` với index `user_id`; tên cột snake_case qua `@map` -- AD-1, quy ước.
- [x] `apps/api/prisma/seed.ts` + `prisma.config.ts` (`migrations.seed`) + script `db:seed` -- upsert SUPER_ADMIN từ `ADMIN_EMAIL`/`ADMIN_PASSWORD`/`ADMIN_NAME`; nếu đã tồn tại thì không đổi mật khẩu; thiếu biến thì báo lỗi nêu tên biến -- idempotent.
- [x] `apps/api/src/config/env.ts` -- thêm `JWT_ACCESS_SECRET` (≥ 32 ký tự, bắt buộc), `REFRESH_TOKEN_TTL_DAYS` (số nguyên dương, mặc định 30) -- config.
- [x] `apps/api/src/common/http/client-ip.ts` -- `getClientIp(req)`: header `cf-connecting-ip` nếu có, ngược lại IP socket -- AD-18.
- [x] `apps/api/src/modules/identity/` -- `IdentityModule`, `AuthController`, `AuthService`, `PasswordService` (bcryptjs), `RefreshTokenService` (sinh 32 byte base64url, lưu sha256, xoay vòng bằng `UPDATE … WHERE revoked_at IS NULL` để hai request đồng thời chỉ một bên thắng), `JwtAuthGuard` global, decorator `@Public()` và `@CurrentUser()` -- AD-13.
- [x] `apps/api/src/app.module.ts`, `bootstrap.ts`, `http-exception.filter.ts` -- đăng ký guard/pipe/throttler; `cookie-parser`; map 401/403/429 và `exceptionFactory` của pipe → 400 `VALIDATION_FAILED` với `details` là danh sách `{path, message}` -- nối dây.
- [x] `apps/api/src/health/health.controller.ts` -- gắn `@Public()` -- giữ health công khai.
- [x] `apps/api/test/unit/` -- test `getClientIp`, `RefreshTokenService` (hash, hạn), cập nhật filter test (401 → `UNAUTHORIZED`) và env test; test enum shared `Role` = enum Prisma `Role` -- AD-2.
- [x] `apps/api/test/integration/auth.spec.ts` + `public-routes.spec.ts` -- phủ toàn bộ I/O matrix trên DB thật (dọn bảng giữa các test); route test: duyệt mọi controller/handler qua `DiscoveryService`, so tập route `@Public()` với allowlist chính xác `GET /health`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout` -- AC.
- [x] `.env.example`, `docker-compose.yml` (env của api), `README.md` -- thêm biến mới, lệnh `pnpm --filter @piano-daily/api db:seed` -- onboarding.

**Acceptance Criteria:**
- Given DB đã migrate và đã seed, when login bằng thông tin trong env, then nhận access token và cookie đúng thuộc tính; gọi `GET /auth/me` với Bearer token trả thông tin admin.
- Given seed đã chạy một lần, when chạy lại `db:seed`, then không tạo bản ghi trùng và không đổi mật khẩu.
- Given hai request `/auth/refresh` đồng thời với cùng một cookie, when cả hai hoàn tất, then đúng một request thành công.
- Given `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Design Notes

- **Logout là `@Public`:** access token có thể đã hết hạn lúc bấm đăng xuất; logout chỉ cần cookie refresh để thu hồi.
- **Token cũ bị dùng lại:** chỉ từ chối và log warn, không thu hồi toàn bộ phiên. Lý do: hai tab admin refresh cùng lúc sẽ tự đăng xuất nhau nếu thu hồi cả họ token.
- **Throttle:** `@nestjs/throttler` in-memory (AD-15), chỉ gắn vào `/auth/login` (5 request/60 giây); tracker ghi đè bằng `getClientIp()`.
- **Validation:** `@Body({ schema: loginRequestSchema }) body: LoginRequest` cùng pipe global.
- **bcryptjs** (JS thuần) thay vì `bcrypt` native: tránh build native trong image `bookworm-slim`; tốc độ đủ cho một admin.

## Verification

**Commands:**
- `pnpm build && pnpm typecheck && pnpm lint` -- expected: exit 0
- `pnpm --filter @piano-daily/api exec prisma migrate deploy && pnpm --filter @piano-daily/api db:seed` (chạy 2 lần) -- expected: lần 2 không lỗi, không tạo bản ghi trùng
- `TEST_DATABASE_URL=… pnpm test` -- expected: mọi test pass
- `docker compose up -d --build` rồi `curl -i -X POST localhost:4000/auth/login -H 'content-type: application/json' -d '{"email":"…","password":"…"}'` -- expected: 200, header `Set-Cookie` có `HttpOnly; Secure; SameSite=Strict; Path=/auth`

## Implementation Notes

- Thư viện mới (pin chính xác): `@nestjs/jwt` 12.0.2 (HS256), `@nestjs/throttler` 6.7.1, `cookie-parser` 1.4.7, `bcryptjs` 3.0.3; dev: `@types/cookie-parser`, `tsx` (chạy `prisma/seed.ts`).
- Bảng map snake_case: `users`, `refresh_tokens`. Tên cookie: `refresh_token`.
- `JwtAuthGuard` không tra DB; `/auth/me` và `/auth/change-password` tự kiểm `is_active` (user bị vô hiệu → 401).
- `/auth/refresh` trả cùng shape với login (`loginResponseSchema`). `/auth/change-password` thành công còn xoá cookie refresh (token đã bị thu hồi).
- Email lạ vẫn chạy `bcrypt.compare` với một hash giả cost 12 hằng số (`password.service.ts`).
- `getClientIp()` chỉ nhận `CF-Connecting-IP` khi là IP hợp lệ, không thì dùng IP socket. Integration test dùng header này để mỗi test một IP (tránh rate limit chéo).
- Seed yêu cầu `ADMIN_PASSWORD` ≥ 12 ký tự (khớp chính sách đổi mật khẩu); log email đã che.
- Sau review: throttler tên `default` (header `Retry-After` chuẩn), cũng gắn vào `/auth/change-password`; env từ chối `JWT_ACCESS_SECRET` bắt đầu `change-me`, `REFRESH_TOKEN_TTL_DAYS` ≤ 365; seed từ chối `ADMIN_PASSWORD` bắt đầu `change-me` và cảnh báo khi user đã có không phải SUPER_ADMIN đang hoạt động; mật khẩu mới ≤ 72 byte UTF-8.
- `docker-compose.yml` bắt buộc `JWT_ACCESS_SECRET` (`${VAR:?…}`); `turbo.json` thêm 2 biến mới vào passthrough.

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Giả `CF-Connecting-IP` để lách throttle login | false | `getClientIp` làm đúng AD-18. Việc origin chỉ nhận traffic từ Cloudflare (Caddy `trusted_proxies` + firewall) là AC của Story 5.1, không thuộc story này | reject |
| 2 | 429 không có header `Retry-After` chuẩn (tên throttler `login` thêm hậu tố) | low | Đã thử: response 429 trả `Retry-After-login: 60`. Sửa chỉ cần đổi tên throttler thành `default` | patch |
| 3 | `/auth/change-password` không có rate limit, có thể brute-force mật khẩu hiện tại bằng access token bị lộ | medium | Có thật: chỉ login gắn `ThrottlerGuard`. Sửa chỉ cần gắn guard vào route | patch |
| 4 | Phiên không có hạn tuyệt đối (refresh cấp lại đủ 30 ngày) | low | Đúng như thiết kế sliding 30 ngày; muốn đổi phải thêm cột | reject (low) |
| 5 | Bảng `refresh_tokens` không được dọn | low | Có thật nhưng chỉ tăng chậm (1 admin); sửa cần thêm cron | reject (low) |
| 6 | Giá trị mẫu trong `.env.example` (`JWT_ACCESS_SECRET`, `ADMIN_PASSWORD`) vẫn qua được validate | medium | Có thật: placeholder ≥ 32 và ≥ 12 ký tự. Copy nguyên sang production thì ai cũng giả được token SUPER_ADMIN | patch |
| 7 | Không chạy được seed trong image production | false | Seed đọc `DATABASE_URL` nên founder chạy được từ host tới DB production. Cách làm khi deploy là việc của Story 5.1 | reject |
| 8 | Seed báo "SUPER_ADMIN đã tồn tại" khi user đó là EDITOR hoặc bị vô hiệu | low | Có thật; sửa chỉ là đổi thông điệp log | patch |
| 9 | Access token vẫn dùng được tới 15 phút sau khi vô hiệu user hoặc đổi mật khẩu | false | Đúng thiết kế của spec (guard không tra DB, không lưu access token phía server) | reject |
| 10 | Đổi mật khẩu cũng đăng xuất tab hiện tại | false | Đúng I/O matrix: "mọi refresh token của user bị thu hồi" | reject |
| 11 | bcrypt chỉ dùng 72 byte đầu (ký tự tiếng Việt nhiều byte) | medium | Đã thử: `'đ'×40` = 80 byte, và `compare(p+'khác', hash)` = true. Rule "mật khẩu mới khác mật khẩu cũ" bị lách được | patch |
| 12 | `REFRESH_TOKEN_TTL_DAYS` không có giới hạn trên (Invalid Date → 500) | low | Có thật; sửa chỉ cần `.max(365)` | patch |
| 13 | Test deny-by-default chỉ đọc metadata, bỏ sót route khai báo path dạng mảng hoặc controller scoped | low | Hiện không có route nào như vậy; guard thật đã được `auth.spec` kiểm; sửa cần viết lại test | reject (low) |
| 14 | Email chỉ lowercase ở app, không có ràng buộc ở DB | low | Hiện mọi đường ghi đều qua schema shared hoặc seed có lowercase | reject (low) |
| 15 | Lệch nhỏ (status sprint/spec, secret test lặp lại, thông điệp 429) | low/false | Status do workflow quản lý; phần còn lại chỉ ảnh hưởng thẩm mỹ | reject |
| 16 | Hai tab cùng refresh: response 401 của bên thua xoá cookie mới của bên thắng, cả hai tab bị đăng xuất | medium | Có thật (dễ xảy ra khi mở lại nhiều tab cùng lúc). Nhưng I/O matrix (frozen) yêu cầu "token cũ → xoá cookie"; hướng sửa là admin client dùng Web Locks/BroadcastChannel để chỉ một tab refresh | defer (Story 1.3) |
| 17 | `socket.remoteAddress` undefined thì mọi request dồn chung bucket `unknown` | low | Hiếm gặp (socket đã đóng) | reject (low) |
| 18 | Hai request change-password đồng thời: bên ghi sau thắng | low | Chỉ có một admin; sửa cần thêm điều kiện ghi | reject (low) |
| 19 | User bị vô hiệu giữa bước kiểm tra và transaction rotate | low | Cửa sổ race rất nhỏ | reject (low) |
| 20 | Không test nào kiểm `exp` của access token (15 phút) hay token đã hết hạn | medium | Verification-gap đã xác minh sẵn: test chỉ assert hằng số `expiresIn` trong body | patch |
| 21 | Test "email lạ vẫn chạy bcrypt" chỉ spy wrapper, không bắt được việc bỏ qua compare hoặc DUMMY_HASH sai | medium | Verification-gap đã xác minh sẵn | patch |
| 22 | Seed không có test tự động (idempotent, lowercase, giữ nguyên mật khẩu) | medium | Verification-gap đã xác minh sẵn: AC2 chỉ được kiểm tay | patch |
| 23 | TTL refresh chỉ được test với giá trị mặc định 30 | low | Verification-gap đã xác minh sẵn | patch |
| 24 | Test change-password thành công không assert việc xoá cookie | low | Verification-gap đã xác minh sẵn | patch |
