#!/usr/bin/env bash
# Một lần backup: pg_dump (custom) -> upload bucket private -> xoay vòng giữ BACKUP_KEEP bản mới nhất.
# Lỗi bất kỳ: một dòng "ERROR ..." ra stderr và thoát mã khác 0 (không bao giờ xoá bản cũ khi chưa upload thành công).
set -uo pipefail

PREFIX="backups/piano-daily-"
SUFFIX=".dump"

log_info() { echo "INFO $*"; }
# Báo lỗi cho API (gửi email cảnh báo) khi có API_INTERNAL_URL và INTERNAL_API_SECRET; mọi lỗi curl bị bỏ qua.
notify_api() {
  [ -n "${API_INTERNAL_URL:-}" ] && [ -n "${INTERNAL_API_SECRET:-}" ] || return 0
  # Chỉ giữ ký tự an toàn cho JSON; không bao giờ đưa secret vào detail.
  local detail
  detail="$(printf '%s' "$1" | tr -c 'A-Za-z0-9 ._:/-' ' ' | cut -c1-500)"
  curl -fsS --max-time 10 -o /dev/null -X POST "${API_INTERNAL_URL%/}/internal/alerts" \
    -H "X-Internal-Secret: ${INTERNAL_API_SECRET}" -H "Content-Type: application/json" \
    -d "{\"kind\":\"BACKUP_FAILED\",\"detail\":\"${detail}\"}" >/dev/null 2>&1 || echo "WARN không gửi được cảnh báo" >&2
}
fail() { echo "ERROR $*" >&2; notify_api "$*"; exit 1; }

for var in DATABASE_URL S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET_PRIVATE; do
  [ -n "${!var:-}" ] || fail "thiếu biến môi trường $var"
done

KEEP="${BACKUP_KEEP:-14}"
case "$KEEP" in
  '' | *[!0-9]* | 0) fail "BACKUP_KEEP phải là số nguyên dương" ;;
esac

export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID"
export AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
# R2 không hỗ trợ checksum mặc định của AWS CLI mới.
export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required

TMP="$(mktemp "${TMPDIR:-/tmp}/piano-backup.XXXXXX")" || fail "không tạo được file tạm"
trap 'rm -f "$TMP"' EXIT

KEY="${PREFIX}$(date -u +%Y%m%dT%H%M%SZ)${SUFFIX}"

timeout 1h pg_dump --format=custom --dbname="$DATABASE_URL" >"$TMP" || fail "pg_dump thất bại"
[ -s "$TMP" ] || fail "file dump rỗng"
SIZE="$(wc -c <"$TMP" | tr -d ' ')"

timeout 30m aws s3 cp "$TMP" "s3://${S3_BUCKET_PRIVATE}/${KEY}" --endpoint-url "$S3_ENDPOINT" --only-show-errors \
  || fail "upload $KEY thất bại"
log_info "đã upload $KEY (${SIZE} byte)"

LIST="$(aws s3api list-objects-v2 --bucket "$S3_BUCKET_PRIVATE" --prefix "$PREFIX" \
  --endpoint-url "$S3_ENDPOINT" --query 'Contents[].Key' --output text)" \
  || fail "không liệt kê được bản backup để xoay vòng"

KEYS="$(printf '%s\n' "$LIST" | tr '\t' '\n' | grep -E "^${PREFIX}[0-9]{8}T[0-9]{6}Z[.]dump\$" | sort || true)"
COUNT=0
[ -n "$KEYS" ] && COUNT="$(printf '%s\n' "$KEYS" | wc -l | tr -d ' ')"

if [ "$COUNT" -gt "$KEEP" ]; then
  DELETE_N=$((COUNT - KEEP))
  # Không bao giờ xoá bản vừa upload ($KEY), dù đồng hồ lệch.
  for old in $(printf '%s\n' "$KEYS" | head -n "$DELETE_N" | grep -vxF "$KEY" || true); do
    aws s3api delete-object --bucket "$S3_BUCKET_PRIVATE" --key "$old" --endpoint-url "$S3_ENDPOINT" >/dev/null \
      || fail "xoá bản cũ $old thất bại"
    log_info "đã xoá bản cũ $old"
  done
fi
log_info "hoàn tất, giữ tối đa $KEEP bản"
