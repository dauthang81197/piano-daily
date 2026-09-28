---
title: 'Story 1.3 — Admin app: đăng nhập, layout và đổi mật khẩu'
type: 'feature'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '398d6fde553ce46cfaf3ee1a4d4e66ff79354d37'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** API xác thực đã có (Story 1.2), nhưng founder chưa có giao diện nào để đăng nhập và làm việc. Mọi trang quản trị ở các story sau cần một khung admin có phiên đăng nhập an toàn.

**Approach:** Trong `apps/admin`:
- Màn `/login` và layout có sidebar (6 mục, các trang chưa làm là placeholder).
- Lớp phiên phía client: access token chỉ nằm trong bộ nhớ; tải lại trang thì khôi phục phiên bằng `/auth/refresh`; gặp 401 thì refresh một lần rồi gửi lại request; các tab dùng chung một khoá khi refresh (Web Locks).
- Trang đổi mật khẩu và nút đăng xuất.

API bật CORS theo allowlist, `credentials` chỉ cho origin admin.

## Boundaries & Constraints

**Always:**
- Access token chỉ giữ trong bộ nhớ JS (không `localStorage`, `sessionStorage` hay cookie JS). Refresh token là cookie httpOnly do API quản lý; mọi request tới `/auth/*` dùng `credentials: 'include'`.
- Mọi dữ liệu admin fetch phía client. Các trang admin là client component bọc trong một `AuthGate`: khi chưa xác định được phiên thì chỉ hiện trạng thái đang tải, không render nội dung admin (AD-13).
- **Chỉ một tab refresh tại một thời điểm:** dùng `navigator.locks.request('pd-auth-refresh', …)` (deferred-work từ Story 1.2), để hai lời gọi `/auth/refresh` không bao giờ chạy đồng thời. Đăng xuất được phát tới mọi tab qua `BroadcastChannel('pd-auth')`.
- Form dùng schema zod của `packages/shared` (`loginRequestSchema`, `changePasswordRequestSchema`). Lỗi hiện bằng component `FormError` (nền error-container, icon, `role="alert"`). Label gắn với input.
- Giao diện: nút chính màu walnut; focus ring brass 2px trên mọi phần tử bấm được (UX-DR16); microcopy tiếng Việt, trang trọng, không emoji.
- **CORS ở API:** allowlist lấy từ env `CORS_ADMIN_ORIGIN` (bắt buộc, là URL), `credentials: true` chỉ cho origin đó; origin khác không nhận header `Access-Control-Allow-*`.

**Never:**
- Không fetch dữ liệu admin trong server component hay route handler của Next.
- Không làm nội dung thật cho Dashboard, Sheet, Composer/Genre/Series, Quảng cáo, Đơn hàng, Cài đặt (các story sau).
- Không dùng middleware Next để chặn route (phiên không tồn tại phía server).
- Không thêm i18n cho admin (chỉ tiếng Việt).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vào route admin khi chưa đăng nhập | Không có cookie refresh | Gọi refresh → 401 → chuyển `/login?next=<route>`; không lộ nội dung | N/A |
| Tải lại trang khi còn phiên | Cookie refresh hợp lệ | Refresh thành công, ở lại đúng route | N/A |
| Login đúng | Email + mật khẩu hợp lệ | Vào `next` (mặc định `/`), sidebar hiển thị 6 mục | N/A |
| Login sai | API trả 401 `INVALID_CREDENTIALS` | `FormError` "Email hoặc mật khẩu không đúng."; giữ email đã nhập | Không xoá form |
| Login quá ngưỡng | API trả 429 | `FormError` báo đợi rồi thử lại | N/A |
| Access token hết hạn | Request trả 401 | Refresh một lần rồi gửi lại request; thành công thì người dùng không thấy gì | Refresh thất bại → về `/login` |
| Hai tab cùng cần refresh | Cả hai gặp 401 cùng lúc | Hai lời gọi `/auth/refresh` chạy tuần tự (không chồng lên nhau), cả hai tab giữ được phiên | N/A |
| Đổi mật khẩu thành công | Mật khẩu cũ đúng, mới hợp lệ | Xoá phiên → `/login` kèm thông báo "Đã đổi mật khẩu. Vui lòng đăng nhập lại." | N/A |
| Đổi mật khẩu sai mật khẩu cũ | API trả 400 `INVALID_CREDENTIALS` | `FormError` "Mật khẩu hiện tại không đúng."; vẫn ở trang | Không đăng xuất |
| Đăng xuất | Bấm nút đăng xuất | Gọi `/auth/logout`, xoá token trong bộ nhớ, mọi tab về `/login` | Lỗi mạng vẫn xoá phiên cục bộ |
| API không truy cập được | Lỗi mạng | `FormError` "Không kết nối được máy chủ. Vui lòng thử lại." | Không crash |

