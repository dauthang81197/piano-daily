#!/usr/bin/env bash
# Chỉ cho phép cổng 80/443 từ dải IP Cloudflare (ufw). Dải IP: https://www.cloudflare.com/ips/ (giữ khớp deploy/Caddyfile.cloudflare).
#
#   deploy/cloudflare-firewall.sh --dry-run                 # chỉ in lệnh, không chạy
#   sudo deploy/cloudflare-firewall.sh --ssh-from 1.2.3.4   # cho SSH từ 1.2.3.4 (lặp lại được) rồi bật ufw
#   sudo deploy/cloudflare-firewall.sh --ssh-port 2222 --ssh-from any
# Lưu ý: chạy thật có thể khoá SSH nếu chỉ định sai --ssh-from. Hãy --dry-run trước.
# Lưu ý: Docker publish cổng qua iptables và có thể bỏ qua ufw; hãy kiểm tra thêm (xem docs/cloudflare.md).

CF_IPV4=(
  173.245.48.0/20 103.21.244.0/22 103.22.200.0/22 103.31.4.0/22 141.101.64.0/18 108.162.192.0/18
  190.93.240.0/20 188.114.96.0/20 197.234.240.0/22 198.41.128.0/17 162.158.0.0/15 104.16.0.0/13
  104.24.0.0/14 172.64.0.0/13 131.0.72.0/22
)
CF_IPV6=(
  2400:cb00::/32 2606:4700::/32 2803:f800::/32 2405:b500::/32 2405:8100::/32 2a06:98c0::/29 2c0f:f248::/32
)

main() {
  local dry_run=0 ssh_port=22
  local ssh_from=()
  while [ $# -gt 0 ]; do
    case "$1" in
      --dry-run) dry_run=1 ;;
      --ssh-port) ssh_port="${2:?Thiếu giá trị cho --ssh-port}"; shift ;;
      --ssh-from) ssh_from+=("${2:?Thiếu giá trị cho --ssh-from}"); shift ;;
      -h|--help) sed -n '2,8p' "$0"; return 0 ;;
      *) echo "Tham số không hợp lệ: $1" >&2; return 2 ;;
    esac
    shift
  done

  case "$ssh_port" in ''|*[!0-9]*) echo "--ssh-port phải là số: $ssh_port" >&2; return 2 ;; esac
  if [ "$dry_run" -eq 0 ] && ! command -v ufw >/dev/null 2>&1; then
    echo "Không tìm thấy ufw. Cài ufw (apt install ufw) rồi chạy lại, hoặc dùng --dry-run." >&2
    return 1
  fi
  if [ "$dry_run" -eq 0 ] && [ "${#ssh_from[@]}" -eq 0 ]; then
    echo "Thiếu --ssh-from <ip|cidr|any>: chạy thật mà không cho SSH sẽ khoá bạn ra ngoài." >&2
    return 2
  fi

  run() {
    if [ "$dry_run" -eq 1 ]; then echo "ufw $*"; else ufw "$@" || { echo "ufw $* thất bại, dừng trước khi bật firewall." >&2; exit 1; }; fi
  }

  run default deny incoming
  run default allow outgoing
  local src
  for src in "${ssh_from[@]}"; do
    if [ "$src" = "any" ]; then
      run allow "${ssh_port}/tcp"
    else
      run allow from "$src" to any port "$ssh_port" proto tcp
    fi
  done
  for src in "${CF_IPV4[@]}" "${CF_IPV6[@]}"; do
    run allow from "$src" to any port 80 proto tcp
    run allow from "$src" to any port 443 proto tcp
  done
  run --force enable
}

# Không tự chạy khi bị source/import.
if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  main "$@"
fi
