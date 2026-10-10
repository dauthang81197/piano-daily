---
title: 'Story 4.4 — Cài đặt site'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ab7a75e47ba90f3ef2f7d953857f0e7e4880a1bb'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-3-hoan-tien-tu-admin.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tên site, logo, mô tả SEO, link YouTube, công tắc thanh toán và mặc định của token đang cứng trong code/env/migration, nên founder phải nhờ sửa code mỗi lần đổi; `SettingsService` chỉ có đọc, chưa có ghi và trang Cài đặt ở admin còn là placeholder.

**Approach:** Thêm đường ghi vào module `settings` (admin `GET/PUT admin/settings`, upload logo, endpoint public chỉ đọc cho web), trang Cài đặt ở admin, và để header/footer/meta mặc định của web đọc cài đặt qua tag `settings` được revalidate sau khi lưu.

## Boundaries & Constraints

**Always:** Chỉ module `settings` ghi `site_settings` (AD-1), qua một upsert duy nhất trong `SettingsService`; thêm khoá `site_name`, `logo_key`, `seo_description`, `youtube_url` (giá trị mặc định trong code khi chưa có, không bắt buộc migration seed). Route admin `GET admin/settings` và `PUT admin/settings` (body đủ trường, zod trong shared) cùng `POST admin/settings/logo` (multipart `file`, PNG/JPEG/WebP ≤ 2 MB, chuẩn hoá về WebP cạnh dài ≤ 512 px bằng `sharp`, key `public/site/logo-<sha256>.webp` qua `StorageService.putPublic`, chỉ lưu key; xoá file logo cũ sau khi lưu). Route public chỉ đọc `GET settings/site` trả `{ siteName, logoUrl, seoDescription, youtubeUrl }` (logo qua `publicUrl`, không lộ khoá khác hay cài đặt thanh toán/token), thêm vào allowlist route public của test. Ràng buộc giá trị: tên site 1–80 ký tự; mô tả SEO ≤ 320; YouTube để trống hoặc URL `https` của `youtube.com`/`youtu.be`; số ngày hiệu lực token số nguyên 1–3650 và số lượt tải mặc định số nguyên 1–1000 (tái dùng hằng đang riêng tư trong `SettingsService`, export để dùng chung); mọi giá trị sai bị từ chối 400 có `details` theo trường và hiện qua `FormError` ở admin. Công tắc `payments_enabled` lưu 'true'/'false'; tắt thì `create-order` trả `PAYMENTS_DISABLED` và nút mua trả phí không khả dụng (hành vi đã có ở server và web, giữ nguyên), token đã phát vẫn tải được, Sheet miễn phí không ảnh hưởng. Đổi mặc định token chỉ ảnh hưởng token phát sau đó (đã chụp giá trị lúc phát). Sau khi lưu thành công (và sau upload logo) gọi revalidate tag `settings` bằng cơ chế `CacheInvalidator.notify` hiện có (best-effort, sau commit); nếu cần tách provider dùng chung để tránh vòng phụ thuộc `settings` <-> `catalog` thì tách mà không đổi hành vi catalog. Web: `fetchSiteSettings` (tag `settings`, `publicFetch`) với fallback về giá trị cũ khi lỗi; header hiện tên site và logo nếu có, footer có link YouTube nếu có, `generateMetadata` mặc định dùng tên site và mô tả SEO đã lưu (trang riêng của Sheet/Composer vẫn có metadata riêng); cho phép host ảnh logo trong CSP nếu chưa. Mọi route admin chỉ cần đăng nhập (guard toàn cục), không thêm role. Log không chứa nội dung cài đặt.

