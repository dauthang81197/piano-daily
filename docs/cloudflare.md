# Production sau Cloudflare (Story 5.1)

Bộ cấu hình này chạy **song song** với deploy sslip.io hiện tại (`docker-compose.prod.yml`, `deploy/Caddyfile`, `.github/workflows/ci-cd.yml`) và không thay thế chúng.

| File | Vai trò |
|---|---|
| `docker-compose.cloudflare.yml` | Postgres, api (một instance), web, admin, Caddy. Chỉ Caddy publish 80 và 443. |
| `deploy/Caddyfile.cloudflare` | Route theo `ROOT_DOMAIN`, `trusted_proxies` = dải IP Cloudflare. |
| `deploy/.env.cloudflare.example` | Mẫu `.env` trên server (không commit file thật). |
| `deploy/cloudflare-firewall.sh` | `ufw` chỉ nhận 80/443 từ Cloudflare. |
| `deploy/smoke-check.sh` | Smoke check bằng `curl`. |

## Hostname

Domain chỉ đến từ biến `ROOT_DOMAIN` (ví dụ `example.com`):

| Host | Đích |
|---|---|
| `ROOT_DOMAIN` | web (container `web:4100`) |
| `admin.ROOT_DOMAIN` | admin (`admin:4101`) |
| `api.ROOT_DOMAIN` | api (`api:4000`) |
| `cdn.ROOT_DOMAIN` | bucket R2 public (custom domain, không qua Caddy) |

Cổng nội bộ giữ theo image hiện có (web 4100, admin 4101, api 4000), khác 3000/3001/4000 mặc định của Next.

## Thiết lập

1. **DNS**: tạo bản ghi A (và AAAA nếu có) cho `ROOT_DOMAIN`, `admin`, `api` trỏ tới IP VPS, bật **Proxied** (đám mây cam). `cdn` được tạo khi gắn custom domain cho R2 (bên dưới).
2. **SSL/TLS**: mode **Full (strict)**. Caddy tự xin chứng chỉ Let's Encrypt; cổng 80 phải mở cho Cloudflare.
3. **Geo redirect**: `apps/web/src/proxy.ts` đọc `cf-ipcountry` (VN thì chuyển tới `/vi`), giữ nguyên. Cần bật header này: Cloudflare → **Network** → **IP Geolocation** = On.
4. **Server**: chép `docker-compose.cloudflare.yml` và `deploy/` lên `/opt/piano-daily`, tạo `.env` từ `deploy/.env.cloudflare.example` (điền secret, không đưa vào repo). Sinh secret: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
5. **Chạy**: `cd /opt/piano-daily && docker compose -f docker-compose.cloudflare.yml up -d --wait`. API tự chạy `prisma migrate deploy` trước khi listen. **Chỉ một instance api** (rate limit và dedupe lượt xem ở bộ nhớ trong): không dùng `replicas`/`--scale`.
6. **Firewall** (xem trước rồi mới chạy thật; chỉ định đúng IP SSH của bạn để không tự khoá):
   ```bash
   bash deploy/cloudflare-firewall.sh --dry-run
   sudo bash deploy/cloudflare-firewall.sh --ssh-from <IP-của-bạn>
   ```
   Lưu ý: Docker publish cổng qua iptables nên có thể bỏ qua luật `ufw`; kiểm tra bằng cách truy cập thẳng IP VPS từ ngoài dải Cloudflare. Dải IP lấy từ <https://www.cloudflare.com/ips/>; nếu đổi, cập nhật cả `Caddyfile.cloudflare` và `cloudflare-firewall.sh`.

### IP khách thật

Caddy chỉ tin `CF-Connecting-IP` khi kết nối đến từ dải Cloudflare (`trusted_proxies` + `client_ip_headers CF-Connecting-IP`), rồi chuyển IP thật cho api/web qua `header_up CF-Connecting-IP {client_ip}`. Client giả header này từ ngoài Cloudflare sẽ bị bỏ qua.

## Cloudflare R2 và `cdn.`

