# CI/CD và deploy — ghi chú tình trạng

Cập nhật: 2026-10-08. Nhánh: `chore/ci-cd-docker-hub-deploy`. Hướng dẫn thiết lập đầy đủ nằm ở mục "CI/CD và deploy" trong `README.md`.

## Đã có trong repo (chưa chạy thử lần nào)

- `.github/workflows/ci-cd.yml`: PR chạy lint, typecheck, build, test (gồm integration). Push vào `develop` build 3 image, đẩy Docker Hub, SSH deploy, kiểm tra `/health`.
- `docker-compose.prod.yml`: postgres, api, web, admin, caddy. Chỉ Caddy mở cổng 80/443/8443/9443. File lưu ở Cloudflare R2.
- `deploy/Caddyfile`, `deploy/bootstrap-server.sh`, `deploy/.env.production.example`, `.gitattributes` (ép LF cho `*.sh` và `Caddyfile`).

## Quyết định thiết kế

- Server chưa có domain: dùng `144-91-120-200.sslip.io` để Caddy xin được TLS Let's Encrypt. Lý do: cookie refresh của admin là `Secure; SameSite=Strict`, không giữ được khi chạy HTTP trên IP trần.
- Web ở 443, admin ở 8443, API ở 9443, cùng một hostname nên cùng "site" (cookie `SameSite=Strict` hoạt động).
- Caddy ghi đè `CF-Connecting-IP` bằng IP thật của kết nối, vì server không đứng sau Cloudflare và client có thể giả header này để né rate limit.
- Secret runtime nằm ở `/opt/piano-daily/.env` trên server, không đi qua CI. GitHub chỉ giữ secret Docker Hub và SSH.
- `NEXT_PUBLIC_*` được build vào image, nên đổi host hoặc URL media thì phải build lại.
- Chỉ chạy một instance API (rate limit và dedupe lượt xem ở bộ nhớ trong).

## Việc còn lại (làm theo thứ tự)

1. **Quyền SSH:** `ssh root@144.91.120.200` đang bị từ chối `publickey`. Cài khoá công khai lên server (khoá riêng cho deploy, không dùng root nếu có thể).
2. **Chuẩn bị server:** `ssh root@144.91.120.200 'bash -s' < deploy/bootstrap-server.sh`, rồi điền các biến `S3_*` của R2 vào `/opt/piano-daily/.env`. Cần tạo trước hai bucket R2 khác nhau; bucket public bật truy cập công khai, bucket private thì không.
3. **Mở cổng** 80, 443, 8443, 9443 trên firewall của nhà cung cấp VPS.
4. **GitHub:**
   - Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN`, `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` (kết quả `ssh-keyscan 144.91.120.200`).
   - Variables: `SITE_HOST=144-91-120-200.sslip.io`, `MEDIA_BASE_URL` (URL công khai bucket public R2, khớp `S3_PUBLIC_BASE_URL`), `PAYPAL_CLIENT_ID` (client ID công khai của PayPal, truyền vào web thành `NEXT_PUBLIC_PAYPAL_CLIENT_ID`; trùng app với `PAYPAL_CLIENT_ID` của API, không phải secret).
   - Environment `production` (có thể bật required reviewers).
5. **Merge vào `develop`** để workflow chạy lần đầu, rồi kiểm tra `https://144-91-120-200.sslip.io`, `:8443` (admin), `:9443/health` (API).
6. **Tạo admin đầu tiên trên production:** chưa làm được. Image API production không có `tsx` nên không chạy được `prisma db seed`. Cần thêm một cách riêng (ví dụ script biên dịch sẵn hoặc lệnh một lần trong container) trước khi đăng nhập admin.

## Rủi ro đã biết, chưa xử lý

- Workflow và compose chưa được chạy thử: chưa kiểm tra pull image, `--wait`, cấp chứng chỉ Caddy, kết nối R2 hay migration trên Postgres 18 thật.
- Integration test của Story 3.2 (`free-download.spec.ts`) cũng chưa chạy trên Postgres thật; job `test` của workflow sẽ chạy chúng lần đầu và có thể lộ lỗi.
- Workflow CI chạy cả `pnpm test` ở gốc. Trên máy Windows có sẵn 2 test `midi-player-bundle` fail (lỗi đường dẫn Windows); trên Linux chưa biết kết quả.
- Backup Postgres và giám sát chưa có (Story 5.2, 5.3). Chưa có firewall phía server do script quản lý.
- Docker Hub: nếu repo image để private thì server phải `docker login` (workflow đã làm bước này bằng token).
