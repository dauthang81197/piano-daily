---
title: 'Story 2.10 — Xem trước Sheet Draft từ admin'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '2eb8374549c07bdd0c6f12ae828ca4a4b943e7fa'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Founder không thể xem một Sheet Draft đúng như người dùng sẽ thấy trước khi publish, vì mọi route công khai trả 404 cho Draft; lỗi trình bày chỉ lộ ra sau khi đã công khai.

**Approach:** Ở trang sửa Sheet, nút "Xem như người dùng" xin `identity` một preview token (JWT ký, hạn 10 phút, gắn `sheetId`) rồi mở tab mới tới `/[locale]/preview/sheet/[id]?token=`. Route đó (web, SSR, `no-store`, `noindex`, không gửi beacon) lấy dữ liệu từ một endpoint API xác minh token và render đúng `SheetDetail` của trang công khai (kể cả MIDI player). Mọi lỗi token đều ra 404.

## Boundaries & Constraints

**Always:**
- **Phát token (module `identity`):** `POST /admin/preview-tokens` body `{ sheetId }` (UUID; sai dạng → 400), **cần access token admin** (guard JWT toàn cục, không `@Public()`), trả `{ token, expiresAt }`. `PreviewTokenService` ký JWT HS256 bằng cùng `JWT_ACCESS_SECRET` nhưng với `audience: 'piano-daily:preview'`, claim `sheetId`, hạn **600 giây** và không có `sub`/`role`, nên **không thể dùng như access token** (guard JWT yêu cầu `sub`/`role`) và access token **không qua** được kiểm tra preview (thiếu audience). Schema `previewTokenRequestSchema`/`previewTokenResponseSchema` trong `packages/shared`. Identity không kiểm tra Sheet tồn tại (không sở hữu bảng Sheet).
- **Xác minh và dữ liệu (module `catalog`, `@Public()`):** `GET /sheets/:id/preview` với header `X-Preview-Token` (không đặt token trong URL gọi API). `PreviewTokenService.verify(token, sheetId)` kiểm chữ ký, thuật toán HS256, audience, hạn và `sheetId` khớp `:id`. **Mọi thất bại** (thiếu/sai/hết hạn/khác `sheetId`/Sheet không tồn tại/`:id` sai dạng) trả **404 cùng một nội dung** (không phân biệt được). Thành công trả `PublicSheetDetail` của Sheet đó **ở mọi trạng thái** (Draft, Archived, Published) bằng cùng đường dựng như `GET /sheets/:slug` (tái dùng, không nhân bản); `seriesSheets` và `related` vẫn **chỉ gồm Sheet PUBLISHED** (không lộ Draft khác). Response có `Cache-Control: no-store`. Endpoint thêm vào allowlist `public-routes.spec.ts`. `CatalogModule` import `IdentityModule` (identity xuất `PreviewTokenService`); identity không import catalog.
- **Route web** `apps/web/src/app/[locale]/preview/sheet/[id]/page.tsx` (SSR, `export const dynamic = 'force-dynamic'`): `id` phải là UUID (sai → `notFound()`), đọc `token` từ `searchParams` (thiếu → `notFound()`); gọi API bằng `apiFetch` với `cache: 'no-store'` (không `publicFetch`, không tag) và header `X-Preview-Token`; mọi phản hồi không phải 200 (404/400/401) → `notFound()`, lỗi khác ném. Render **đúng `SheetDetail`** (cùng layout, kể cả MIDI player và các thẻ liên quan) kèm một dải thông báo rõ "Bản xem trước — chưa công khai" (thêm vào trang preview, **không** đổi `SheetDetail`); **không** gắn `ViewBeacon` (không đếm lượt xem).
- **Header bảo mật** cho mọi route `/{locale}/preview/*` (cấu hình trong `next.config.ts`, hàm dựng tách ra module để test): `Cache-Control: no-store, max-age=0`, `X-Robots-Tag: noindex, nofollow`, `Referrer-Policy: no-referrer` (token nằm trong URL: không được lọt vào `Referer` khi bấm link từ trang preview). Metadata của trang: `robots: { index: false, follow: false }`, không `alternates`/hreflang; title có tiền tố "Xem trước".
- **Nút admin** "Xem như người dùng" trong `SheetEditPage` (chỉ khi Sheet đã lưu): bấm → mở tab trống **đồng bộ** trong cú bấm (tránh bị chặn pop-up), gọi `POST /admin/preview-tokens`, rồi đặt URL `${SITE_URL}/vi/preview/sheet/{id}?token={token}` cho tab đó (`opener = null`); lỗi thì đóng tab trống và hiện `FormError` rõ ràng; có trạng thái đang xin token (vô hiệu nút). Hiển thị ghi chú ngắn "Xem bản đã lưu, link hết hạn sau 10 phút". `SITE_URL` đọc từ `NEXT_PUBLIC_SITE_URL` (thêm `ARG`/`ENV` vào `apps/admin/Dockerfile`, `build.args` của `docker-compose.yml`, `.env.example` và README; mặc định `http://localhost:4100`, bỏ `/` cuối). Token được `encodeURIComponent`.
- **Test:** unit (`PreviewTokenService`: hợp lệ, hết hạn, khác `sheetId`, audience sai/access token, chữ ký sai, rác), integration API (cần admin để xin token, 200 cho Draft/Archived với token hợp lệ, 404 giống hệt cho mọi lỗi, `no-store`, series/related không lộ Draft, token xin cho Sheet A không xem được Sheet B, access token không dùng được làm preview token và preview token không dùng được làm access token, allowlist), shared schema, web (trang: 404 các trường hợp, `noindex`, render `SheetDetail`, không beacon; hàm header), admin (nút: mở tab đồng bộ, đặt URL đúng, lỗi, trạng thái bận).

