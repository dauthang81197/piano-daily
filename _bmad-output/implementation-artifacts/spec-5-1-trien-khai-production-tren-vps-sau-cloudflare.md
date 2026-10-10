---
title: 'Story 5.1 — Triển khai production trên VPS sau Cloudflare'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7d92bbc1d038517cb50837bfb7eb12986aac5e50'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Deploy hiện tại chạy một hostname (sslip.io, cổng 443/8443/9443, không Cloudflare) nên chưa thể ra mắt trên domain thật có TLS, CDN, IP thật của người dùng, subdomain `admin.`/`api.`/`cdn.` và cấu hình secret chặt.

**Approach:** Thêm bộ cấu hình production sau Cloudflare ở file mới, song song và không sửa deploy hiện tại: compose, Caddyfile theo `ROOT_DOMAIN`, script firewall chỉ nhận Cloudflare, script smoke check, tài liệu thiết lập Cloudflare/R2, và làm API bắt buộc đủ secret khi `NODE_ENV=production`.

## Boundaries & Constraints

**Always:** File mới: `docker-compose.cloudflare.yml`, `deploy/Caddyfile.cloudflare`, `deploy/.env.cloudflare.example`, `deploy/cloudflare-firewall.sh`, `deploy/smoke-check.sh`, `docs/cloudflare.md`; domain chỉ đến từ biến `ROOT_DOMAIN` (web = `${ROOT_DOMAIN}`, `admin.`, `api.`, `cdn.` là subdomain), không ghi cứng domain. Caddy route web, admin, api tới các container (giữ cổng nội bộ hiện có của image, ghi chú nếu khác 3000/3001/4000), chỉ publish 80 và 443; Postgres không `ports`; `api` đúng một instance (không `replicas`/scale) và vẫn chạy `prisma migrate deploy` trước khi listen. Caddy đặt `trusted_proxies` = dải IP Cloudflare công bố (IPv4 + IPv6) với `client_ip_headers CF-Connecting-IP`, và chuyển IP khách thật cho api/web qua `{client_ip}` thay vì ghi đè bằng `{remote_host}`. `cloudflare-firewall.sh` dùng `ufw` chỉ cho phép 80/443 từ các dải Cloudflare (và SSH do người dùng chỉ định), có chế độ `--dry-run` in lệnh mà không chạy, và không tự chạy khi import. Geo redirect (`cf-ipcountry`=VN → `/vi`) đã có ở `apps/web/src/proxy.ts`, giữ nguyên và chỉ ghi tài liệu bật Cloudflare IP Geolocation (Network → "IP Geolocation"). R2: tài liệu bucket public gắn custom domain `cdn.` với Cache-Control immutable (đã có ở `storage.service.ts`), bucket private không bật public access, CORS cho origin web/admin, ví dụ `S3_PUBLIC_BASE_URL=https://cdn.<ROOT_DOMAIN>`. Env: khi `NODE_ENV=production`, `apps/api/src/config/env.ts` bắt buộc (zod, tên biến báo rõ) `JWT_ACCESS_SECRET`, `INTERNAL_API_SECRET` (dùng làm `X-Internal-Secret` và secret revalidate, không thêm biến mới), `VIEW_SALT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `RESEND_API_KEY`, `EMAIL_FROM` và `S3_*`; ngoài production giữ nguyên tuỳ chọn. CORS: `CORS_ADMIN_ORIGIN=https://admin.${ROOT_DOMAIN}`, `CORS_WEB_ORIGIN=https://${ROOT_DOMAIN}`; cookie refresh giữ `SameSite=Strict` (cùng site đăng ký nên hoạt động giữa `admin.` và `api.`). `smoke-check.sh <ROOT_DOMAIN>` dùng `curl` kiểm: trang Level, Search, chi tiết Sheet trả 200 và có HTML SSR, `admin.` trả trang đăng nhập, `api.` `/health`, `sitemap.xml` 200; bước cần thao tác tay (đăng nhập admin, upload PDF ra ảnh) ghi thành checklist trong `docs/cloudflare.md`. Secret không nằm trong repo.

**Never:** Không sửa `docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/.env.production.example`, `.github/workflows/ci-cd.yml` hay luồng deploy sslip.io hiện tại; không chạy firewall, SSH hay lệnh nào lên server thật; không thêm biến secret revalidate riêng; không đổi geo redirect; không mở cổng 8443/9443.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Production đủ secret | `NODE_ENV=production` + mọi biến bắt buộc | API khởi động | N/A |
| Production thiếu secret | thiếu `PAYPAL_CLIENT_SECRET` hoặc `RESEND_API_KEY` | Khởi động thất bại, báo đúng tên biến | `EnvValidationError` liệt kê biến thiếu |
| Dev/test thiếu PayPal/Resend | `NODE_ENV` khác production | Khởi động như cũ | N/A |
| Cấu hình compose | `docker-compose.cloudflare.yml` | Postgres không có `ports`; chỉ caddy publish 80/443; api không scale | Test cấu hình thất bại nếu vi phạm |
| Caddyfile | `Caddyfile.cloudflare` | Có `trusted_proxies` với dải Cloudflare, bốn host qua `ROOT_DOMAIN`, không `{remote_host}` cho CF-Connecting-IP | Test cấu hình thất bại nếu vi phạm |
| Firewall dry-run | `cloudflare-firewall.sh --dry-run` | In lệnh `ufw allow` cho từng dải, không chạy | Thiếu `ufw` ở chế độ thật thì thoát với thông báo |
| Smoke check lỗi | một URL trả không phải 2xx | Thoát mã khác 0, nêu URL lỗi | N/A |