</frozen-after-approval>

## Code Map

- `apps/admin/src/app/{layout.tsx,page.tsx,globals.css}` -- layout gốc (font, token). `page.tsx` hiện là placeholder và sẽ được thay. `globals.css` ánh xạ biến shadcn sang token: `--ring` là brass, nhưng `button.tsx` dùng `ring-3 ring-ring/50` nên cần override thành 2px, độ đậm đầy đủ.
- `apps/admin/src/components/ui/button.tsx`, `src/lib/utils.ts` -- shadcn preset `base-nova` (`@base-ui/react`, util `cn`). Thêm component (input, label, card…) bằng `pnpm dlx shadcn@4.21.0 add`.
- `apps/admin/package.json` -- chưa có test. `next.config.ts` build standalone. `apps/admin/Dockerfile` chưa có `ARG NEXT_PUBLIC_API_URL`; biến này được inline lúc build nên phải có ARG. Compose truyền `build.args`.
- `packages/shared/src/auth.ts` -- `loginRequestSchema`, `changePasswordRequestSchema`, `loginResponseSchema`, `authUserSchema`, `ErrorCode`.
- `apps/api/src/bootstrap.ts` -- `configureApp()` dùng chung cho main và test: thêm `enableCors`. `apps/api/src/config/env.ts` -- thêm `CORS_ADMIN_ORIGIN`. `apps/api/test/integration/create-app.ts` -- set env cho test.
- API từ Story 1.2: `POST /auth/login|refresh|logout|change-password`, `GET /auth/me`; cookie `refresh_token` với `Path=/auth`.
- `eslint.config.mjs` -- rule client mỏng đã áp dụng cho admin.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/config/env.ts`, `bootstrap.ts`, `test/integration/create-app.ts`, `test/integration/cors.spec.ts` -- `CORS_ADMIN_ORIGIN` và `enableCors({ origin: [CORS_ADMIN_ORIGIN], credentials: true })`. Test preflight: origin admin nhận `Access-Control-Allow-Origin` + `Allow-Credentials: true`; origin lạ không nhận -- AD-18.
- [x] `apps/admin/src/lib/api/client.ts` -- `apiFetch(path, init)`: gắn Bearer token, gặp 401 thì gọi `refreshSession()` một lần rồi gửi lại, parse lỗi theo `errorResponseSchema` thành `ApiError{status, code, message}`, lỗi mạng thành `ApiError` code `NETWORK_ERROR` phía client -- nền cho mọi trang admin.
- [x] `apps/admin/src/lib/auth/session.ts` -- store trong bộ nhớ (token, user, trạng thái); `refreshSession()` bọc trong Web Locks (fallback: promise dùng chung trong tab nếu trình duyệt không có `navigator.locks`); `BroadcastChannel` cho logout -- phiên.
- [x] `apps/admin/src/lib/auth/auth-provider.tsx`, `src/components/auth-gate.tsx` -- context `useAuth()` (`user`, `login`, `logout`, `changePassword`); gate khôi phục phiên khi mount và điều hướng `/login?next=` -- bảo vệ route.
- [x] `apps/admin/src/app/login/page.tsx` -- form login (react-hook-form + `@hookform/resolvers/zod` với `loginRequestSchema`), xử lý các dòng Login trong matrix, hiển thị thông báo khi đến từ đổi mật khẩu; đã có phiên thì chuyển về `/` -- màn login.
- [x] `apps/admin/src/app/(admin)/layout.tsx` + `components/admin-sidebar.tsx` -- sidebar: Dashboard `/`, Sheet `/sheets`, Composer/Genre/Series `/taxonomy`, Quảng cáo `/ads`, Đơn hàng `/orders`, Cài đặt `/settings`; header có tên admin, link đổi mật khẩu, nút đăng xuất; mục đang mở được đánh dấu -- layout.
- [x] `apps/admin/src/app/(admin)/{page,sheets/page,taxonomy/page,ads/page,orders/page,settings/page}.tsx` -- placeholder "Sắp có ở story sau" với tiêu đề đúng -- khung điều hướng.
- [x] `apps/admin/src/app/(admin)/account/password/page.tsx` -- form đổi mật khẩu (`changePasswordRequestSchema`) -- đổi mật khẩu.
- [x] `apps/admin/src/components/form-error.tsx`, `components/ui/*` (shadcn add: input, label, card), `globals.css` -- `FormError` theo DESIGN.md; focus ring 2px brass -- UX-DR11/16.
- [x] `apps/admin/vitest.config.mts`, `package.json` (script `test`), `src/**/*.test.ts(x)` -- Vitest + jsdom + Testing Library: test `apiFetch` (401 → refresh một lần → retry; refresh fail → hết phiên), `refreshSession` (hai lời gọi đồng thời trong một tab → một fetch; lời gọi được bọc trong `navigator.locks.request`), `AuthGate` (chưa có phiên → không render children, redirect), trang login (hiển thị lỗi INVALID_CREDENTIALS/429/mạng) -- phủ matrix.
- [x] `apps/admin/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md` -- `ARG NEXT_PUBLIC_API_URL`, build args cho admin, `CORS_ADMIN_ORIGIN` cho api (mặc định `http://localhost:3001`) -- chạy được trong Docker.

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build` và đã seed admin, when mở `http://localhost:3001` trong trình duyệt, then bị chuyển về `/login`; đăng nhập xong thấy Dashboard với sidebar đủ 6 mục; tải lại trang vẫn giữ phiên.
- Given `pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Design Notes

- **Nhóm route `(admin)`:** gồm layout có `AuthGate` và sidebar; `/login` nằm ngoài nhóm nên không có sidebar.
- **Khôi phục phiên:** chỉ gọi `/auth/refresh` (trả kèm user, không cần gọi thêm `/auth/me`).
- **Web Locks:** chỉ cần tuần tự hoá, không cần chia sẻ token giữa các tab. Mỗi tab giữ access token riêng. Sau khi một tab xoay vòng, cookie dùng chung đã là token mới, nên tab tiếp theo refresh trong khoá vẫn hợp lệ. Trong cùng một tab, các request 401 đồng thời dùng chung một promise refresh.
- **`next` redirect:** chỉ chấp nhận path nội bộ bắt đầu bằng `/` và không phải `//` (tránh open redirect).

