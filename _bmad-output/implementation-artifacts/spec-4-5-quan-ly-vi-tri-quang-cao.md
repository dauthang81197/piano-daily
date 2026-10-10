---
title: 'Story 4.5 — Quản lý vị trí quảng cáo'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '07b03085ffed52702cfcfc5f28116db448bc4e52'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-cai-dat-site.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Founder chưa có nơi nào để tạo, sửa và bật/tắt quảng cáo theo từng vị trí; module `ads` và bảng `AdSlot` chưa tồn tại, trang Quảng cáo ở admin còn là placeholder.

**Approach:** Thêm module `ads` (bảng `AdSlot`, API admin CRUD và bật/tắt chỉ cho SUPER_ADMIN, `GET /ads` công khai chỉ trả slot đang bật) và trang Quảng cáo ở admin có form kèm preview trong iframe sandbox. Việc hiển thị trên site công khai thuộc Story 4.6.

## Boundaries & Constraints

**Always:** Migration viết tay (thư mục `YYYYMMDDHHMMSS_ad_slots`, sau migration mới nhất): enum `AdPosition` (HEADER, SIDEBAR_LEFT, SIDEBAR_RIGHT, IN_LIST, STICKY_BOTTOM, IN_CONTENT; Prisma enum + const trong shared + test trùng khớp theo mẫu `role-enum.spec.ts`) và bảng `ad_slots` (id uuidv7, `position` UNIQUE nên mỗi vị trí tối đa một slot, `html_code` text null, `image` text null, `link` text null, `is_active` boolean mặc định false, `created_at`, `updated_at`) với CHECK có `html_code` HOẶC (`image` VÀ `link`). `ads` là module duy nhất ghi `ad_slots` (AD-1), đăng ký trong `app.module.ts`. Route admin: `GET admin/ads` (mọi admin đã đăng nhập xem được), `POST admin/ads`, `PATCH admin/ads/:id`, `DELETE admin/ads/:id`, `PATCH admin/ads/:id/active` (body `{ isActive }`): mọi thao tác ghi chỉ SUPER_ADMIN, role khác -> 403 `FORBIDDEN` (kiểm ở API là nguồn quyết định; thêm `@Roles`/guard nhỏ hoặc kiểm trong service, theo `@CurrentUser()`), trong đó nhập/sửa `html_code` cũng chỉ SUPER_ADMIN. `GET /ads` (`@Public`, thêm `'GET /ads'` vào `PUBLIC_ROUTES` trong `public-routes.spec.ts`) chỉ trả slot `is_active`, gồm `position`, `htmlCode`, `image`, `link`, không có trường nội bộ. Validation (zod trong shared `ads.ts`, mẫu `settings.ts`): `position` thuộc enum; `htmlCode` ≤ 20000 ký tự; `image` và `link` là URL `https` (không user/password, ≤ 2048); slot phải có `htmlCode` hoặc cả `image` lẫn `link`, không cho trống cả hai; trùng `position` -> 409. Ảnh quảng cáo là URL, không có endpoint upload. Sau mỗi create/update/delete/đổi trạng thái gọi `void cache.notify([cacheTags.ads])` (import `CacheInvalidatorModule`, best-effort sau commit). UI: trang `/ads` liệt kê slot theo vị trí (bảng đơn giản, không dùng `TaxonomyTable`), dialog tạo/sửa (react-hook-form + `zodResolver`, `FormError`, `applyServerError`), bật/tắt bằng checkbox, xoá bằng `DeleteConfirm`; trường `html_code` bị vô hiệu cho EDITOR (theo `useAuth().user.role`), mọi nút ghi ẩn hoặc vô hiệu cho EDITOR kèm lý do; form có preview `htmlCode` trong `<iframe sandbox="allow-scripts allow-popups" srcDoc>` không có `allow-same-origin` và không bao giờ chèn HTML vào DOM của admin. Log không chứa `html_code`.

