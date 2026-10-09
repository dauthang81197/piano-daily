---
title: 'Story 3.2 — Tải ngay Sheet miễn phí'
type: 'feature'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '01af386c34aee27281bab6e8f8706ca95e69f0dc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet đánh dấu Miễn phí (Story 3.1) chưa có đường tải: trang chi tiết không có nút Download và API chưa phát file gốc, nên người dùng không nhận được gì.

**Approach:** Thêm bảng `DownloadLog` và module `commerce` với `GET /files/:sheetId/:fileType/download` (công khai, rate limit): ghi log rồi 302 tới signed URL private TTL 5 phút. Trang chi tiết Sheet free hiện nhóm nút `button-download` (brass) chỉ cho định dạng có thật, bấm là tải ngay, không modal.

## Boundaries & Constraints

**Always:** `:fileType` là `pdf|midi|mp3` (chữ thường). Chỉ Sheet `PUBLISHED` và `is_free` có file hiện hành (`supersededAt` null) của type đó mới được tải; mọi trường hợp còn lại (Sheet không tồn tại, Draft/Archived, không free, thiếu file, `:sheetId` sai dạng) trả 404 `NOT_FOUND` giống hệt nhau, không có signed URL. `DownloadLog` chỉ do module `commerce` ghi (AD-1); `commerce` đọc Sheet/file qua service public của `catalog`, `storage_key` chỉ đi qua `StorageService`. Ghi `DownloadLog` rồi mới trả 302 (log lỗi thì không trả URL). `ip_hash = sha256(ip + VIEW_SALT)` hex, IP theo `getClientIp()`, không lưu IP thô; `ua` cắt 256 ký tự. Signed URL kèm `Content-Disposition: attachment; filename="{slug}.{pdf|mid|mp3}"` (slug ASCII của Sheet). Phản hồi 302 có `Cache-Control: no-store`. Rate limit 20 request/60 giây theo `getClientIp()`. Nút chỉ hiện khi `isFree` và có file type đó (`downloadTypes`); định dạng không có thì ẩn hẳn, không disable. Nghe/xem vẫn miễn phí, không đổi.

