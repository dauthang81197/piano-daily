---
title: 'Quảng cáo affiliate: nhiều sản phẩm, nền tảng, tải ảnh và đếm lượt bấm'
type: 'feature'
created: '2026-10-12'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '6abbac6aa75312bd17af922b547c7bddb2d4f655'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5-quan-ly-vi-tri-quang-cao.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-6-hien-thi-quang-cao-tren-site-cong-khai.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Mỗi vị trí quảng cáo chỉ có một ảnh + link, ảnh phải tự đặt ở nơi khác rồi dán URL, không biết link thuộc Shopee hay TikTok, và không biết lượt bấm nào hiệu quả. Founder muốn gắn nhiều sản phẩm affiliate trong một vị trí.

**Approach:** Tách "sản phẩm" (ảnh, link, nền tảng, nhãn) khỏi slot: một slot có HTML hoặc danh sách tối đa 12 sản phẩm. Admin tải ảnh lên R2 ngay trong form. Web hiện huy hiệu nền tảng và đếm lượt bấm bằng beacon theo ngày, không lưu IP.

## Boundaries & Constraints

**Always:** Migration viết tay `20261012100000_ad_items_clicks`: enum `AdPlatform` (SHOPEE, TIKTOK, LAZADA, OTHER; Prisma + const trong shared + test khớp theo mẫu `AdPosition`); bảng `ad_items` (id uuidv7, `slot_id` FK CASCADE, `platform`, `image`, `link` NOT NULL, `label` text null ≤ 120, `sort_order` int, timestamps, CHECK `image`/`link` bắt đầu `https://`); bảng `ad_clicks` (`item_id` FK CASCADE, `day` date, `count` int ≥ 0, PK (`item_id`,`day`)). Migration chuyển dữ liệu cũ: mỗi slot có `image` và `link` thành một item `OTHER`, rồi bỏ hai CHECK cũ và cột `ad_slots.image`, `ad_slots.link`. `ads` là module duy nhất ghi `ad_slots`, `ad_items`, `ad_clicks`; SQL thô chỉ trong repository (`INSERT … ON CONFLICT DO UPDATE count = count + 1`). Slot hợp lệ khi có `htmlCode` HOẶC ≥ 1 sản phẩm (kiểm trong service, 400 theo trường); tối đa 12 sản phẩm; URL `https` (hàm `isAdUrl`). `POST`/`PATCH admin/ads` nhận `items` đầy đủ: item có `id` thì cập nhật, không `id` thì tạo, thiếu thì xoá (một transaction, giữ `id` để giữ số lượt bấm). Ghi chỉ SUPER_ADMIN (`SuperAdminGuard`). `POST admin/ads/images` (SuperAdminGuard, multipart `file`): chỉ PNG/JPEG/WebP nhận qua magic bytes, ≤ 2 MB, chuẩn hoá WebP cạnh dài ≤ 1200 px, lưu `public/ads/<sha256>.webp` (service trong `media`), trả `{ url }` là URL công khai. `POST ads/items/:id/click` (`@Public`, `ThrottlerGuard` 60/phút theo `getClientIp()`, `Cache-Control: no-store`, luôn 204; id lạ hoặc sai dạng không ghi, không lộ tồn tại; không lưu IP, UA hay cookie). `GET /ads` công khai trả `{ position, htmlCode, items: [{ id, platform, image, link, label }] }`, chỉ slot đang bật, không có số lượt bấm. `GET admin/ads` trả thêm `clicks7d`, `clicks30d`, `clicksTotal` cho mỗi sản phẩm. Mọi thay đổi vẫn `cache.notify([cacheTags.ads])`. Web: huy hiệu nền tảng (i18n `Ads.platform.*`) cạnh nhãn "Quảng cáo"; nhiều sản phẩm xếp hàng cuộn ngang ở HEADER, IN_LIST, IN_CONTENT, STICKY_BOTTOM và xếp dọc ở hai SIDEBAR; mỗi link giữ `rel="noopener noreferrer sponsored" target="_blank"` và gửi beacon (`navigator.sendBeacon` tới `NEXT_PUBLIC_API_URL`, mất cấu hình thì bỏ qua, không ném). Giữ nguyên: `htmlCode` chỉ trong iframe sandbox không `allow-same-origin`, CSP không nới (`img-src https:` và `connect-src` API đã có), slot không nội dung hiển thị được thì trả `null` không để lại khoảng trống, preview Draft không hiện quảng cáo.