**Never:**
- Không đặt token trong URL gọi API, không lưu/log token; không cho preview token truy cập bất kỳ route `/admin/*` nào; không cache preview (`no-store` ở cả fetch lẫn header).
- Không đếm lượt xem từ preview; không cho preview xuất hiện trong sitemap/tìm kiếm/Search; không lộ Draft qua `related`/`seriesSheets`.
- Không đổi hành vi route công khai hiện có hay `/admin/*` khác; không thêm dependency; không làm "xem trước dữ liệu chưa lưu" (preview luôn hiển thị bản đã lưu).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Xin token | Admin đã đăng nhập, `{ sheetId }` UUID | 200 `{ token, expiresAt }` (hạn 10 phút) | N/A |
| Xin token không đăng nhập | không access token | 401 | Guard JWT |
| Xin token sai dạng | `sheetId: "abc"` | 400 `VALIDATION_FAILED` | N/A |
| Xem Draft | token hợp lệ + id đúng | 200, `SheetDetail` đầy đủ (ảnh trang, MIDI player, lyrics…) | N/A |
| Xem Archived/Published | token hợp lệ | 200 (preview dùng được mọi trạng thái) | N/A |
| Token thiếu | không `token` / không header | 404 | N/A |
| Token sai/rác/sai chữ ký | chuỗi tuỳ ý | 404, nội dung giống mọi lỗi khác | N/A |
| Token hết hạn | quá 10 phút | 404 | N/A |
| Token của Sheet khác | token(A) cho id B | 404 | N/A |
| Access token làm preview token | JWT đăng nhập | 404 (thiếu audience) | N/A |
| Preview token làm access token | gọi `/admin/*` | 401 (thiếu `sub`/`role`) | N/A |
| `id` không tồn tại/sai dạng | UUID lạ hoặc `abc` | 404 | N/A |
| Related/Series | Draft khác cùng Series | Không xuất hiện | N/A |
| Beacon | mở preview | Không có request `POST /sheets/:id/view` | N/A |
| Cache | mọi response | `no-store` (fetch và header trang) | N/A |
| Lộ token qua Referer | bấm link ra ngoài từ preview | Không có `Referer` (`no-referrer`) | N/A |
| Index | crawler | `noindex, nofollow` (header và meta) | N/A |
| Nút admin | bấm khi Sheet đã lưu | Tab mới mở ngay, rồi chuyển tới URL preview đúng locale/id/token | Lỗi → đóng tab trống, hiện lỗi |
| Pop-up | trình duyệt chặn tab | Hiện lỗi hướng dẫn cho phép pop-up | N/A |
| Route public | quét controller | `GET /sheets/:id/preview` trong allowlist; `POST /admin/preview-tokens` không trong allowlist (cần JWT) | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/identity/{identity.module,jwt-auth.guard}.ts` -- `JwtModule` (secret HS256, `JWT_ALGORITHM`) đã có; thêm `PreviewTokenService` và controller `POST admin/preview-tokens`, xuất service; guard hiện yêu cầu `sub` + `role` nên preview token tự bị từ chối.
- `apps/api/src/modules/catalog/{catalog.module,public-sheets.controller,public-sheets.service}.ts` -- `detailBySlug` dựng `PublicSheetDetail` từ `findFirst({ slug, published })`; tách phần dựng thành hàm dùng chung nhận điều kiện (`slug`+PUBLISHED hoặc `id` mọi trạng thái); thêm route `sheets/:id/preview` (khác `sheets/:slug` nhờ có hai đoạn đường dẫn).
- `packages/shared/src/` (`auth.ts` hoặc `sheet.ts`) (+ spec) -- schema request/response preview token và hằng audience/TTL dùng chung.
- `apps/api/test/{unit,integration}` -- mẫu `createApp`, đăng nhập admin lấy access token trong integration (xem `auth.spec.ts`/`catalog-sheets.spec.ts`), `public-routes.spec.ts` (allowlist).
- `apps/web/src/lib/api.ts` (`apiFetch`) + `apps/web/src/lib/catalog.ts` -- thêm `fetchPreviewSheet(id, token)` (`cache: 'no-store'`, header, 404/400/401 → `null`); `apps/web/src/components/sheet/sheet-detail.tsx` -- dùng lại nguyên; `components/sheet/view-beacon.tsx` -- KHÔNG dùng ở preview; `apps/web/src/app/[locale]/sheet/[slug]/page.tsx` -- mẫu trang.
- `apps/web/next.config.ts` + `apps/web/src/lib/csp.ts` (mẫu tách hàm test được) -- thêm hàm header preview; `apps/web/src/proxy.ts` -- matcher đã bao route `/preview/...` (redirect locale chỉ khi thiếu tiền tố).
- `apps/admin/src/components/sheets/sheet-editor.tsx` (`SheetEditPage`, khu vực trạng thái) + `src/lib/api/sheets.ts` -- nơi đặt nút và hàm `previewToken(id)`; `src/components/form-error.tsx` -- hiển thị lỗi; `apps/admin/Dockerfile`, `docker-compose.yml`, `.env.example`, `README.md` -- biến `NEXT_PUBLIC_SITE_URL` cho admin.
- `apps/web/src/messages/{vi,en}.json` -- dải "Bản xem trước" (namespace `Preview`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/*` (+spec) và `apps/api/src/modules/identity/*` -- schema, `PreviewTokenService`, `POST /admin/preview-tokens` -- AD-19
- [x] `apps/api/src/modules/catalog/*` -- dựng chi tiết dùng chung, `GET /sheets/:id/preview` -- FR12
- [x] `apps/api/test/{unit,integration}/*` -- phủ Matrix API và allowlist -- AC
- [x] `apps/web/src/lib/catalog.ts`, `app/[locale]/preview/sheet/[id]/{page,loading}.tsx`, `next.config.ts` + module header, `messages/{vi,en}.json` (+test) -- route preview và header bảo mật -- AD-19
- [x] `apps/admin/src/components/sheets/sheet-editor.tsx`, `src/lib/api/sheets.ts`, `Dockerfile`, `docker-compose.yml`, `.env.example` (+test) -- nút "Xem như người dùng" -- UX-DR23
- [x] `README.md` -- ghi preview token, route, biến `NEXT_PUBLIC_SITE_URL` cho admin -- tài liệu