**Never:** Không sửa web công khai (Story 4.6); không thêm `allow-same-origin` hay `dangerouslySetInnerHTML`; không trả `html_code` của slot đang tắt; không upload ảnh; không ghi `ad_slots` ngoài module `ads`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| SUPER_ADMIN tạo slot html | `HEADER` + `htmlCode` | 201, lưu, revalidate `ads` | N/A |
| Tạo slot ảnh | `SIDEBAR_LEFT` + `image` + `link` https | 201, lưu | N/A |
| Thiếu nội dung | Không html, thiếu image hoặc link | Không ghi | 400 `details` theo trường |
| URL sai | `http://`, `javascript:` | Không ghi | 400 |
| Trùng vị trí | Đã có slot `HEADER` | Không ghi | 409 |
| EDITOR ghi | POST/PATCH/DELETE/active | Không ghi | 403 `FORBIDDEN` |
| EDITOR xem | `GET admin/ads` | 200 danh sách | N/A |
| Bật/tắt | `PATCH :id/active` | Đổi `is_active`, revalidate | id lạ -> 404 |
| Xoá | `DELETE :id` | 204, revalidate | id lạ -> 404 |
| Công khai | `GET /ads` không đăng nhập | Chỉ slot đang bật, 4 trường công khai | N/A |
| Preview | `htmlCode` có `<script>` | Chạy trong iframe sandbox, không chạm DOM admin | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma`, `apps/api/prisma/migrations/*_ad_slots/migration.sql` -- enum `AdPosition`, model `AdSlot` (`@@map("ad_slots")`, mẫu `SiteSetting`/migration `20261009100000_orders_site_settings`: `CREATE TYPE`, `uuidv7()`, `TIMESTAMPTZ(6)`, CHECK có tên); chạy `prisma generate`.
- `packages/shared/src/ads.ts` (mới, export trong `index.ts`) -- `AdPosition`, `adPositionSchema`, `isAdUrl` (mẫu `isSiteYoutubeUrl` trong `settings.ts`), body create/update/active, response admin và public, `ads.spec.ts`.
- `apps/api/src/modules/ads/` (mới: `ads.module.ts`, `ads.service.ts`, `ads.controller.ts` admin + public controller trong cùng file theo `settings.controller.ts`) -- đăng ký trong `apps/api/src/app.module.ts`; import `CacheInvalidatorModule` (`catalog/cache-invalidator.module.ts`); role từ `@CurrentUser()` (`identity/current-user.decorator.ts`), `Role.SUPER_ADMIN` trong shared `auth.ts`; `ErrorCode.FORBIDDEN` có sẵn. Lỗi trùng unique -> 409 (xem `catalog/prisma-errors.ts`).
- `apps/api/test/integration/public-routes.spec.ts` (L11-29) -- thêm `'GET /ads'`; `apps/api/test/unit/role-enum.spec.ts` -- mẫu so enum shared với `src/generated/enums` cho `AdPosition`.
- `apps/admin/src/app/(admin)/ads/page.tsx` (thay placeholder), `components/ads/ad-table.tsx`, `ad-form.tsx`, `ad-preview.tsx` (mới), `lib/api/ads.ts` (mẫu `lib/api/settings.ts`) -- mẫu form `taxonomy/composer-form.tsx` (+ `server-error.ts`), `taxonomy/delete-confirm.tsx`, `ui/table`, `ui/dialog`, checkbox trần như `settings/settings-form.tsx`; `useAuth()` ở `lib/auth/auth-provider.tsx`; nav `/ads` đã có.
- Test: shared `ads.spec.ts`; API unit (service, quyền) + integration (Postgres: CRUD, 403 EDITOR, 409, `GET /ads` chỉ slot bật, revalidate, CHECK); admin `ads.test.tsx` (mẫu `settings.test.tsx`, `test/helpers.ts`: SUPER_ADMIN và biến thể EDITOR, kiểm iframe `sandbox` không có `allow-same-origin`).

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration + `packages/shared/src/ads.ts` -- bảng, enum, schema, test trùng enum
- [x] `apps/api/src/modules/ads` -- service, controller admin + public, quyền SUPER_ADMIN, revalidate, `app.module`, allowlist, test đơn vị và integration theo ma trận
- [x] `apps/admin` -- trang Quảng cáo (bảng, form, preview iframe sandbox, bật/tắt, xoá, ẩn theo role), `adsApi`, test

**Acceptance Criteria:**
- Given migration tạo `AdSlot`, when SUPER_ADMIN tạo, sửa, xoá hoặc bật/tắt slot ở trang Quảng cáo, then thay đổi được lưu, tag `ads` được revalidate và `GET /ads` (`@Public`) chỉ trả các slot `is_active`.
- Given form AdSlot, when founder nhập `html_code`, then chỉ SUPER_ADMIN lưu được, và form có preview render trong iframe sandbox (không `allow-same-origin`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| `isAdUrl` nhận `https:example.com` và lưu chuỗi thô | medium | patch (đã sửa) | Yêu cầu chuỗi bắt đầu `https://`; có test |
| Nửa cặp image/link được lưu khi đã có htmlCode, và lộ ở `GET /ads` | medium | patch (đã sửa) | `requireContent` từ chối cặp thiếu; có test |
| PATCH thiếu khoá âm thầm xoá nội dung (`?? null`) | medium | patch (đã sửa) | Body update bắt buộc đủ 3 khoá (null/rỗng để bỏ trống); sửa test integration 404 |
| CHECK của DB yếu hơn quy tắc ứng dụng (cho phép URL không phải https) | medium | patch (đã sửa) | Thêm `ad_slots_urls_check` vào migration (CI chạy migration) |
| Danh sách công khai thiếu tiebreak `id` | low | patch (đã sửa) | `orderBy: [createdAt, id]` |
| Không có test luồng sửa của SUPER_ADMIN ở UI | medium | patch (đã sửa) | Thêm test PATCH đủ nội dung, không có `position` |
| `html_code` công khai không có chốt ở web | low | reject | Story 4.6 đã quy định iframe sandbox trong AC; ngoài phạm vi |
| localhost/IP nội bộ trong URL, audit trail, CSP cho preview, `allow-popups-to-escape-sandbox` | low | reject | Chỉ SUPER_ADMIN nhập; ngoài intent |
| Dialog/danh sách cũ khi nhiều admin, preview cũ, `maxLength` cắt im lặng, tạo khi hết vị trí | low | reject | Chỉ founder dùng; server vẫn trả 409/404 rõ ràng |
| Guard trả 403 thay vì 401 khi thiếu user; P2004 thành 500 | false | reject | JwtAuthGuard toàn cục chạy trước nên luôn có user; CHECK đã được chặn ở tầng schema |
| Test unit `it.each` mock cả hai, `TRUNCATE users` ở integration | low | reject | Theo mẫu spec integration hiện có |
| Spec/sprint chưa đồng bộ, log rỗng | low | reject | Cập nhật ở bước hoàn tất |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test shared, admin, API unit + integration (CI chạy integration, gồm migration mới) -- expected: pass

**Manual checks:**
- Ở admin: tạo slot html (preview chạy script trong khung), tạo slot ảnh, bật/tắt; gọi `GET /ads` thấy đúng các slot đang bật; đăng nhập EDITOR thấy form chỉ đọc.
