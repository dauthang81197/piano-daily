---
title: 'Gói thuê bao, dùng thử 7 ngày / 2 lượt, quyền tải và paywall (S2 thuê bao)'
type: 'feature'
created: '2026-10-13'
status: 'done'
baseline_commit: 'c134aa72820ea5c61ee62b20405ee073a353f193'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sau S1 mọi khách đã xác minh email tải sheet miễn phí không giới hạn. Chưa có gói thuê bao, chưa có dùng thử có giới hạn, chưa có trang chọn gói, admin chưa cấu hình được gói.

**Approach:** Thêm `Plan` (admin cấu hình) và `Subscription`; khách đã xác minh được dùng thử trong `trial_days` ngày kể từ lúc xác minh email VÀ tối đa `trial_max_downloads` lượt tải (hết cái nào trước thì hết). Quyền tải và trừ lượt gộp một chỗ, nguyên tử cùng `DownloadLog`; hết quyền thì API trả 402 và web chuyển khách sang `/pricing`. Thanh toán gói là S3/S4 (chưa có): admin cấp tay gói cho khách theo email để thử.

## Boundaries & Constraints

**Always:**
- Quyền tải của khách (chỉ Sheet miễn phí qua `POST /customer/downloads/...`), theo thứ tự: (1) `subscriptions_enabled=false` → như S1 (đã xác minh là tải được, không đếm); (2) có Subscription `ACTIVE` còn hạn (`current_period_end > now()`): không giới hạn (`download_quota` null) hoặc còn lượt trong kỳ; (3) còn dùng thử: `email_verified_at + trial_days` chưa qua và `trial_downloads_used < trial_max_downloads`. Dùng gói trước, dùng thử sau.
- Kiểm tra và trừ lượt bằng một câu `UPDATE … WHERE (điều kiện còn lượt)` kiểm `rowCount`, nằm CHUNG transaction với việc ghi `DownloadLog`; Sheet không tồn tại/không free trả 404 TRƯỚC khi trừ lượt. Tải liên tục song song không vượt quota.
- Hết quyền → HTTP 402 với mã: `QUOTA_EXCEEDED` (đang có gói nhưng hết lượt kỳ), `PLAN_REQUIRED` (từng có gói nay hết hạn/huỷ và dùng thử đã hết), `TRIAL_EXPIRED` (chưa từng có gói, dùng thử đã hết); `details.reason` trùng mã. Không bao giờ trừ lượt khi bị từ chối.
- Hết hạn gói tính theo `current_period_end` lúc kiểm tra (không cần cron). Mỗi khách tối đa một Subscription `ACTIVE` (unique một phần); cấp gói mới thay gói đang ACTIVE (gói cũ sang `CANCELLED`).
- `subscriptions_enabled` mặc định `false` trong migration (chưa có thanh toán nên chưa bật cưỡng chế ở production); `trial_days=7`, `trial_max_downloads=2`.
- Admin: chỉ SUPER_ADMIN ghi (gói, cấp gói, cài đặt như hiện có), EDITOR chỉ xem danh sách gói. Xoá gói đã có Subscription → 409 `RESOURCE_IN_USE`. Giá VND và USD (cents) nguyên ≥ 0; thời hạn ≥ 1 ngày.
- Song ngữ vi/en; `GET /plans` công khai chỉ trả gói đang bật theo `sort_order`, kèm `subscriptionsEnabled`; đổi gói/cài đặt revalidate tag web `plans`.

