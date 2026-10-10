#!/usr/bin/env bash
# Smoke check production sau Cloudflare: bash deploy/smoke-check.sh <ROOT_DOMAIN>
# Kiểm bằng curl: web (trang Level, Search, chi tiết Sheet) trả 200 + HTML SSR, admin. trả trang đăng nhập,
# api. /health, sitemap.xml. Thoát mã khác 0 và nêu URL lỗi nếu có bước thất bại.
# Đường dẫn tuỳ chỉnh: LEVEL_PATH=/en/... SHEET_PATH=/en/... SEARCH_PATH=/en/search
# (mặc định SHEET_PATH lấy URL /sheet/ đầu tiên trong sitemap.xml). Bước thủ công (đăng nhập admin, upload PDF): docs/cloudflare.md.

set -u
domain="${1:-}"
if [ -z "$domain" ]; then
  echo "Cách dùng: $0 <ROOT_DOMAIN>" >&2
  exit 2
fi
domain="${domain#http*://}"
domain="${domain%%/*}"
command -v curl >/dev/null 2>&1 || { echo "Cần curl." >&2; exit 2; }

failed=0
fail() { echo "FAIL $1" >&2; failed=1; }
ok() { echo "OK   $1"; }

# check <url> <chuỗi phải có trong body, hoặc rỗng>
check() {
  local url="$1" needle="$2" body status
  body="$(mktemp)"
  status="$(curl -sS -L --max-time 20 -o "$body" -w '%{http_code}' "$url" 2>/dev/null)" || status=000
  if [ "${status:0:1}" != "2" ]; then
    fail "$url (HTTP $status)"
  elif [ -n "$needle" ] && ! grep -qi -- "$needle" "$body"; then
    fail "$url (thiếu nội dung SSR: $needle)"
  else
    ok "$url"
  fi
  rm -f "$body"
}

web="https://$domain"
check "$web/sitemap.xml" "<urlset"
check "https://api.$domain/health" ""
check "https://admin.$domain/login" "<form"

search="${SEARCH_PATH:-/en/search}"
level="${LEVEL_PATH:-/en/level/beginner}"
sheet="${SHEET_PATH:-}"
if [ -z "$sheet" ]; then
  sheet="$(curl -sS --max-time 20 "$web/sitemap.xml" 2>/dev/null | grep -o '<loc>[^<]*</loc>' \
    | sed -e 's/<loc>//' -e 's/<\/loc>//' -e 's#^https\{0,1\}://[^/]*##' \
    | grep -m1 '/sheet/')"
fi
check "$web$level" "<html"
check "$web$search" "<html"
if [ -n "$sheet" ]; then
  check "$web$sheet" "<html"
else
  fail "$web (không tìm được URL Sheet trong sitemap.xml; đặt SHEET_PATH)"
fi

if [ "$failed" -ne 0 ]; then
  echo "Smoke check THẤT BẠI." >&2
  exit 1
fi
echo "Smoke check đạt."
