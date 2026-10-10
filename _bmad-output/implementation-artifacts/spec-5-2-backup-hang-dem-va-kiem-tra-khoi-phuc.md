---
title: 'Story 5.2 — Backup hằng đêm và kiểm tra khôi phục'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e9f6170cb5952fd45041eeeea5e7c8d81a8abc35'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Dữ liệu đơn hàng và nội dung chỉ nằm trong volume Postgres trên một VPS, chưa có backup tự động hay quy trình khôi phục đã kiểm chứng.

**Approach:** Thêm service `backup` riêng vào `docker-compose.cloudflare.yml` chạy `pg_dump` hằng đêm đẩy lên bucket private của R2 (tên có timestamp, giữ N bản), kèm script khôi phục và hướng dẫn trong README; job lỗi thì thoát mã khác 0 và ghi log `ERROR`.

## Boundaries & Constraints

**Always:** Tất cả file backup nằm dưới `deploy/backup/`: `Dockerfile` (base `postgres:18.6` cùng major với DB, cài AWS CLI), `backup.sh` (một lần chạy), `backup-loop.sh` (ngủ tới giờ `BACKUP_AT`, mặc định `03:00` theo `Asia/Ho_Chi_Minh`, rồi chạy `backup.sh`, lặp lại), `restore.sh`. `backup.sh`: `pg_dump --format=custom` từ `DATABASE_URL`, key `backups/piano-daily-<YYYYMMDDTHHMMSSZ>.dump` (UTC) trong `S3_BUCKET_PRIVATE` qua `S3_ENDPOINT`/`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`/`S3_REGION`, sau khi upload thành công mới xoay vòng: giữ `BACKUP_KEEP` (mặc định 14) bản mới nhất theo tên và xoá phần còn lại, không bao giờ xoá khi upload lỗi; chỉ đụng khoá có tiền tố `backups/piano-daily-` và đuôi `.dump`. Lỗi bất kỳ (dump, upload, rỗng) thì in một dòng log bắt đầu bằng `ERROR` ra stderr và thoát mã khác 0; thành công in `INFO` kèm key và kích thước. `backup-loop.sh` không dừng khi một lần chạy lỗi (log `ERROR`, chờ ngày hôm sau) nhưng cung cấp chế độ `--once` thoát với mã của `backup.sh` để dùng với cron/`docker compose run`. `docker-compose.cloudflare.yml` thêm service `backup` (build từ `deploy/backup`, `depends_on` postgres healthy, `restart: unless-stopped`, chỉ nhận biến cần thiết, không publish cổng); `deploy/.env.cloudflare.example` thêm `BACKUP_AT`, `BACKUP_KEEP`. `restore.sh <đường-dẫn-hoặc-key-S3> <DATABASE_URL đích>` dùng `pg_restore --no-owner --clean --if-exists`, từ chối chạy khi thiếu tham số. README có mục "Backup và khôi phục": cách chạy tay một lần, kiểm tra bản backup, khôi phục vào DB trống ở local (docker postgres), chạy app trỏ vào DB đó, và checklist xác nhận đã thử (có ô để ghi ngày thử). Secret không in ra log.

**Never:** Không sửa `docker-compose.prod.yml`, `deploy/Caddyfile`, CI workflow hay deploy sslip.io; không đẩy backup lên bucket public; không tự chạy khôi phục lên DB production; không thêm cảnh báo/giám sát (thuộc Story 5.3); không chạy lệnh nào trên server thật.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Backup thành công | DB có dữ liệu, R2 ghi được | Upload `backups/piano-daily-<timestamp>.dump`, log `INFO` | N/A |
| Xoay vòng | 16 bản sẵn có + 1 mới, `BACKUP_KEEP=14` | Còn đúng 14 bản mới nhất; bản ngoài mẫu tên không bị xoá | N/A |
| `pg_dump` lỗi | DB không kết nối được | Không upload, không xoá bản cũ, thoát mã khác 0 | Log `ERROR` |
| Upload lỗi | R2 từ chối | Không xoay vòng, thoát mã khác 0 | Log `ERROR` |
| Dump rỗng | `pg_dump` ra 0 byte | Không upload, thoát mã khác 0 | Log `ERROR` |
| Thiếu biến môi trường | thiếu `S3_BUCKET_PRIVATE` | Thoát mã khác 0 nêu tên biến | Log `ERROR` |
| Khôi phục | file `.dump` hợp lệ + DB trống | Bảng và dữ liệu được tạo lại | `restore.sh` thiếu tham số thì thoát mã 2 |
| Vòng lặp gặp lỗi | một lần chạy thất bại | Loop vẫn sống, thử lại hôm sau | Log `ERROR` |