- **Bucket public** (`S3_BUCKET_PUBLIC`): R2 → bucket → Settings → **Custom Domains** → thêm `cdn.<ROOT_DOMAIN>`. Không cần dùng `r2.dev`. API đã ghi `Cache-Control` immutable cho object public (`storage.service.ts`), Cloudflare sẽ cache ở edge.
- **Bucket private** (`S3_BUCKET_PRIVATE`): **không** bật public access, không gắn domain. File gốc chỉ tải qua link ký của API.
- **CORS** cho bucket public: cho phép origin `https://<ROOT_DOMAIN>` và `https://admin.<ROOT_DOMAIN>` (method `GET`, `HEAD`; nếu admin upload thẳng thì thêm `PUT`).
- Biến: `S3_PUBLIC_BASE_URL=https://cdn.<ROOT_DOMAIN>` (không có `/` cuối), `S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com`, `S3_REGION=auto`.

## Biến môi trường và CORS

Khi `NODE_ENV=production`, API (`apps/api/src/config/env.ts`) không khởi động nếu thiếu: `JWT_ACCESS_SECRET`, `INTERNAL_API_SECRET`, `VIEW_SALT`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `RESEND_API_KEY`, `EMAIL_FROM` và các biến `S3_*`; lỗi nêu đúng tên biến thiếu. Ngoài production các biến PayPal/Resend vẫn tuỳ chọn.

`INTERNAL_API_SECRET` vừa là `X-Internal-Secret` (web → api) vừa là secret revalidate; không có biến riêng.

CORS do compose dựng từ `ROOT_DOMAIN`: `CORS_ADMIN_ORIGIN=https://admin.<ROOT_DOMAIN>`, `CORS_WEB_ORIGIN=https://<ROOT_DOMAIN>`. Cookie refresh giữ `SameSite=Strict`; `admin.` và `api.` cùng site đăng ký nên cookie vẫn hoạt động.

## Smoke check

```bash
bash deploy/smoke-check.sh <ROOT_DOMAIN>
```

Kiểm: `sitemap.xml`, `api.<ROOT_DOMAIN>/health`, `admin.<ROOT_DOMAIN>/login`, trang Level, Search và chi tiết Sheet trả 200 kèm HTML SSR. Thoát mã khác 0 và in URL lỗi nếu có bước thất bại. Đặt `LEVEL_PATH`, `SEARCH_PATH`, `SHEET_PATH` nếu route khác mặc định (mặc định Level là `/en/level/beginner`, Sheet lấy URL `/sheet/` đầu tiên trong `sitemap.xml`).

## Checklist thủ công (sau khi smoke check đạt)

- [ ] Đăng nhập admin tại `https://admin.<ROOT_DOMAIN>/login`, tải lại trang vẫn còn phiên (cookie refresh hoạt động qua `api.`).
- [ ] Upload một PDF trong admin, kiểm tra các trang được render thành ảnh và hiển thị qua `https://cdn.<ROOT_DOMAIN>/...`.
- [ ] Ảnh từ `cdn.` có header `cache-control: ... immutable` và `cf-cache-status: HIT` ở lần tải thứ hai.
- [ ] File gốc (bucket private) không truy cập được bằng URL công khai.
- [ ] Truy cập thẳng IP VPS cổng 80/443 từ ngoài Cloudflare bị chặn (sau khi chạy firewall).
- [ ] Vào `https://<ROOT_DOMAIN>/` từ IP Việt Nam được chuyển tới `/vi` (đã bật IP Geolocation).
- [ ] Webhook PayPal (`PAYPAL_WEBHOOK_ID`) trỏ tới `https://api.<ROOT_DOMAIN>/webhooks/paypal`, thử một đơn sandbox/live và nhận email link tải.

## Backup hằng đêm

Service `backup` tự chạy cùng compose (biến `BACKUP_AT`, `BACKUP_KEEP` trong `.env`) và ghi vào bucket private. Cách chạy tay, kiểm tra và khôi phục thử: xem [README, mục "Backup và khôi phục"](../README.md#backup-và-khôi-phục).

## Lưu ý khi dùng image dựng sẵn

- `NEXT_PUBLIC_*` của web/admin được nhúng lúc build. Image dựng cho sslip.io trỏ API/CDN của host cũ; muốn chạy bản Cloudflare phải build lại image với `https://api.<ROOT_DOMAIN>` và `https://cdn.<ROOT_DOMAIN>` (CI hiện chưa có workflow riêng cho biến thể này).
- Docker publish cổng qua iptables nên có thể bỏ qua `ufw`; xem mục firewall, cần kiểm tra IP gốc không truy cập trực tiếp được (chặn thêm ở chuỗi `DOCKER-USER`).