</frozen-after-approval>

## Code Map

- `docker-compose.prod.yml`, `deploy/Caddyfile`, `deploy/.env.production.example`, `.github/workflows/ci-cd.yml` -- deploy hiện tại; chỉ tham khảo (image `${DOCKERHUB_USERNAME}/piano-daily-{api,web,admin}:${IMAGE_TAG}`, postgres 18.6, cổng nội bộ web 4100, admin 4101, api 4000).
- `apps/api/src/config/env.ts` (zod, `EnvValidationError`, refine ~dòng 62 và 177) + `apps/api/test/unit/env.spec.ts` -- thêm kiểm bắt buộc theo `NODE_ENV=production`.
- `apps/api/src/bootstrap.ts` (CORS), `modules/identity/auth.controller.ts` (cookie `strict`), `modules/media/storage.service.ts` (`PUBLIC_CACHE_CONTROL`), `apps/web/src/proxy.ts` -- đã đúng, chỉ tài liệu hoá.
- `apps/api/test/unit/deploy-config.spec.ts` (mới) -- đọc file compose/Caddyfile/script và kiểm các ràng buộc ở ma trận.
- `README.md` (~dòng 118-135), `docs/cicd.md` -- thêm liên kết tới `docs/cloudflare.md`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/config/env.ts` + `test/unit/env.spec.ts` -- bắt buộc secret khi production -- AC env
- [x] `docker-compose.cloudflare.yml`, `deploy/Caddyfile.cloudflare`, `deploy/.env.cloudflare.example` -- compose + Caddy theo `ROOT_DOMAIN`, trusted_proxies -- AC compose/Cloudflare
- [x] `deploy/cloudflare-firewall.sh`, `deploy/smoke-check.sh` -- firewall `--dry-run`, smoke check -- AC firewall/smoke
- [x] `apps/api/test/unit/deploy-config.spec.ts` -- test các ràng buộc cấu hình -- ma trận
- [x] `docs/cloudflare.md`, `README.md` -- hướng dẫn DNS, Cloudflare (proxy, Geolocation), R2 `cdn.`, CORS, secret, checklist thủ công -- AC R2/geo/smoke

**Acceptance Criteria:**
- Given cấu hình mới, when đọc compose và Caddyfile, then bốn host (`ROOT_DOMAIN`, `admin.`, `api.`, `cdn.` dùng cho R2) được định tuyến đúng, Postgres không expose, api một instance và `trusted_proxies` là dải Cloudflare.
- Given `NODE_ENV=production` thiếu bất kỳ secret bắt buộc, when API khởi động, then thất bại với tên biến thiếu; đủ thì khởi động.
- Given deploy sslip.io hiện tại, when xem diff, then các file deploy cũ và CI không đổi.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Phát hiện | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Bắt buộc secret khi production làm deploy sslip.io (compose cũ mặc định rỗng) không khởi động | high | reject (quyết định của người dùng) | Người dùng chọn rõ "bắt buộc khi NODE_ENV=production" sau khi được cảnh báo; spec cấm sửa deploy cũ. Cần có sẵn secret trên server trước khi merge (ghi trong PR). |
| Firewall `ufw` không chặn cổng Docker publish | medium | defer | Vượt phạm vi script `ufw` của spec; đã ghi tài liệu và `deferred-work.md`. |
| `web`/`admin` thiếu `:?` cho `DOCKERHUB_USERNAME`, `INTERNAL_API_SECRET` | low | patch | Đã thêm `:?`. |
| Test script im lặng khi thiếu bash | medium | patch | Đổi sang `it.skipIf(!hasBash)`. |
| `--ssh-port` không phải số; lỗi `ufw` giữa chừng vẫn bật firewall | medium | patch | Kiểm tra số, dừng ngay khi `ufw` lỗi. |
| `smoke-check.sh` nhận domain kèm scheme/đường dẫn | low | patch | Chuẩn hoá domain đầu vào. |
| `NEXT_PUBLIC_*` nhúng lúc build | medium | patch | Đã thêm lưu ý build lại image vào `docs/cloudflare.md`. |
| Healthcheck web/admin, smoke kiểm SSR cụ thể | low | defer | Ghi `deferred-work.md`. |
| Thiếu `.gitattributes` eol=lf cho `.sh` | false | reject | `.gitattributes` đã có `*.sh text eol=lf`. |
| Admin thiếu `header_up CF-Connecting-IP` | false | reject | Đã có ở khối admin của Caddyfile. |
| S3 không nằm trong `PRODUCTION_REQUIRED` | false | reject | `S3_*` đã bắt buộc trong schema gốc. |
| Danh sách dải IP lệch giữa Caddy và firewall, HTTP/3, ACME, HSTS, backup, rollback, trim secret | low | reject | Cải thiện ngoài phạm vi, không vi phạm spec. |

## Verification

**Commands:**
- Test api unit (`env.spec`, `deploy-config.spec`), `tsc --noEmit` api, eslint -- expected: pass
- `bash -n deploy/*.sh` -- expected: không lỗi cú pháp

**Manual checks (if no CLI):**
- Trên server thật (ngoài phạm vi phiên này): chạy `cloudflare-firewall.sh --dry-run`, bật proxy Cloudflare, chạy `smoke-check.sh`, làm checklist đăng nhập admin và upload PDF.