**Never:** Không làm token, Order, PayPal, modal, nút cho Sheet không free (Story 3.3+). Không để lộ URL/`storage_key` private ở response công khai hay HTML. Không thêm `download_count` (AD-20). Không hiện nút Download ở trang preview Draft (Story 2.10).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tải PDF free | Sheet PUBLISHED, `is_free`, có PDF | Ghi 1 DownloadLog (`token_id` null); 302 tới signed URL 5 phút | N/A |
| Không free | Sheet PUBLISHED, không free | Không ghi log, không URL | 404 `NOT_FOUND` |
| Draft / Archived / id lạ | Trạng thái khác PUBLISHED, hoặc UUID không tồn tại | Như trên | 404 `NOT_FOUND` |
| Thiếu file | Free nhưng không có MP3 | Như trên | 404 `NOT_FOUND` |
| `fileType` sai | `/files/:id/thumbnail/download` | Không log | 404 `NOT_FOUND` |
| Vượt rate limit | > 20 request/phút cùng IP | Từ chối | 429 |
| Trang free đủ 3 type | `isFree`, PDF+MIDI+MP3 | Nhóm 3 nút brass; call-out MIDI/MP3; PDF ở sidebar | N/A |
| Trang free thiếu MP3 | Không có MP3 | Không có nút/liên kết MP3 | N/A |
| Trang không free / preview | `isFree` false, hoặc route preview | Không có nút Download | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration viết tay `20261008120000_download_log` -- model `DownloadLog(id uuidv7, sheet_id FK cascade, file_type, token_id uuid null, ip_hash char(64), ua text null, created_at)`, index `(sheet_id, created_at)`; reuse enum `FileType`.
- `apps/api/src/modules/commerce/` (mới) -- `commerce.module.ts`, `downloads.controller.ts` (`@Public`, `ThrottlerGuard` 20/60s, `Cache-Control: no-store`, `@Redirect`/`res.redirect(302)`), `downloads.service.ts`, `download-log.repository.ts` (SQL/Prisma duy nhất của bảng), `ip-hash.ts`; đăng ký trong `app.module.ts`.
- `apps/api/src/modules/catalog/catalog.module.ts` -- export service mới `FreeDownloadSource.resolve(sheetId, type)` (trong `catalog`): trả `{storageKey, slug}` hoặc `null`; tái dùng truy vấn file hiện hành như `pricing.service.ts`.
- `apps/api/src/modules/media/storage.service.ts` -- `presignPrivateUrl(key, ttl, downloadName?)` thêm `ResponseContentDisposition`; không đổi hành vi hiện có.
- `apps/api/src/modules/catalog/public-sheets.service.ts` -- `buildDetail` thêm `isFree` và `downloadTypes` (type PDF/MIDI/MP3 có file hiện hành); không thêm giá.
- `packages/shared/src/sheet.ts`, `index.ts` -- `publicSheetDetailSchema` thêm `isFree` (`default(false)`) và `downloadTypes` (`default([])`, cho phản hồi cache cũ); schema param `freeDownloadParamSchema` (`fileType` lowercase).
- `apps/web/src/components/sheet/sheet-detail.tsx` (+ `download-buttons.tsx` mới) -- nhóm nút dưới header, call-out MIDI/MP3 sau ảnh trang, nút PDF ở sidebar; prop `showDownloads` (mặc định true, preview truyền false); href `${publicApiUrl()}/files/{id}/{type}/download`.
- `apps/web/src/messages/vi.json`, `en.json` -- nhãn nút/call-out trong `Sheet`; trang trọng, không emoji.
- Test: `apps/api/test/unit` (ip-hash, resolve), `apps/api/test/integration/free-download.spec.ts`, `public-sheets.spec.ts`, `sheet-detail.test.tsx`, README mục Story 3.2.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- bảng `download_logs` -- AD-20
- [x] `packages/shared` -- thêm trường chi tiết công khai + param schema; test schema
- [x] `media/storage.service.ts` -- tham số `downloadName` cho presign -- tên file khi tải
- [x] `catalog` -- `FreeDownloadSource` + `downloadTypes`/`isFree` ở `buildDetail`; export từ module
- [x] `commerce` module -- controller/service/repository/ip-hash; log rồi 302; rate limit; đăng ký `app.module.ts`
- [x] `apps/web` -- `DownloadButtons`, bố cục UX-DR22, i18n vi/en, preview ẩn nút
- [x] Test và README -- unit (ip-hash, resolve), integration theo bảng I/O (kể cả 429, log đúng cột, URL private 5 phút), web (3 type, thiếu MP3, không free, preview)

**Acceptance Criteria:**
- Given Sheet free đủ file, when GET endpoint, then `Location` là signed URL vùng private (`X-Amz-Expires=300`) và có đúng 1 dòng `download_logs` với `token_id` null, `ip_hash` 64 ký tự, không chứa IP thô.
- Given log không ghi được, when GET, then không có 302 (500, không lộ URL).
- Given response chi tiết công khai, then không chứa `storageKey` hay URL private.
- Given Sheet free, when render trang chi tiết, then nút là liên kết `<a>` tải trực tiếp (không `button` mở modal) và có focus ring brass.

## Implementation Notes

- Triển khai trực tiếp (không dùng subagent). `:fileType` tái dùng `removeFileTypeSchema` (`pdf|midi|mp3`) từ `packages/shared`, không thêm schema mới. `FreeDownloadSource` (catalog) là cổng duy nhất `commerce` dùng để đọc Sheet/file.
- Đã chạy và pass: `typecheck`, `lint`, `build` toàn repo; `packages/shared` 170/170; `apps/web` 399 pass (mới: 7 test nút tải); `apps/api` unit mới 10/10 (ip-hash, DownloadsService, presign). Còn lỗi sẵn có, không do story này: 2 test `midi-player-bundle` (đường dẫn Windows, fail cả khi stash thay đổi) và `pdf-processor.spec` (máy thiếu `pdftoppm`); `midi-player.test` "Pause" chập chờn khi chạy cả bộ.
- **CHƯA chạy được:** `apps/api/test/integration/free-download.spec.ts` (mọi hàng I/O Matrix phía API: 302, log, 404, 429, payload chi tiết) và migration `20261008120000_download_log` trên Postgres thật, vì máy không có Docker (Postgres/SeaweedFS). Cần chạy `unset NODE_ENV` + `pnpm --filter @piano-daily/api test:integration` trước khi coi story là xong.
- Chạy pnpm bằng `node …/corepack/v1/pnpm/12.6.0/bin/pnpm.mjs` vì corepack của máy tìm sai `pnpm.cjs`.

