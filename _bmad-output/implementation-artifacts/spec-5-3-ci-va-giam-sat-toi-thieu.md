---
title: 'Story 5.3 — CI và giám sát tối thiểu'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '45b7a9055c6a3f9e8c40bf849969984ca6cd44ce'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** CI chưa có bước build riêng và chưa ghi cách chặn merge khi fail; không ai biết khi site down hay khi có sự kiện tiền bạc cần xem tay (`review_required`, `LATE_CAPTURE`, lỗi webhook, backup thất bại) trước khi người mua phát hiện.

**Approach:** Thêm bước `pnpm build` và hướng dẫn bắt buộc check `test` trước khi merge; thêm workflow uptime theo lịch gọi web và `api/health` (fail thì GitHub gửi email); thêm `AlertService` ở module `notify` gửi email tới `ALERT_EMAIL` cho các sự kiện nói trên, kèm endpoint nội bộ để job backup báo lỗi.

## Boundaries & Constraints

**Always:** CI: `.github/workflows/ci-cd.yml` job `test` thêm `pnpm build` trước `pnpm test` (lint, typecheck, build, test cho mọi workspace); không đổi các job `images`/`deploy`. Test allowlist `@Public()` (`public-routes.spec.ts`) và test khớp enum shared/Prisma (`sheet-enums.spec.ts`) đã có và nằm trong `pnpm test`; giữ chúng chạy. `docs/cicd.md` và README ghi cách bật branch protection trên `develop`: bắt buộc check `test` pass trước khi merge (thao tác thủ công trên GitHub, không tự đổi cài đặt repo). Uptime: `.github/workflows/uptime.yml` chạy `cron: '*/5 * * * *'` và `workflow_dispatch`, đọc biến repo `UPTIME_WEB_URL` và `UPTIME_API_URL` (thiếu biến nào thì bỏ qua biến đó với cảnh báo `::warning::`, không fail), `curl -fsS --max-time 20 --retry 2` web và `<api>/health`, fail job (mã khác 0, nêu URL lỗi) khi down; quyền `contents: read`; tài liệu ghi rằng GitHub gửi email khi workflow theo lịch fail cho người bật/sửa lịch và cách bật thông báo. Cảnh báo API: `AlertService` trong `apps/api/src/modules/notify/` (dùng `EmailPort`, không đổi `EmailPort`), `alert(kind, subject, detail)` luôn best-effort (không bao giờ ném, không làm chậm/phá luồng gọi: gọi không await từ nơi gọi), gửi tới `ALERT_EMAIL` (biến môi trường mới, tuỳ chọn `.email()`, KHÔNG thêm vào `PRODUCTION_REQUIRED`), log `ALERT <kind>` mức error kể cả khi chưa cấu hình email, chống spam: cùng `kind` + khoá tối đa một email mỗi 15 phút trong bộ nhớ. Nội dung email không chứa email người mua, token hay secret, chỉ mã đơn và loại sự kiện. Các điểm gọi: `markReviewRequired` ở cả hai vị trí trong `order.service.ts` (`REVIEW_REQUIRED`), `LATE_CAPTURE` khi `granted`, và lỗi webhook trong `webhook.service.ts` (xác minh chữ ký thất bại và dispatch lỗi không phải AppException → `WEBHOOK_ERROR`). Backup: route `POST /internal/alerts` là `@Public()` nhưng chỉ chấp nhận header `X-Internal-Secret` đúng `INTERNAL_API_SECRET` (so sánh hằng thời gian, sai/thiếu → 401), body zod `{kind: 'BACKUP_FAILED', detail: string ≤ 500}`, cập nhật allowlist trong `public-routes.spec.ts`; `deploy/backup/backup.sh` `fail()` gọi `curl` tới `${API_INTERNAL_URL}/internal/alerts` khi có `API_INTERNAL_URL` và `INTERNAL_API_SECRET` (timeout 10 s, lỗi curl bị bỏ qua, không đổi mã thoát), compose Cloudflare cấp hai biến này cho service `backup` và Dockerfile giữ lại `curl`. Throttle API không áp cho secret hợp lệ (đã có cơ chế bypass).