## Verification

**Commands:**
- `pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `docker compose up -d --build --wait` rồi `curl -s -i -X OPTIONS localhost:4000/auth/login -H 'Origin: http://localhost:3001' -H 'Access-Control-Request-Method: POST'` -- expected: `Access-Control-Allow-Origin: http://localhost:3001`, `Access-Control-Allow-Credentials: true`

**Manual checks:**
- Mở admin trong trình duyệt: redirect về login, đăng nhập, reload giữ phiên, đổi mật khẩu thì bị đưa về login, đăng xuất ở một tab thì tab khác cũng về login.

## Implementation Notes

- **CORS:** dùng `CorsOptionsDelegate` thay vì `{ origin: [..], credentials: true }`, vì gói `cors` vẫn gửi `Access-Control-Allow-Credentials`/`Allow-Methods` cho origin không khớp. Origin lạ nhận `{ origin: false }` nên không có header `Access-Control-Allow-*` nào. `CORS_ADMIN_ORIGIN` được chuẩn hoá về `URL.origin`.
- **Phiên:** `session.ts` là store module-level (`useSyncExternalStore`). `SessionState.anonymous.reason` (`unauthenticated | logout | password-changed`) cho phép `AuthGate` là nơi duy nhất điều hướng về `/login`: `?next=` khi hết phiên, `/login` khi đăng xuất, `?reason=password-changed` khi đổi mật khẩu. Nhờ vậy không có race giữa hai lệnh `router.replace`. Có bộ đếm `epoch` để kết quả refresh bắt đầu trước khi đăng xuất không "hồi sinh" phiên.
- `refreshSession()`: 4xx thì hết phiên (`false`); lỗi mạng hoặc 5xx thì ném `ApiError` và giữ phiên (gate hiện `FormError` kèm nút "Thử lại", không lộ nội dung).
- Đổi mật khẩu cũng phát `logout` qua BroadcastChannel (refresh token của mọi tab đã bị thu hồi).
- Form đổi mật khẩu thêm ô "Nhập lại mật khẩu mới" qua `changePasswordRequestSchema.safeExtend(...)`, vẫn giữ mọi ràng buộc của schema shared, để tránh gõ nhầm khiến founder bị khoá khỏi tài khoản duy nhất.
- Focus ring: `button.tsx`/`input.tsx` đổi `ring-3 ring-ring/50` thành `ring-2 ring-ring`; `globals.css` thêm outline 2px brass mặc định cho phần tử bấm được thuần.
- Sau review: `/auth/logout` chạy trong khoá `pd-auth-refresh` (fallback là chờ refresh đang chạy trong tab). Broadcast logout mang theo `reason`. Refresh bị epoch guard chặn thì trả về trạng thái phiên hiện tại. API luôn gửi `Vary: Origin`.
- `turbo.json`: `NEXT_PUBLIC_API_URL` được đưa vào `env` của task build (inline vào bundle nên phải nằm trong hash cache); `CORS_ADMIN_ORIGIN` được thêm vào passthrough.

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Logout không chạy trong khoá `pd-auth-refresh`, nên logout có thể chạy đua với refresh ở tab khác | medium | Có thật: nếu refresh rotate C1→C2 trước, `revoke` của logout không có tác dụng với C1 đã thu hồi; response của refresh tới sau làm cookie C2 còn sống, reload lại vào được phiên | patch |
| 2 | Origin bị từ chối không có `Vary: Origin` | low | Có thật (delegate `origin:false` không đặt header nào); API JSON hiện không được cache public. Sửa một dòng | patch |
| 3 | CORS chỉ cho một origin nên chặn web app | false | Web client-side gọi API từ Epic 2; Story 2.1 bổ sung origin web vào allowlist | reject |
| 4 | Chưa ghi rõ giới hạn deploy của cookie (admin và API phải cùng site, HTTPS) | low | Có thật; sửa chỉ là thêm ghi chú vào README và `.env.example` | patch |
| 5 | `NEXT_PUBLIC_API_URL` tự fallback về localhost khi build production | low | Default này dành cho compose local; cấu hình production thuộc Story 5.1 | reject (low) |
| 6 | Body 2xx sai định dạng ném ZodError/SyntaxError thay vì ApiError; retry với body dạng stream | low | API luôn trả JSON đúng schema; không có chỗ nào gửi body stream; sửa cần thêm guard | reject (low) |
| 7 | Refresh cũ trả `false` sau khi login mới, khiến apiFetch báo "hết phiên" dù đang authenticated | low | Có thật khi `epoch` đổi giữa chừng; sửa chỉ cần trả về trạng thái hiện tại | patch |
| 8 | Guard `epoch` (không hồi sinh phiên) chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 9 | Refresh gặp 5xx phải giữ phiên, nhưng chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 10 | Việc `AuthProvider` nghe logout từ tab khác chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 11 | Chưa assert `changePassword` phát broadcast | low | Verification-gap đã xác minh sẵn | patch |
| 12 | Nút Đăng xuất của `AdminHeader` chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 13 | Chưa có test cho việc layout `(admin)` bọc `AuthGate` | medium | Verification-gap đã xác minh sẵn: bỏ gate thì mọi test vẫn xanh | patch |
| 14 | `/login` khi restore lỗi mạng: chưa có test, và không hiện FormError cho tới khi submit | low | Verification-gap đã xác minh sẵn phần test; phần UX sửa chỉ cần đặt `formError` | patch |
| 15 | Chưa test các nhánh thông điệp lỗi của change-password (429/mạng/validation) | low | Có fallback chung an toàn; nhánh quan trọng `INVALID_CREDENTIALS` đã có test | reject (low) |
| 16 | Test "validate phía client" không assert là không gọi API | low | Có thật; sửa chỉ cần thêm assert | patch |
| 17 | Tab khác không nhận lý do "đã đổi mật khẩu" | low | Có thật (broadcast chỉ có `logout`); sửa chỉ cần gửi kèm reason | patch |
| 18 | Status tracking lệch nhau | false | Status do workflow quản lý theo bước | reject |
| 19 | Trang login không có `h1`; các route cùng một title; nhiều `role=alert` cùng lúc | low | Thiếu `h1` sửa trực tiếp được; title và alert chỉ ảnh hưởng nhỏ | patch (h1) / reject (còn lại) |
| 20 | Admin không responsive | false | EXPERIENCE: admin tối ưu desktop | reject |
| 21 | `AdminHeader`: `logout().finally` không có catch nên để lọt unhandled rejection | low | Có thật với lỗi không phải ApiError; sửa chỉ cần thêm `.catch` | patch |
| 22 | Ring `aria-invalid` đè focus ring brass | maybe-false | Chưa xác định được thứ tự utility khi render thật; cần kiểm trong trình duyệt | reject (low) |
| 23 | Refresh 5xx/mạng không đưa về `/login` | false | Đúng thiết kế: lỗi tạm thời giữ phiên; "refresh thất bại" là 4xx | reject |
| 24 | Trình duyệt không có Web Locks thì các tab vẫn có thể refresh đồng thời | low | Web Locks có trên mọi trình duyệt hiện đại (Safari 15.4+) | reject (low) |