**Never:**
- Không thanh toán, không webhook, không VietQR/PayPal thuê bao (S3/S4); nút chọn gói chỉ là placeholder "Sắp có".
- Không đụng mua lẻ từng sheet (PayPal + email + DownloadToken) hay Sheet trả phí; không đổi CSP; không nạp three vào bundle đầu.
- Không cron/job hết hạn, không trang tài khoản đầy đủ và danh sách khách ở admin (S5), không chống lạm dụng nhiều tài khoản (S6).
- Không trừ lượt bằng đọc-rồi-ghi (race); không để web tự quyết quyền tải.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tắt cưỡng chế | `subscriptions_enabled=false`, khách đã xác minh | Tải như S1, không đổi bộ đếm | N/A |
| Dùng thử còn | bật, chưa có gói, trong 7 ngày, đã dùng 1/2 | 200 `{url}`, `trial_downloads_used`=2, 1 DownloadLog | N/A |
| Hết lượt thử | đã dùng 2/2 | Không tải | 402 `TRIAL_EXPIRED`, bộ đếm và log không đổi |
| Hết ngày thử | `email_verified_at` cách đây > 7 ngày | Không tải | 402 `TRIAL_EXPIRED` |
| Có gói không giới hạn | Subscription ACTIVE, quota null, còn hạn | 200, `downloads_used_in_period`+1, không đụng bộ đếm thử | N/A |
| Gói hết lượt kỳ, thử còn | ACTIVE, quota 10, đã dùng 10; dùng thử còn lượt | 200 bằng lượt dùng thử | N/A |
| Gói hết lượt kỳ, thử hết | như trên nhưng dùng thử đã hết | Không tải | 402 `QUOTA_EXCEEDED` |
| Gói hết hạn | ACTIVE nhưng `current_period_end` đã qua, thử hết | Không tải | 402 `PLAN_REQUIRED` |
| Race | 2 request cùng lúc khi còn đúng 1 lượt | Đúng một request 200, một request 402 | N/A |
| Sheet không free/thiếu file | bất kỳ trạng thái quota | 404 giống hệt, không trừ lượt | N/A |
| Admin cấp gói | email khách có thật + gói đang bật | Gói ACTIVE cũ → CANCELLED, tạo ACTIVE `provider=ADMIN`, hạn = now + `duration_days` | Email lạ/gói tắt: 404/400 |
| Xoá gói đang dùng | gói có Subscription | Không xoá | 409 `RESOURCE_IN_USE` |
| Xem trạng thái | `GET /customer/entitlement` | `{subscriptionsEnabled, trial{…}, subscription{…}\|null, canDownload}` | Chưa đăng nhập: 401 |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration viết tay `20261014100000_plans_subscriptions` -- `Plan`, `Subscription` (+ enum `SubscriptionStatus`, unique một phần `status='ACTIVE'` theo `customer_id`), `Customer.trial_downloads_used`, seed `site_settings` (`subscriptions_enabled=false`, `trial_days=7`, `trial_max_downloads=2`), CHECK giá/hạn/quota.
- `apps/api/src/modules/billing/` (mới, chủ bảng `plans`, `subscriptions`) -- `plans.service`, `admin-plans.controller`, `public-plans.controller`, `entitlement.service` (kiểm + trừ lượt, `getEntitlement`), `customer-entitlement.controller`, `admin-subscriptions.controller` (cấp tay), `billing.module`; đăng ký ở `app.module.ts`.
- `apps/api/src/modules/customers/customer-access.service.ts` + mới `customer-trial.repository.ts` -- giữ kiểm active/verified; repository là nơi duy nhất ghi `customers.trial_downloads_used`.
- `apps/api/src/modules/commerce/downloads.service.ts`, `download-log.repository.ts` -- sau khi resolve file: `$transaction` (trừ lượt qua `EntitlementService` + ghi log) rồi presign; `recordFree` nhận `tx`.
- `apps/api/src/modules/settings/settings.service.ts` + `packages/shared/src/settings.ts` -- 3 khoá mới (đọc nội bộ + `AdminSettings`/`updateSettingsBodySchema`), mẫu `positiveInt`.
- `apps/api/src/common/http-exception.filter.ts`, `packages/shared/src/errors.ts` -- mã `TRIAL_EXPIRED`, `QUOTA_EXCEEDED`, `PLAN_REQUIRED`.
- `packages/shared/src/subscription.ts` (mới), `cache-tags.ts` -- schema zod gói/entitlement/cấp gói; tag `plans`.
- `apps/api/src/modules/ads/*` -- mẫu CRUD admin + `SuperAdminGuard` (dùng lại guard), mẫu `CacheInvalidator.notify`.
- `apps/admin/src/app/(admin)/plans/page.tsx`, `components/plans/` (mới), `lib/api/plans.ts`, `components/admin-sidebar.tsx` (+test) -- bảng/biểu mẫu gói, form cấp tay; mục sidebar "Gói thuê bao".
- `apps/admin/src/components/settings/settings-form.tsx` (+test) -- 3 trường mới.
- `apps/web/src/app/[locale]/pricing/page.tsx`, `components/pricing/` (mới), `lib/plans.ts` -- trang giá (server, tag `plans`), banner theo `?reason=`.
- `apps/web/src/components/auth/auth-provider.tsx`, `header-auth.tsx`, `lib/customer-api.ts` -- 402 → `router.push('/pricing?reason=…')`, state `entitlement` (tải sau đăng nhập và sau mỗi lượt tải), hiển thị lượt còn lại cạnh tên khách.
- `apps/web/src/components/layout/header.tsx`, `mobile-menu.tsx`, `messages/{vi,en}.json` -- link "Bảng giá", khoá `Pricing.*`, `Auth.entitlement.*`.
- `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/{subscription,settings,errors,cache-tags,index}.ts` -- schema, mã lỗi, tag -- hợp đồng chung
- [x] `apps/api/prisma/schema.prisma` + migration -- bảng mới, cột, seed, ràng buộc -- nền dữ liệu
- [x] `apps/api/src/modules/billing/**`, `customers/customer-trial.repository.ts`, `settings.service.ts`, `app.module.ts` -- plans CRUD, entitlement, cấp tay, trừ lượt nguyên tử
- [x] `apps/api/src/modules/commerce/downloads.service.ts`, `download-log.repository.ts` -- gộp trừ lượt + log trong một transaction
- [x] `apps/api/test/**` -- unit (quy tắc quyền), integration (ma trận I/O, race song song, admin CRUD/phân quyền, cấp tay, `GET /plans`, `entitlement`, tắt cưỡng chế); cập nhật `public-routes.spec.ts`, `free-download.spec.ts`
- [x] `apps/admin/src/**` -- trang Gói thuê bao, form cấp tay, trường cài đặt, sidebar -- admin vận hành được
- [x] `apps/web/src/**` -- trang `/pricing`, chuyển hướng khi 402, hiển thị lượt còn lại, link Bảng giá, i18n + test
- [x] `README.md`, `deferred-work.md` -- tài liệu