</frozen-after-approval>

## Code Map

- `docker-compose.cloudflare.yml` (postgres 18.6 `postgres-data`, S3_* ở service api), `deploy/.env.cloudflare.example` -- thêm service `backup` và biến; tham khảo cách khai báo `${VAR:?}`.
- `deploy/backup/{Dockerfile,backup.sh,backup-loop.sh,restore.sh}` -- mới; `.gitattributes` đã ép `*.sh` eol=lf.
- `apps/api/test/unit/deploy-config.spec.ts` -- mẫu test script (`hasBash`, `execFileSync`); thêm `apps/api/test/unit/backup-script.spec.ts` chạy `backup.sh` với `pg_dump`/`aws` giả đặt trong `PATH` tạm để kiểm ma trận (thành công, xoay vòng, các lỗi, mã thoát, `ERROR`).
- `README.md` -- mục backup/khôi phục; `docs/cloudflare.md` -- liên kết tới mục đó.
- Chỉ đọc: `apps/api/src/modules/media/storage.service.ts` (bucket private), `apps/api/prisma/schema.prisma`.

## Tasks & Acceptance

**Execution:**
- [x] `deploy/backup/backup.sh`, `backup-loop.sh`, `restore.sh`, `Dockerfile` -- backup, xoay vòng, lịch, khôi phục -- AC backup/khôi phục
- [x] `docker-compose.cloudflare.yml`, `deploy/.env.cloudflare.example` -- service `backup` và biến -- AC service riêng
- [x] `apps/api/test/unit/backup-script.spec.ts` (+ cập nhật `deploy-config.spec.ts` kiểm service `backup`) -- test ma trận bằng binary giả -- AC thất bại thoát lỗi
- [x] `README.md`, `docs/cloudflare.md` -- hướng dẫn backup/khôi phục và checklist đã thử -- AC khôi phục

**Acceptance Criteria:**
- Given compose Cloudflare, when xem service `backup`, then nó chạy riêng, đọc bucket private, không publish cổng và không đụng deploy cũ.
- Given đã có hơn `BACKUP_KEEP` bản, when backup thành công, then chỉ giữ số bản mới nhất theo cấu hình.
- Given backup thất bại ở bất kỳ bước nào, when job kết thúc, then thoát mã khác 0, log bắt đầu bằng `ERROR` và không xoá bản cũ.
- Given README, when làm theo, then khôi phục được vào DB trống ở local (phần thử thật cần máy có Docker, ghi trong checklist).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Phát hiện | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Gói apt `awscli` có thể không có trên Debian của `postgres:18.6` | high | patch | Chuyển sang AWS CLI v2 bản zip chính thức theo kiến trúc. |
| Xoay vòng khớp lỏng tên key, có thể xoá bản mới vừa upload | medium | patch | Khớp chặt `YYYYMMDDTHHMMSSZ.dump` và loại trừ `$KEY`. |
| `pg_dump`/upload có thể treo mãi | medium | patch | Thêm `timeout 1h`/`30m`, hết giờ là lỗi. |
| Tham số lạ vào thẳng vòng lặp | low | patch | In ERROR, thoát mã 2. |
| Vòng lặp lịch, restore từ S3, `BACKUP_KEEP` sai, lộ secret ở nhánh lỗi chưa có test | medium | patch | Thêm test tương ứng (18 test). |
| Chưa kiểm bản upload (head-object), mã hoá dump, khoá R2 riêng/object lock | low | reject | Ngoài phạm vi spec; `aws s3 cp` đã kiểm mã thoát. |
| Không chạy bù khi container tắt đúng giờ, không bắt SIGTERM, không healthcheck | medium | defer | Ghi `deferred-work.md`. |
| `restore.sh` không chặn trỏ nhầm DB production | low | reject | README cảnh báo; spec chỉ yêu cầu từ chối khi thiếu tham số. |
| Mật khẩu trong argv, mật khẩu cần mã hoá URL, lệch phiên bản Postgres | low | reject | Mẫu giống service api hiện có, không thuộc story này. |

## Verification

**Commands:**
- `backup-script.spec`, `deploy-config.spec`, `tsc --noEmit` api, eslint, `bash -n deploy/backup/*.sh` -- expected: pass

**Manual checks (if no CLI):**
- Trên máy có Docker: chạy `backup.sh --once` với R2 thật hoặc MinIO, rồi làm theo README để khôi phục vào DB local và chạy app; ghi ngày thử vào checklist (phiên này không làm được).