**Never:** Không tự đổi cài đặt repo GitHub; không bắt buộc `ALERT_EMAIL` ở production (tránh làm hỏng deploy hiện tại); không gửi PII trong cảnh báo; không thêm dịch vụ giám sát ngoài; không sửa deploy sslip.io, `docker-compose.prod.yml`, các job `images`/`deploy`; không đổi hành vi nghiệp vụ của đơn hàng/webhook (chỉ thêm cảnh báo).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đơn lệch số tiền | capture khác amount/currency | Đơn `review_required` như cũ, thêm email `REVIEW_REQUIRED` tới `ALERT_EMAIL` | Gửi lỗi chỉ log, luồng đơn không đổi |
| Capture muộn | đơn không PENDING được cấp token | Email `LATE_CAPTURE` kèm mã đơn | Như trên |
| Lỗi webhook | chữ ký sai hoặc dispatch ném lỗi | Email `WEBHOOK_ERROR`, vẫn trả 503 như cũ | Như trên |
| Chưa cấu hình | thiếu `ALERT_EMAIL` | Chỉ log `ALERT <kind>`, không gửi | N/A |
| Bão sự kiện | 10 sự kiện cùng loại trong 15 phút | Chỉ một email | Log vẫn đủ 10 dòng |
| Backup thất bại | `backup.sh` fail, có `API_INTERNAL_URL` | POST `/internal/alerts` → email `BACKUP_FAILED`; mã thoát backup vẫn khác 0 | API không với tới được thì bỏ qua |
| Internal alert sai secret | header sai hoặc thiếu | N/A | 401 |
| Internal alert kind lạ | `kind` ngoài danh sách | N/A | 400 |
| Uptime down | web hoặc API không 2xx | Job fail, nêu URL | N/A |
| Uptime chưa cấu hình | thiếu `UPTIME_*` | Job pass kèm `::warning::` | N/A |

</frozen-after-approval>

## Code Map

- `.github/workflows/ci-cd.yml` (job `test`) -- thêm `pnpm build`; `.github/workflows/uptime.yml` mới; `docs/cicd.md`, `README.md` (~dòng 118) -- branch protection + uptime.
- `apps/api/src/modules/notify/{email-port.ts,notify.module.ts}` -- thêm `alert.service.ts` (+ export), `apps/api/src/config/env.ts` (~dòng 160-171, thêm `ALERT_EMAIL` sau `EMAIL_FROM`) + `test/unit/env.spec.ts`.
- `apps/api/src/modules/commerce/order.service.ts` (`markReviewRequired` ~:242 và ~:459, `LATE_CAPTURE` ~:254; mẫu best-effort `void this.sendPurchaseEmail` ~:257), `webhook.service.ts` (~:63, ~:78), module `commerce` import `NotifyModule`.
- `apps/api/src/modules/` -- thêm controller `internal-alerts` (`@Public()` + kiểm `X-Internal-Secret`, tham khảo guard throttle bypass AD-18), đăng ký trong `app.module.ts`; schema body trong `packages/shared`.
- `apps/api/test/integration/public-routes.spec.ts` (allowlist), mới: `test/unit/alert.service.spec.ts`, `test/integration/internal-alerts.spec.ts`; test hiện có của `order.service`/webhook (mock `AlertService`).
- `deploy/backup/backup.sh` (`fail()` ~:10), `Dockerfile` (giữ `curl`), `docker-compose.cloudflare.yml` (service `backup`), `deploy/.env.cloudflare.example`; `apps/api/test/unit/backup-script.spec.ts` (fake `curl`).

## Tasks & Acceptance

