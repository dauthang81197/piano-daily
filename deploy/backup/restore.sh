#!/usr/bin/env bash
# Dùng: restore.sh <đường-dẫn-file.dump | key-S3> <DATABASE_URL đích>
# KHÔNG trỏ vào DB production. Key S3 (vd backups/piano-daily-20260101T200000Z.dump) cần S3_* và S3_BUCKET_PRIVATE.
set -uo pipefail

if [ "$#" -ne 2 ] || [ -z "$1" ] || [ -z "$2" ]; then
  echo "Dùng: restore.sh <đường-dẫn-file.dump | key-S3> <DATABASE_URL đích>" >&2
  exit 2
fi
SOURCE="$1"
TARGET="$2"
FILE="$SOURCE"

if [ ! -f "$SOURCE" ]; then
  for var in S3_ENDPOINT S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY S3_BUCKET_PRIVATE; do
    [ -n "${!var:-}" ] || { echo "ERROR '$SOURCE' không phải file và thiếu biến $var để tải từ S3" >&2; exit 1; }
  done
  export AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$S3_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION="${S3_REGION:-auto}"
  export AWS_REQUEST_CHECKSUM_CALCULATION=when_required AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
  FILE="$(mktemp "${TMPDIR:-/tmp}/piano-restore.XXXXXX")"
  trap 'rm -f "$FILE"' EXIT
  aws s3 cp "s3://${S3_BUCKET_PRIVATE}/${SOURCE}" "$FILE" --endpoint-url "$S3_ENDPOINT" --only-show-errors \
    || { echo "ERROR tải $SOURCE thất bại" >&2; exit 1; }
fi

pg_restore --no-owner --clean --if-exists --dbname="$TARGET" "$FILE" \
  || { echo "ERROR pg_restore thất bại" >&2; exit 1; }
echo "INFO đã khôi phục từ $SOURCE"