**Never:** Không đụng quảng cáo/`html_code` (Story 4.5, 4.6); không ghi `site_settings` ngoài module `settings`; không đổi `consume`, `fulfil`, hành vi tải bằng token đã phát; không thêm cài đặt song ngữ theo locale (một tên/mô tả cho mọi locale); không lộ khoá S3 hay khoá lưu trữ nội bộ.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lưu cài đặt hợp lệ | Tên, SEO, YouTube, ngày=14, lượt=10, bật thanh toán | Lưu `SiteSetting`, revalidate `settings`, web cập nhật | N/A |
| Giá trị token sai | ngày=0 / -1 / "abc" / 5000 | Không ghi gì | 400 `details[].path` theo trường; `FormError` |
| YouTube sai | `http://x.com`, chuỗi bất kỳ | Không ghi | 400 |
| Xoá link YouTube | Chuỗi rỗng | Lưu rỗng; footer ẩn link | N/A |
| Upload logo hợp lệ | PNG 200 KB | WebP ≤ 512 px lưu ở `public/site/`, key cũ bị xoá, tag revalidate | N/A |
| Logo sai | PDF / >2 MB / ảnh hỏng | Không đổi logo | 400 / 413 mã sẵn có |
| Tắt thanh toán | `payments_enabled=false` | `create-order` -> 403 `PAYMENTS_DISABLED`; nút mua khoá; token cũ vẫn tải | N/A |
| Đổi mặc định token | ngày 7 -> 30 | Token mới 30 ngày; token cũ giữ giá trị đã chụp | N/A |
| API settings lỗi ở web | `fetchSiteSettings` thất bại | Header/footer/meta dùng mặc định cũ, trang vẫn render | N/A |
| Public GET | Không đăng nhập | 200 chỉ 4 trường công khai | N/A |
| Admin chưa đăng nhập | Không bearer | N/A | 401 |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/settings/settings.service.ts` -- `SETTING_KEYS`, `get()` riêng tư, chưa có ghi; thêm `set`/upsert, `getSite()`, `updateAll()`, export hằng giới hạn; `settings.module.ts` -- thêm controllers (hiện chỉ providers/exports). Consumer cũ giữ nguyên: `catalog/public-sheets.controller.ts` (quote), `commerce/order.service.ts` (~L131, ~L248).
- `packages/shared/src/settings.ts` (mới, export trong `index.ts`) -- schema body/response + hằng giới hạn (mẫu `order.ts`/`pricing.ts`).
- `apps/api/src/modules/media/storage.service.ts` -- `putPublic`, `publicUrl`, `deleteObjects`; thêm xử lý ảnh logo (validate loại, `sharp`, key theo sha256) trong module `media`, không dùng `SheetMediaService` (đặc thù Sheet).
- `apps/api/src/modules/catalog/sheet-files.controller.ts` -- mẫu `FileInterceptor` memory + ánh xạ 413 -> `FILE_TOO_LARGE`, 400 -> `VALIDATION_FAILED`; `catalog/cache-invalidator.ts` (`notify`, L157) -- revalidate best-effort; mẫu test `test/integration/cache-revalidate.spec.ts`. `packages/shared/src/cache-tags.ts` đã có `cacheTags.settings`; `apps/web/src/app/api/revalidate/route.ts` đã nhận.
- `apps/api/test/integration/public-routes.spec.ts` (~L49) -- allowlist route public.
- `apps/web/src/lib/api.ts` (`publicFetch`) + `apps/web/src/lib/` -- thêm `fetchSiteSettings`; `apps/web/src/components/layout/header.tsx`, `footer.tsx`, `apps/web/src/app/[locale]/layout.tsx` (`generateMetadata` L19-28, render Header/Footer), `seo.ts`/`sheet-seo.ts`/`json-ld.ts`/`sitemap` (kiểm tên site cứng), `apps/web/src/lib/csp.ts` (img-src), `messages/vi.json`/`en.json` (`Meta.*`).
- `apps/admin/src/app/(admin)/settings/page.tsx` (thay placeholder), `components/settings/settings-form.tsx` (mới), `lib/api/settings.ts` (mới), `lib/api/upload.ts` (tổng quát hoá phần gửi multipart để dùng cho logo); mẫu form `sheets/bulk-pricing-form.tsx`, `orders/order-actions.tsx`; `FormError`, `form-field.tsx`, `ui/*`.
- Test: shared `settings.spec.ts`; API unit (service, xử lý logo) + integration (Postgres: GET/PUT, validation, public GET, `create-order` khi tắt thanh toán, token mới theo mặc định mới, upload logo với storage thử, revalidate được gọi); web `header`/`footer`/metadata test (mock fetch, fallback); admin `settings.test.tsx` (mẫu `orders.test.tsx`, `test/helpers.ts`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/settings.ts` + export -- schema và hằng giới hạn, test
- [x] `settings` module -- ghi/đọc, route admin + public, validation, revalidate; xử lý và lưu logo qua `media`, test đơn vị và integration theo ma trận
- [x] `apps/web` -- `fetchSiteSettings` + header, footer, metadata mặc định, CSP, fallback, test
- [x] `apps/admin` -- trang Cài đặt (form, upload logo, công tắc thanh toán, mặc định token, `FormError`), `settingsApi`, test

**Acceptance Criteria:**
- Given trang Cài đặt, when founder sửa tên site, upload logo, mô tả SEO, link YouTube rồi lưu, then giá trị nằm trong `SiteSetting`, tag `settings` được revalidate và header/footer/meta mặc định của web cập nhật ngay.
- Given founder tắt "Bật thanh toán" và lưu, when người mua tạo đơn, then `create-order` trả `PAYMENTS_DISABLED`, nút tải Sheet trả phí không khả dụng, nhưng token đã phát vẫn tải được.
- Given founder đổi số ngày và số lượt mặc định, when lưu, then chỉ token phát sau đó dùng giá trị mới (token cũ giữ nguyên), và giá trị ≤ 0 hoặc không phải số bị từ chối bằng `form-error`.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| `LocaleLayout` không có test truyền props cho Header/Footer | medium | patch (đã sửa) | Thêm test render layout, kiểm tên site, logo, link YouTube |
| Footer chỉ kiểm `startsWith('https://')` thay vì `isSiteYoutubeUrl` | low | patch (đã sửa) | Footer dùng `isSiteYoutubeUrl` của shared |
| `og:siteName` và JSON-LD vẫn dùng `SITE_NAME` cứng | medium | defer | `pageMetadata` dùng ở nhiều trang; cần đưa tên site vào `seo.ts` |
| Không có cách gỡ logo (chỉ upload) | low | defer | Spec không yêu cầu; cần DELETE hoặc cờ trong PUT |
| File logo cũ bị xoá ngay trước khi revalidate xong; hai upload đồng thời | low | defer | Cửa sổ hẹp, một founder; xoá sau revalidate là cải tiến |
| `void notify` có thể gây unhandled rejection | false | reject | `CacheInvalidator.notify` thử 3 lần và không bao giờ ném lỗi |
| PUT ghi đè toàn bộ không có kiểm soát đồng thời; tắt thanh toán không xác nhận | low | reject | Một founder dùng; ngoài intent |
| Fallback khi API lỗi bị cache dưới tag `settings` | false | reject | Fetch lỗi/ném không được Next cache; chỉ phản hồi thành công mới bị cache |
| CSP chưa sửa | false | reject | `img-src` đã cho phép media origin nơi logo nằm (`publicUrl`) |
| `toNumber` nhận `1e2`, thiếu retry khi tải cài đặt lỗi, ảnh preview thiếu fallback | low | reject | Chỉ cosmetic cho admin |
| Mô tả SEO một giá trị cho mọi locale | low | reject | Đúng quyết định trong spec (Never: không song ngữ) |
| `resetSettings` xoá khoá lạ trong test integration | low | reject | Chỉ test, DB riêng; story 4.5 dùng bảng khác |
| Thiếu test token cũ giữ giá trị, token đã phát vẫn tải khi tắt thanh toán | low | reject | Hành vi đã có test ở `token-settings.spec.ts` và các spec tải token; không đổi ở story này |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test shared, web, admin, API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Ở admin: đổi tên site, upload logo, lưu; mở trang web thấy header/footer/tiêu đề tab cập nhật; tắt thanh toán rồi thử mua và thử tải bằng link cũ.
