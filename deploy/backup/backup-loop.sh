#!/usr/bin/env bash
# Ngủ tới BACKUP_AT (HH:MM, mặc định 03:00, múi giờ TZ = Asia/Ho_Chi_Minh) rồi chạy backup.sh, lặp lại.
# --once: chạy backup.sh đúng một lần và thoát với mã của nó (dùng cho cron / docker compose run).
set -uo pipefail

export TZ="${TZ:-Asia/Ho_Chi_Minh}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_CMD="${BACKUP_CMD:-$DIR/backup.sh}"

case "${1:-}" in
  --once) exec "$BACKUP_CMD" ;;
  '') ;;
  *)
    echo "ERROR tham số không hợp lệ '$1' (chỉ nhận --once hoặc không có tham số)" >&2
    exit 2
    ;;
esac

AT="${BACKUP_AT:-03:00}"
if ! [[ "$AT" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]]; then
  echo "ERROR BACKUP_AT phải có dạng HH:MM, nhận '$AT'" >&2
  exit 2
fi

while true; do
  now="$(date +%s)"
  target="$(date -d "today $AT" +%s)"
  [ "$target" -gt "$now" ] || target="$(date -d "tomorrow $AT" +%s)"
  echo "INFO backup tiếp theo lúc $(date -d "@$target" '+%Y-%m-%d %H:%M %Z')"
  sleep $((target - now))
  "$BACKUP_CMD" || echo "ERROR backup thất bại (mã $?), thử lại vào ngày hôm sau" >&2
  sleep 60 # tránh chạy lại ngay trong cùng phút
done