**Execution:**
- [x] `.github/workflows/ci-cd.yml`, `uptime.yml`, `docs/cicd.md`, `README.md` -- bước build, uptime theo lịch, hướng dẫn branch protection/email -- AC CI và uptime
- [x] `notify/alert.service.ts`, `env.ts`, test -- AlertService best-effort có chống spam, `ALERT_EMAIL` -- AC cảnh báo
- [x] `order.service.ts`, `webhook.service.ts` + test -- gọi cảnh báo ở các điểm sự kiện -- AC cảnh báo log
- [x] `internal-alerts` controller, `public-routes.spec.ts`, `internal-alerts.spec.ts` -- endpoint nội bộ có secret -- AC backup thất bại
- [x] `deploy/backup/*`, `docker-compose.cloudflare.yml`, `.env.cloudflare.example`, `backup-script.spec.ts` -- backup báo lỗi qua API -- AC backup thất bại

**Acceptance Criteria:**
- Given push/PR, when CI chạy, then chạy lint, typecheck, build và test (gồm allowlist `@Public()` và khớp enum); tài liệu nêu cách bắt buộc check `test` để chặn merge.
- Given `UPTIME_WEB_URL`/`UPTIME_API_URL` đã đặt, when web hoặc `api/health` down, then workflow fail và GitHub gửi email.
- Given `ALERT_EMAIL` đã đặt, when xảy ra `review_required`, `LATE_CAPTURE`, lỗi webhook hoặc backup thất bại, then founder nhận email (một email mỗi loại mỗi 15 phút), không chứa PII và không phá luồng nghiệp vụ.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Phát hiện | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Khoá throttle `WEBHOOK_ERROR` cố định làm gộp các lỗi khác loại | medium | patch | Khoá dispatch kèm loại sự kiện PayPal. |
| `email.send` trả `false` vẫn giữ khoá 15 phút | medium | patch | Xoá khoá khi `false`, thêm test. |
| Guard chấp nhận secret rỗng khi header cũng rỗng | medium | patch | Từ chối khi secret cấu hình rỗng, thêm test. |
| `curl` báo động backup không `-f`, lỗi API im lặng | medium | patch | Dùng `-fsS`, in `WARN`, giữ mã thoát. |
| Cấu hình compose cảnh báo không được test ghim | medium | patch | Thêm kiểm `ALERT_EMAIL`, `API_INTERNAL_URL`, `INTERNAL_API_SECRET`. |
| README không nói cảnh báo chỉ có ở compose Cloudflare | low | patch | Đã ghi rõ. |
| Uptime xanh khi chưa đặt biến `UPTIME_*` | medium | reject | Spec quy định bỏ qua kèm `::warning::`. |
| Uptime không `-L`, 5 phút/GitHub trễ, 60 ngày không hoạt động | low | reject | Giới hạn của cách dùng GitHub Actions đã được chọn; nêu trong tài liệu. |
| `/internal/alerts` không throttle thử secret | low | reject | Secret tối thiểu 32 ký tự, so sánh hằng thời gian. |
| `INTERNAL_API_SECRET` bắt buộc cho backup | false | reject | Compose Cloudflare mới, api đã yêu cầu biến này. |
| `pnpm build` trùng bước build của turbo / thiếu env | false | reject | Cùng môi trường với bước test; spec yêu cầu bước build rõ ràng. |
| Suppressed count, prune, alert khi `markReviewRequired` ném, lỗi AppException 5xx webhook | low | reject | Ngoài phạm vi, không vi phạm spec. |

## Verification

**Commands:**
- Test api (unit + integration), shared, `tsc --noEmit`, eslint, `bash -n deploy/backup/*.sh` -- expected: pass; CI trên PR xanh

**Manual checks (if no CLI):**
- Trên GitHub: đặt biến `UPTIME_WEB_URL`/`UPTIME_API_URL`, bật branch protection cho `develop`; đặt `ALERT_EMAIL` trên server rồi gây một sự kiện thử (phiên này không làm được).
