#!/usr/bin/env bash
# Chuẩn bị VPS Debian/Ubuntu cho Piano Daily. Chạy MỘT lần với quyền root, an toàn khi chạy lại:
#   ssh root@<server> 'bash -s' < deploy/bootstrap-server.sh
# Việc script làm: cài Docker nếu chưa có, tạo /opt/piano-daily, sinh .env với secret ngẫu nhiên (không ghi đè .env có sẵn).
# Script KHÔNG sửa firewall và KHÔNG sửa cấu hình SSH.
set -euo pipefail

APP_DIR=/opt/piano-daily
SITE_HOST_DEFAULT="${SITE_HOST:-$(curl -fsS https://api.ipify.org | tr . -).sslip.io}"

if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi
docker compose version >/dev/null

install -d -m 750 "$APP_DIR" "$APP_DIR/deploy"

if [ -f "$APP_DIR/.env" ]; then
  echo ".env đã tồn tại, giữ nguyên."
else
  rand() { head -c 48 /dev/urandom | base64 -w0 | tr '+/' '-_' | tr -d '='; }
  umask 077
  cat > "$APP_DIR/.env" <<ENV
SITE_HOST=$SITE_HOST_DEFAULT

POSTGRES_USER=piano
POSTGRES_PASSWORD=$(rand)
POSTGRES_DB=piano_daily

JWT_ACCESS_SECRET=$(rand)
INTERNAL_API_SECRET=$(rand)
VIEW_SALT=$(rand)

# Điền thông tin Cloudflare R2 trước lần deploy đầu tiên.
S3_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
S3_REGION=auto
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
S3_BUCKET_PUBLIC=piano-daily-public
S3_BUCKET_PRIVATE=piano-daily-private
S3_PUBLIC_BASE_URL=
ENV
  echo "Đã tạo $APP_DIR/.env (SITE_HOST=$SITE_HOST_DEFAULT). Hãy điền các biến S3_* của R2."
fi

echo "Cổng cần mở ra internet: 80, 443, 8443, 9443 (và SSH). Docker bỏ qua ufw khi publish cổng, nên chỉ Caddy được publish cổng."