**Acceptance Criteria:**
- Given `subscriptions_enabled=true` và khách mới xác minh, when tải 2 sheet free, then cả hai 200; lần thứ ba 402 `TRIAL_EXPIRED` và web mở `/pricing?reason=TRIAL_EXPIRED`.
- Given admin cấp gói còn hạn, when khách tải, then 200 và lượt gói giảm; hết quota kỳ và hết thử thì 402 `QUOTA_EXCEEDED`.
- Given `subscriptions_enabled=false`, when khách đã xác minh tải, then hoạt động như S1.
- Given 10 request tải song song khi còn 2 lượt thử, then đúng 2 request 200.
- Sheet trả phí mua lẻ vẫn mua/tải bằng token như trước; lint, typecheck, test API/web/admin và build xanh; `midi-player-bundle` vẫn xanh.

## Implementation Notes

- Đã làm đủ theo spec: migration `20261014100000_plans_subscriptions` (không drift), module `billing` (`PlansService`, `SubscriptionsService`, `EntitlementService`, 4 controller), `CustomerTrialRepository` (module `customers` là chủ `trial_downloads_used`), 3 khoá cài đặt, gộp trừ lượt + `DownloadLog` trong một transaction ở `DownloadsService`, admin (trang Gói thuê bao, cấp gói thủ công, trường cài đặt, sidebar), web (`/pricing`, chuyển hướng 402, hiển thị lượt còn lại, link Bảng giá), README và deferred-work.
- Quyết định: không có trạng thái `TRIALING` (dùng thử suy ra từ `email_verified_at` + `trial_days` + `trial_downloads_used`); `subscriptions_enabled` mặc định `false`; 3 mã 402 phân biệt theo lịch sử Subscription; `BillingSuperAdminGuard` riêng để thông báo đúng ngữ cảnh gói; `GET /customer/entitlement` chỉ để hiển thị, quyền tải vẫn chỉ do `consume()` quyết định.
- Bất ngờ: `site_settings` dùng chung giữa các file integration test nên `subscriptions.spec.ts` trả cài đặt về mặc định ở `afterAll`; `site-settings.spec.ts` và `create-order.spec.ts` phải cập nhật số khoá seed; test auth web phải mock `@/i18n/navigation` vì provider dùng router.
- Kiểm tra: lint/typecheck/build xanh; web 731, admin 209, shared 295 test pass; API unit chỉ còn 6 lỗi sẵn của `backup-script` (macOS); API integration 527 test, các spec liên quan pass (`sheet-files.spec.ts` chập chờn khi chạy cả bộ nhưng pass khi chạy riêng, đã gặp ở S1).

## Spec Change Log

## Review Triage Log

Ba reviewer: Blind Hunter, Edge Case Hunter, Verification Gap.