**Never:** Không đếm lượt bấm của slot `htmlCode` (nằm trong iframe); không lưu IP/UA/cookie của người bấm; không nới CSP `script-src`/`frame-src`; không dùng `dangerouslySetInnerHTML`; không để web hoặc admin ghi bảng quảng cáo ngoài `ads`; không làm AdSense (phạm vi riêng); không xoá ảnh trên R2 khi gỡ sản phẩm.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo slot nhiều sản phẩm | `IN_LIST` + 3 items (Shopee, TikTok, OTHER) | 201, items theo thứ tự gửi, revalidate | N/A |
| Slot rỗng | Không HTML, `items: []` | Không ghi | 400 theo trường |
| Quá 12 sản phẩm | 13 items | Không ghi | 400 |
| Link/ảnh sai | `http://`, `javascript:` | Không ghi | 400 theo item |
| Sửa slot | Item cũ giữ `id`, thêm 1, bỏ 1 | Item giữ `id` còn nguyên số lượt bấm; item bỏ bị xoá cùng lượt bấm | N/A |
| EDITOR ghi hoặc tải ảnh | POST/PATCH/DELETE/images | Không ghi | 403 `FORBIDDEN` |
| Tải ảnh hợp lệ | PNG 500 KB | 201 `{ url }` dạng `…/public/ads/<hash>.webp`, ≤ 1200 px | N/A |
| Tải ảnh lỗi | > 2 MB / không phải ảnh / hỏng | Không lưu | 413 `FILE_TOO_LARGE` / 400 theo trường `file` |
| Bấm sản phẩm | `POST ads/items/:id/click` | 204, `count + 1` cho (item, hôm nay) | id lạ: 204 không ghi |
| Spam bấm | > 60/phút/IP | 429 | `TOO_MANY_REQUESTS` |
| Dữ liệu cũ | Slot có `image` + `link` trước migration | Thành 1 item `OTHER`, hiển thị như cũ | N/A |
| Web | Slot đang bật có items | Khung dashed, huy hiệu nền tảng, cuộn ngang/dọc theo vị trí | API lỗi: `[]`, trang vẫn chạy |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration `20261012100000_ad_items_clicks` -- thêm `AdItem`, `AdClick`, enum `AdPlatform`; bỏ `AdSlot.image/link` và hai CHECK; chuyển dữ liệu cũ (mẫu `20261010090000_ad_slots`).
- `packages/shared/src/ads.ts` -- thêm `AdPlatform`, `adItemInputSchema`, `AD_ITEMS_MAX`, đổi `create/updateAdSlotBodySchema`, `adSlotSchema`, `publicAdSlotSchema`; thêm `adImageResponseSchema`. Giữ `isAdUrl`, `AdPosition`.
- `apps/api/src/modules/ads/{ads.service,ads.controller,ads.module}.ts` -- đổi CRUD sang items, thêm `POST admin/ads/images` (mẫu `settings.controller.ts` `LogoUploadInterceptor`) và `PublicAdsController` click; thêm `ad-click.repository.ts` (SQL thô).
- `apps/api/src/modules/media/ad-image.service.ts` -- mẫu `site-logo.service.ts` (sharp, magic bytes); export từ `media.module.ts`.
- `apps/api/test/integration/public-routes.spec.ts` -- thêm `'POST /ads/items/:id/click'` vào allowlist; `apps/api/test/unit/ads.service.spec.ts` và integration ads: cập nhật theo items.
- `apps/admin/src/lib/api/ads.ts`, `components/ads/{ad-form,ad-table,ad-labels}.tsx` -- `uploadImage` (mẫu `settingsApi.uploadLogo` + `uploadMultipart`), editor danh sách sản phẩm, cột loại/lượt bấm.
- `apps/web/src/components/ads/{ad-slot-frame,sticky-bottom-ad}.tsx`, `ad-item-link.tsx` (client, beacon), `apps/web/src/messages/{vi,en}.json` -- hiển thị items, huy hiệu, `findAdSlot` kiểm items.
- `apps/web/src/lib/public-env.ts` -- `publicApiUrl()` dùng cho beacon (đã có); không đổi `csp.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration `20261012100000_ad_items_clicks` -- bảng, enum, chuyển dữ liệu, bỏ cột cũ
- [x] `packages/shared/src/ads.ts` (+ test, test enum khớp Prisma) -- schema items, nền tảng, ảnh, public/admin
- [x] `ad-image.service.ts` + `media.module.ts` -- xử lý và lưu ảnh quảng cáo
- [x] `ads.service.ts`, `ads.controller.ts`, `ads.module.ts`, `ad-click.repository.ts` -- items, ảnh, click, thống kê
- [x] API tests (unit + integration: ma trận, quyền, throttle, migration dữ liệu cũ, allowlist)
- [x] Admin: `ads.ts`, `ad-form.tsx`, `ad-table.tsx`, test -- editor sản phẩm, tải ảnh, số lượt bấm
- [x] Web: `ad-slot-frame.tsx`, `sticky-bottom-ad.tsx`, `ad-item-link.tsx`, messages, test -- items, huy hiệu, beacon
- [x] README mục quảng cáo -- cách gắn Shopee/TikTok, tải ảnh, xem lượt bấm

**Acceptance Criteria:**
- Given SUPER_ADMIN tạo slot `IN_LIST` có 3 sản phẩm và bật, when tải trang danh sách, then 3 sản phẩm hiện cùng huy hiệu nền tảng và mỗi link có `rel` chứa `sponsored`.
- Given founder tải ảnh trong form, when lưu, then URL ảnh điền sẵn là URL R2 công khai và ảnh hiển thị ở web.
- Given người dùng bấm một sản phẩm, when trang gửi beacon, then admin thấy `clicks7d` của sản phẩm đó tăng 1 và không có IP nào được lưu.
- Given slot cũ có `image` + `link`, when chạy migration, then slot hiển thị y như trước dưới dạng một sản phẩm `OTHER`.

## Implementation Notes

- Triển khai trực tiếp (không subagent triển khai), theo lớp: database → shared → API → admin → web, chạy kiểm tra sau mỗi lớp.
- `ads` giữ `ad_slots`, `ad_items`, `ad_clicks`; SQL thô chỉ ở `ad-click.repository.ts`. `increment` dùng `INSERT … SELECT` từ `ad_items` nên id lạ không ghi và không gây lỗi khoá ngoại; `PATCH` dùng một transaction và kiểm `id` sản phẩm thuộc slot (400 `items.N.id`).
- Form admin dùng `useFieldArray({ keyName: 'key' })`: mặc định react-hook-form ghi đè thuộc tính `id` của phần tử, làm mất `id` sản phẩm (test bắt được). Test fixture cần `id` dạng UUID vì schema dùng `z.uuid()`.
- `AdImageService` ở `media` tái dùng `isSupportedLogoImage` (magic bytes) của `SiteLogoService`; trả URL công khai (`StorageService.publicUrl`).
- Test migration chạy trên schema tạm `mig_ads` trong một transaction rollback: tạo bảng `ad_slots` dạng cũ, chèn dữ liệu, chạy từng câu của file migration, kiểm kết quả.
- Không đổi `csp.ts`: `img-src https:` và `connect-src` có origin API (beacon dùng `connect-src`).
- API unit còn 7 test lỗi ở script backup (`backup.sh`), cũng lỗi trên `develop` sạch; không liên quan thay đổi này.

## Spec Change Log

## Review Triage Log

- **medium | patch — Migration chuyển cả slot có HTML + ảnh/link thành sản phẩm:** Trước đây web chỉ hiện HTML khi có `html_code` (ảnh/link bị bỏ qua), nên slot cũ có cả hai sẽ hiện thêm sản phẩm. Backfill nay chỉ chuyển slot không có HTML; test migration chạy thật có slot HTML + ảnh/link, khẳng định không sinh sản phẩm.
- **medium | patch — Tải ảnh gắn theo chỉ số dòng (xoá/đổi thứ tự/lưu khi đang tải làm URL rơi nhầm sản phẩm, lỗi hiện nhầm dòng):** Khoá thêm/xoá/đổi thứ tự và nút Lưu khi đang tải; có test.
- **medium | patch — `update` mất ánh xạ P2025 (slot/sản phẩm bị xoá đồng thời) thành 404, ra 500:** Bọc transaction, P2025 thành 404; có test.
- **low | patch — Beacon trả 500 khi DB lỗi dù tài liệu ghi luôn 204:** `registerClick` nuốt lỗi, chỉ log tên lỗi; có test.
- **low | patch — Bấm giữa chuột không được đếm:** thêm `onAuxClick` (button 1); có test, chuột phải không đếm.
- **low | patch — Nhiều link cùng tên truy cập "Quảng cáo":** `aria-label` thêm nhãn hoặc tên nền tảng; có test.
- **low | patch — Thanh `STICKY_BOTTOM` có huy hiệu/nhãn/thanh cuộn có thể cao hơn khối đệm `h-36`:** nâng đệm lên `h-44`.
- **low | patch — Test admin dùng `getByText('4')` dễ vỡ:** giới hạn trong dòng của bảng.
- **false — AdImageService nhận SVG/GIF:** `isSupportedLogoImage` chỉ nhận PNG, JPEG, WebP theo magic bytes (đã kiểm trong `site-logo.service.ts`).
- **false — Thiếu test throttle click, `sendAdClick`, `AdItemLink`, id sản phẩm của slot khác/trùng:** đã có (`ads.spec.ts` 60/phút rồi 429, `ad-slot-frame.test.tsx` beacon/fetch, `ads.service.spec.ts` và `ads.spec.ts` cho id lạ/trùng).
- **false — Mất `id` sản phẩm do `keyName` deprecated:** test admin khẳng định PATCH gửi `id` và số lượt bấm hiện đúng.
- **low (rejected) — Invariant slot có nội dung chỉ ở zod, không có CHECK DB; CHECK DB chưa chặn 2048 ký tự/user:pass/`sort_order ≥ 0`; ép kiểu `as never` trong form:** mọi đường ghi đi qua pipe zod của controller; sửa thêm phức tạp hơn lợi ích.
- **low (rejected) — Click vào slot đang tắt vẫn được đếm; không giới hạn tần suất upload (chỉ SUPER_ADMIN); không khoá hàng khi hai admin sửa cùng lúc; ảnh lỗi 404 hiện icon vỡ; không preview sản phẩm theo vị trí; ảnh không có width/height (CLS); thứ tự sản phẩm so với HTML cố định; cache web cũ sau deploy ẩn quảng cáo tối đa 10 phút:** hiếm gặp (một founder), hoặc chỉ thoáng qua; vá cần thêm nhánh/tham số.
- **low (rejected) — Xoá sản phẩm hoặc slot xoá luôn lịch sử lượt bấm; không dọn `ad_clicks` cũ:** theo thiết kế (spec: xoá sản phẩm xoá lượt bấm); bảng nhỏ (một dòng mỗi sản phẩm mỗi ngày).
- **low (rejected) — Migration không hoàn tác được (bỏ cột cũ):** theo spec; chưa có dữ liệu production.

## Design Notes

Đếm theo ngày (`ad_clicks`) thay vì ghi từng lượt: nhẹ, không cần dọn, không có dữ liệu cá nhân; thống kê 7/30 ngày và tổng lấy bằng `SUM`. Beacon không mang nội dung nên là request đơn giản, không gây preflight CORS. Bot cũng có thể bấm nên số lượt chỉ để so sánh tương đối giữa các sản phẩm.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint && pnpm build` -- expected: pass
- shared/web/admin/API unit và API integration (Docker, `unset NODE_ENV`) -- expected: pass