## Spec Change Log

## Review Triage Log

Review tự thực hiện trong phiên (không dùng subagent vì chưa được cho phép), không có reviewer độc lập.

- **false — `@Header('Cache-Control')` bị mất khi dùng `@Redirect`:** Nest đặt header tuỳ biến trước khi xử lý kết quả redirect; `free-download.spec` khẳng định `no-store` nhưng CHƯA chạy được (xem Implementation Notes).
- **false — Nút lộ `storage_key`/URL private qua HTML:** nút chỉ trỏ tới `/files/:id/:type/download`; `storageKey` PDF/MP3 chỉ nằm trong `buildDetail`, không đưa vào payload; integration test khẳng định payload không chứa `storageKey|private/`.
- **false — `aria-label` che chữ hiển thị:** nhãn bắt đầu bằng đúng chữ hiển thị ("Download PDF for …"), thoả label-in-name.
- **low (rejected) — Rate limit tính cả request 404:** hành vi chung của `ThrottlerGuard`, không đáng thêm nhánh.
- **medium | defer — Khe hở nhỏ giữa kiểm tra quyền và ghi log (AD-20 nói "cùng transaction"):** `resolve` và `recordFree` là hai câu riêng; Sheet bị gỡ ở giữa vẫn nhận URL tối đa 5 phút. Không liên quan tiền; ghi vào `deferred-work.md`.
- **low (rejected) — `download_logs` chưa có job dọn/retention:** spec không yêu cầu; dữ liệu là nguồn số liệu của dashboard (Epic 4).

Review vòng 2 (3 reviewer độc lập: Blind Hunter, Edge Case Hunter, Verification Gap):

- **low | patch (đã sửa) — Route tải không có `X-Robots-Tag` dù `robots.ts` nói "tự đặt noindex":** thêm header `noindex, nofollow` ở controller, test khẳng định.
- **low | patch (đã sửa) — Không test "bản hiện hành mới nhất thắng" của `resolve()`:** thêm integration test hai file PDF hiện hành khác `createdAt`.
- **false — Slug dài làm `presignPrivateUrl` ném lỗi, để lại log mồ côi:** slug do `slugify` tạo, tối đa `SLUG_MAX_LENGTH`=80 ký tự ASCII; tên file ≤ 84 < 200; `storageKey` luôn `private/`.
- **false — Slug toàn ký tự không-ASCII thành `---`:** slug luôn ASCII từ `slugify`.
- **false — UA có NUL/surrogate gây lỗi insert:** header HTTP của Node không chứa NUL.
- **false — Header `CF-Connecting-IP` giả mạo qua rate limit:** quy ước chung AD-18 của `getClientIp`, dùng nguyên cho mọi endpoint; không do story này.
- **false — Cache chi tiết Sheet không bị làm mới khi đổi `is_free`/file:** đường ghi nằm ở `sheets.service` qua `CacheInvalidator` (Story 3.1), schema còn `default` cho cache cũ.
- **low (rejected) — Comment `sha256(ip + VIEW_SALT)` lệch dấu phân tách `\u0000`; PDF link hiển thị hai lần; `showDownloads` mặc định true; thiếu schema `freeDownloadParamSchema` (đã dùng `removeFileTypeSchema` tương đương); log không dedupe/bot; IP 'unknown' chung bucket; FK `ON DELETE CASCADE`; không index `created_at`/retention:** chỉ là tinh chỉnh, không có tác hại cụ thể hoặc phải thêm nhánh/bề mặt mới.
- **carried — Khe hở resolve→log và log trước presign:** đã ghi ở vòng trước (defer).

## Design Notes

Luồng: `commerce.DownloadsService.freeDownload(sheetId, type, ip, ua)` → `catalog.FreeDownloadSource.resolve()` (null → 404) → `DownloadLogRepository.insert()` → `storage.presignPrivateUrl(key, 300, "{slug}.{ext}")`. Chấp nhận khe hở nhỏ: Sheet bị gỡ giữa lúc kiểm tra và ghi log vẫn phát URL trong tối đa 5 phút (không phải rủi ro tiền; ghi vào `deferred-work.md` nếu review cần).

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test` và `pnpm --filter @piano-daily/web test` -- expected: pass
- API unit + integration (Docker Postgres/SeaweedFS, `unset NODE_ENV`) -- expected: pass
- `pnpm build` -- expected: pass