- **patch (medium)**: `consume` không kiểm khách còn hoạt động ở nhánh gói và `getEntitlement` bỏ qua `isActive` (báo tải được nhưng tải bị từ chối) → thêm `EXISTS … is_active` vào câu trừ lượt gói; `getEntitlement` trả `canDownload=false` cho khách bị khoá/không tồn tại; có test unit + integration.
- **patch (medium)**: cấp gói đồng thời cho cùng khách vi phạm unique một phần → 500 → khoá dòng khách (`FOR UPDATE`) trong transaction cấp gói; cấp cho khách bị khoá → 400; có test.
- **patch (medium)**: 402 với mã khác paywall bị gán nhầm thành `TRIAL_EXPIRED` → chỉ ba mã paywall mới chuyển sang `/pricing`, còn lại là lỗi tải chung; có test.
- **patch (medium)**: kết quả entitlement trả muộn sau khi đăng xuất/đổi khách có thể hiện cho người sau → bỏ kết quả nếu khách đã đổi (guard theo `customerIdRef`).
- **patch (medium)**: revalidate tag `plans` không có test → thêm unit `plans.service.spec.ts` (create/update/setActive/remove notify `['plans']`, lỗi thì không notify) và `cache-tags.spec.ts`.
- **patch (low)**: FK `subscriptions.customer_id` đổi `CASCADE` → `RESTRICT` (lịch sử thuê bao/thanh toán không mất theo khách; sửa trực tiếp migration chưa merge, DB test tạo lại); banner lý do paywall chỉ hiện khi trang giá có gói; sửa chữ "kỳ sau/không giới hạn" gây hiểu nhầm; admin dùng `formatUsd` của shared; ghi chú ở Cài đặt về khách cũ hết dùng thử ngay khi bật.
- **reject**: "gói hết lượt kỳ mà dùng thử còn vẫn được tải bằng dùng thử" (đúng ý spec và có dòng ma trận); schema cài đặt bắt buộc 3 trường mới (admin và API deploy cùng nhau); lý do từ chối đọc ở truy vấn riêng không nguyên tử (chỉ ảnh hưởng mã 402 hiển thị, không ảnh hưởng quyền tải); `GET /admin/plans` mở cho mọi admin (cố ý, EDITOR chỉ xem); `provider` là TEXT+CHECK (S3/S4 sẽ quyết định enum); `subscriptionConfig()` đọc DB mỗi lần tải (3 dòng, chưa là nút cổ chai).
- **defer**: quota "mỗi kỳ" chưa tự đặt lại và `EXPIRED` chưa được ghi (đợi gia hạn S3/S4; bản ACTIVE quá hạn vẫn chiếm unique một phần, đường gia hạn phải huỷ/đóng bản cũ trước); Subscription chưa chụp giá/quota/thời hạn lúc mua (sửa gói ảnh hưởng người đang dùng); tải lại cùng file hoặc nhấp đúp tốn thêm lượt, chưa có cửa sổ chống trùng/hoàn lượt; ghi người cấp gói (audit); cấp gói thay gói cũ làm mất ngày còn lại (chưa có chế độ gia hạn); trial áp dụng hồi tố khi đổi số ngày/lượt hoặc khi bật cho khách cũ (cân nhắc bắt đầu dùng thử từ lúc bật cưỡng chế); throttle cho `GET /plans`, `/customer/entitlement`; từ chối bật cưỡng chế khi chưa có gói nào/chưa có cách thanh toán; cảnh báo sắp hết dùng thử trước lần tải cuối; chống lạm dụng nhiều tài khoản (S6).

## Design Notes

`status TRIALING` không được tạo: dùng thử được suy ra từ `customers.email_verified_at` + `trial_days` + `trial_downloads_used`, nên không có hàng Subscription cho dùng thử. Hết hạn gói tính lười theo `current_period_end` nên S3/S4 chỉ cần gia hạn bằng cách đẩy `current_period_end` và đặt `provider`. Trừ lượt gói:

```sql
UPDATE subscriptions s SET downloads_used_in_period = s.downloads_used_in_period + 1
FROM plans p WHERE s.id = $1 AND p.id = s.plan_id AND s.status = 'ACTIVE' AND s.current_period_end > now()
  AND (p.download_quota IS NULL OR s.downloads_used_in_period < p.download_quota)
```

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: không lỗi
- `pnpm --filter @piano-daily/web test` và `--filter @piano-daily/admin test` -- expected: toàn bộ pass
- API unit + integration (`POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test`, `set -a && . ./.env && set +a && unset NODE_ENV`) -- expected: pass (trừ 6 test `backup-script` lỗi sẵn trên macOS)

**Manual checks (if no CLI):**
- Bật `subscriptions_enabled` ở Cài đặt, đăng nhập khách thử, tải 3 lần và xem chuyển sang `/pricing`; cấp gói ở trang Gói thuê bao rồi tải lại.