**Acceptance Criteria:**
- Given Sheet Draft ở trang sửa admin, when bấm "Xem như người dùng", then một tab mới mở `/vi/preview/sheet/{id}?token=…` hiển thị đúng bố cục trang chi tiết (kể cả MIDI player) với dải "Bản xem trước", và Sheet vẫn là Draft (không xuất hiện ở Level/Search/sitemap).
- Given route preview, when mở với token hợp lệ, then response `no-store`, `noindex, nofollow`, `Referrer-Policy: no-referrer` và không có request đếm lượt xem.
- Given token thiếu, sai, hết hạn, của Sheet khác, hoặc là access token, when truy cập route preview, then trả 404 giống nhau; và preview token không gọi được `/admin/*`.
- Given `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (build không đặt `NODE_ENV=development`).

## Implementation Notes

- **Giới hạn đã biết: trạng thái HTTP của route preview.** Khi token thiếu/sai/hết hạn, trang render đúng giao diện 404 kèm `noindex` nhưng HTTP status là 200 (cùng hành vi với trang Sheet/Composer/Genre không tồn tại từ story trước): `notFound()` trong trang xảy ra sau khi Next đã flush shell. Không lộ dữ liệu nào và không bị index (`noindex` meta + `X-Robots-Tag`). Sửa đúng cách (kiểm ở layout, riêng preview cần `proxy.ts` chuyển token vào header) đã ghi vào `deferred-work.md` để làm cùng Story 2.11. API (`GET /sheets/:id/preview`) trả 404 thật như spec.

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Header của route preview chỉ được test như hằng số, không theo cấu hình thật của `next.config` | medium | patch | Test mới tìm rule theo `source` trong `config.headers()` và khẳng định ba header; thêm kiểm chứng runtime bằng server standalone + `curl` (đủ `no-store`, `noindex, nofollow`, `no-referrer`, CSP) |
| Dải thông báo ghi "chỉ bạn thấy" trong khi ai có link đều xem được | medium | patch | Đổi câu chữ vi/en thành "bất kỳ ai có liên kết này… đừng chia sẻ" |
| `GET /sheets/:id/preview` không có throttle (khác route beacon); `POST /admin/preview-tokens` không để lại dấu vết | low | patch | Throttle 60 request/phút/IP (web SSR vẫn được miễn qua secret nội bộ); log `{userId, sheetId, expiresAt}`, không log token |
| Nhấp đúp mở hai tab và xin hai token (`busy` chỉ có hiệu lực sau render) | medium | patch | Cờ `useRef` đồng bộ; test bấm hai lần liên tiếp chỉ mở một tab và gọi API một lần |
| `generateMetadata` ném khi API lỗi hạ tầng, có thể làm mất `noindex` | low | patch | `.catch(() => null)` rồi trả `robots`; test |
| `jwt.decode` có thể trả `null` → TypeError | low | patch | Kiểm `exp` kiểu số, ném lỗi rõ ràng |
| Schema shared chưa có test | low | patch | Thêm test hằng số, request, response vào `auth.spec.ts` |
| `vi.stubGlobal('open')` chỉ dọn cuối thân test | low | patch | Bọc `try/finally` |
| Phản hồi 404 của route preview thực tế có HTTP 200 (soft 404) | medium | defer | Đã xác minh bằng `curl` trên server standalone: giao diện 404 và `noindex` đúng nhưng trạng thái 200, giống trang Sheet/Composer/Genre từ story trước; `htmlLimitedBots` và bỏ `loading.tsx` đều không đổi kết quả; sửa cần kiểm ở layout (riêng preview cần `proxy.ts` chuyển token vào header). Ghi vào `deferred-work.md` |
| Token nằm trong URL (lịch sử trình duyệt, log proxy) | low | - | Đánh đổi có chủ đích của spec (tab mới mở bằng link); giảm thiểu bằng hạn 10 phút, `no-referrer`, `no-store`; không đổi sang cookie vì ngoài phạm vi |
| Cùng khoá ký với access token | false | - | Đã có test hai chiều: preview token không vào được `/admin/*` (401) và access token không qua `verify` (404) |
| Hết hạn chỉ hiện 404 chung, không gợi ý mở lại từ admin | low | - | Spec yêu cầu 404 giống nhau cho mọi lỗi token để không lộ thông tin |
| Nút nằm xa form, không biết form có thay đổi chưa lưu | low | - | Ghi chú "xem bản đã lưu" ngay cạnh nút; preview theo bản đã lưu là quyết định của spec |
| 400/401 của API bị gộp thành 404; API gọi hai lần (metadata + trang) | low | - | Đúng yêu cầu spec; fetch cùng URL trong một request được Next gộp |
| Không kiểm vai trò khi xin token | low | - | Các route `/admin/*` khác cũng chỉ dựa vào guard JWT (v1 chỉ có SUPER_ADMIN) |
| Locale preview cố định `vi`; `NEXT_PUBLIC_SITE_URL` không kiểm hợp lệ lúc build; `loading.tsx` chưa test | low | - | Founder dùng tiếng Việt; cấu hình triển khai đã ghi trong README; không có hành vi đáng test |

## Design Notes

- **Cùng secret, khác audience:** `identity` đã có `JwtModule`; thêm khoá riêng đòi thêm biến môi trường bắt buộc mà không tăng an toàn đáng kể. Audience riêng + thiếu `sub`/`role` ngăn dùng chéo ở cả hai chiều, và hạn 10 phút giới hạn rủi ro nếu URL bị lộ.
- **Web không giữ secret:** web chỉ chuyển token cho API, API là nơi duy nhất xác minh; tránh nhân đôi logic và tránh đưa `JWT_ACCESS_SECRET` vào web.
- **Token trong header, không trong URL API:** URL trang preview buộc phải chứa token (tab mới mở bằng link), nhưng lời gọi nội bộ web→API dùng header để token không vào log URL của API.
- **Tab mở đồng bộ:** trình duyệt chặn `window.open` sau `await`; mở tab trống ngay trong cú bấm rồi gán URL khi có token.
- **Preview hiển thị bản đã lưu:** form chưa lưu nằm ở trạng thái client, server không biết; ghi chú ngay cạnh nút để founder không hiểu nhầm.
- **`related`/`seriesSheets` chỉ PUBLISHED:** preview một Draft không được làm lộ Draft khác.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0

**Manual checks:**
- Stack compose: đăng nhập admin, mở một Sheet Draft đã upload PDF/MIDI, bấm "Xem như người dùng": tab mới hiển thị trang chi tiết có ảnh trang và player; xem Network không có `POST …/view`; thử dán URL preview sang cửa sổ ẩn danh sau 10 phút thấy 404; kiểm tra header phản hồi (`curl -I`).
