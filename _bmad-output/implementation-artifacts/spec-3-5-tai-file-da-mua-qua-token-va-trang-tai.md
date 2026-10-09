---
title: 'Story 3.5 — Tải file đã mua qua token và trang tải'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '67d9c92fa67482892f2ce3be35ca1b3070a7d8f0'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người mua có `DownloadToken` (Story 3.4) nhưng chưa có đường tải file đã trả tiền và chưa có trang nào để xem file, số lượt, hạn dùng.

**Approach:** API `GET /downloads/:token/:fileType` trừ một lượt bằng một câu UPDATE nguyên tử, ghi `DownloadLog` (có `token_id`) cùng transaction rồi 302 tới signed URL private 5 phút; `GET /downloads/:token` trả trạng thái token. Trang web `/[locale]/downloads/[token]` hiển thị file đã mua, lượt còn lại, hạn dùng hoặc trạng thái hết hiệu lực.

## Boundaries & Constraints

**Always:** Token hợp lệ khi Order `PAID`, `revoked_at` null, `expires_at > now()`, `used_downloads < max_downloads`, và `:fileType` (`pdf|midi|mp3`) nằm trong file của token (`download_token_files`). Trừ lượt bằng đúng một `UPDATE … FROM orders … RETURNING` trong `prisma.$transaction` cùng `DownloadLog.insert`; rồi mới presign `storage_key` của file đã chụp (kể cả superseded; không lọc `Sheet.status`, ARCHIVED vẫn tải được) với `Content-Disposition: attachment; filename="{slug}.{ext}"`. UPDATE 0 dòng → đọc lại để phân loại: không có token → 404 `NOT_FOUND`; Order không PAID hoặc `revoked_at` → 410 `TOKEN_REVOKED`; hết hạn → 410 `TOKEN_EXPIRED`; hết lượt → 410 `TOKEN_EXHAUSTED`; `:fileType` không thuộc token → 404. `GET /downloads/:token` luôn 200 nếu token tồn tại, trả `{sheetTitle, files[{fileType,name}], remainingDownloads, expiresAt, status: ACTIVE|EXPIRED|EXHAUSTED|REVOKED}`, không lộ `storage_key`/email. Cả hai route `@Public`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`, rate limit 20/60s theo `getClientIp()`; `ip_hash`/`ua` như tải miễn phí; không log token. Trang web: `force-dynamic`, metadata `robots noindex`, header `no-store` và `Referrer-Policy: no-referrer` cho `/:locale/downloads/:path*`, `robots.txt` chặn `/{locale}/downloads/`. Token còn hiệu lực: "Thanh toán thành công. File của bạn đã sẵn sàng.", nút `button-download` (brass, tái dùng kiểu có sẵn) cho từng file, "Link tải còn hiệu lực X ngày, Y lượt." (EN đủ số ít/nhiều). Token hết hiệu lực/bị vô hiệu: "Link tải đã hết hiệu lực" kèm cách liên hệ, không đẩy sang mua lại. Liên hệ lấy từ biến môi trường `NEXT_PUBLIC_CONTACT_EMAIL` (mailto khi có; chưa đặt thì chữ hướng dẫn liên hệ qua email đã dùng khi mua). Token không tồn tại → `notFound()`. Microcopy song ngữ vi/en, trang trọng, không emoji.

**Never:** Không email, hoàn tiền, thu hồi token, webhook (Story 3.7, 3.8, Epic 4). Không gọi PayPal. Không đưa `storage_key` ra response/HTML. Không prefetch link tải (mỗi lần bấm trừ một lượt). Không thêm quảng cáo hay mua lại tự động.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tải file | Token hợp lệ, `pdf` thuộc token | `used_downloads+1`, 1 DownloadLog (`token_id`), 302 signed URL 300s | N/A |
| Sheet ARCHIVED | Token hợp lệ, Sheet ARCHIVED | Vẫn 302 | N/A |
| Đồng thời | max=2, N request song song | Đúng 2 lượt thành công, `used=2`, 2 log, phần còn lại bị từ chối | 410 `TOKEN_EXHAUSTED` |
| Hết hạn / hết lượt / vô hiệu | `expires_at` qua / `used=max` / `revoked_at` hoặc Order REFUNDED | Không URL, không log | 410 `TOKEN_EXPIRED` / `TOKEN_EXHAUSTED` / `TOKEN_REVOKED` |
| Token lạ / type ngoài đơn | Token không có; `midi` không thuộc đơn | Không trừ lượt | 404 `NOT_FOUND` |
| Xem trạng thái | `GET /downloads/:token` | Tên bài, file, lượt còn lại, hạn, status | 404 nếu không có |
| Trang còn hiệu lực | status ACTIVE | Thông điệp thành công, nút từng file, dòng hiệu lực | N/A |
| Trang hết hiệu lực | status ≠ ACTIVE | "Link tải đã hết hiệu lực" + liên hệ, không nút tải | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/commerce/download-token.repository.ts` -- thêm `findByToken` (token + order{status,sheet{title,slug}} + files{type,storageKey}) và `consume(tx, token)` (UPDATE nguyên tử + phân loại); `download-log.repository.ts` thêm `recordPaid(tx, …)`.
- `apps/api/src/modules/commerce/paid-downloads.service.ts`, `paid-downloads.controller.ts` (mới) -- mô phỏng `downloads.service/controller`: `@Redirect(302)`, Throttler, `ipHash`, `DOWNLOAD_URL_TTL_SECONDS`; đăng ký trong `commerce.module.ts`.
- `packages/shared/src/errors.ts`, `order.ts`, `index.ts` -- `TOKEN_EXPIRED/EXHAUSTED/REVOKED`, `downloadStatusResponseSchema`; `http-exception.filter.ts` thêm `DEFAULT_MESSAGE`.
- `apps/api/test/integration/public-routes.spec.ts` -- thêm hai route vào allowlist.
- `apps/web/src/app/[locale]/downloads/[token]/page.tsx` (+ `loading.tsx`, test) -- theo `preview/sheet/[id]/page.tsx`; `lib/catalog.ts` (hoặc `lib/downloads.ts`) `fetchDownloadStatus` bằng `apiFetch` no-store, 404 → null; export kiểu nút từ `components/sheet/download-buttons.tsx`; href `${publicApiUrl()}/downloads/{token}/{type}`.
- `apps/web/next.config.ts`, `lib/preview-headers.ts`, `app/robots.ts`, `messages/vi.json`, `en.json` (namespace `Downloads`), `.env.example` (`NEXT_PUBLIC_CONTACT_EMAIL`), `docker-compose.yml`/`public-env.ts` nếu cần truyền biến.
- Test: unit service; integration `paid-download.spec.ts` (đồng thời, ARCHIVED, revoked/expired/exhausted, type ngoài đơn, REFUNDED); web page + messages.

## Tasks & Acceptance

**Execution:**
- [x] `shared` + filter -- mã lỗi token, schema trạng thái; test
- [x] `commerce` -- repository `consume`/`findByToken`, service, controller, `recordPaid`; test đơn vị và integration theo ma trận (kể cả đồng thời)
- [x] `public-routes.spec.ts` -- allowlist
- [x] `web` -- trang, `fetchDownloadStatus`, header/robots, messages vi/en; test trang
- [x] env `NEXT_PUBLIC_CONTACT_EMAIL`, README mục Story 3.5

**Acceptance Criteria:**
- Given token max=2 và nhiều request đồng thời, when xong, then `used_downloads` đúng 2 và có đúng 2 `download_logs` mang `token_id`.
- Given Sheet ARCHIVED, when tải bằng token hợp lệ, then 302 như bình thường.
- Given token hết hiệu lực, when mở trang, then thấy "Link tải đã hết hiệu lực" với cách liên hệ và không có nút tải hay nút mua lại.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **high | patch (đã sửa) — `apps/web/Dockerfile` có chuỗi `
` thật trong dòng `ENV`, làm hỏng build ảnh web và mất `NEXT_PUBLIC_CONTACT_EMAIL`:** thay bằng xuống dòng + tiếp dòng đúng.
- **medium | patch (đã sửa) — Token tải (bearer credential) nằm trong URL nên bị pino-http ghi vào log API, trái "không log token":** `redactTokenInUrl` che `/downloads/:token` trong serializer `req`; test `logger.spec`.
- **medium | patch (đã sửa) — Ký URL lỗi sau khi transaction đã commit làm người mua mất lượt mà không nhận file:** ký signed URL ngay trong transaction, lỗi thì rollback cả trừ lượt và log.
- **medium | patch (đã sửa) — Chưa test file đã bị thay thế sau khi mua vẫn tải đúng bản đã chụp:** thêm case integration (token trỏ file cũ, có file hiện hành mới cùng type).
- **false — Trang gọi API bằng IP máy chủ web nên mọi lượt xem trang bị throttle chung:** `apiFetch` gửi `X-Internal-Secret`, `ThrottlerGuard.skipIf` bỏ throttle cho SSR (AD-18).
- **false — `parseFileType` có thể cho type ngoài `pdf|midi|mp3` làm `TYPE[...]` undefined:** `removeFileTypeSchema` chỉ gồm đúng `REMOVABLE_FILE_TYPES = [pdf, midi, mp3]`.
- **false — `findFirstOrThrow` 500 khi file biến mất giữa UPDATE và đọc:** `download_token_files.sheet_file_id` là FK RESTRICT nên dòng file không thể mất.
- **false — `NEXT_PUBLIC_CONTACT_EMAIL` không vào bundle server:** Next thay `NEXT_PUBLIC_*` lúc build cho cả bundle server; Dockerfile nay truyền đúng.
- **low (rejected) — Mọi trạng thái không ACTIVE cùng một thông điệp; trang ACTIVE không có nút khi thiếu `publicApiUrl`/file rỗng; `expiresAt` hỏng; `PREVIEW_HEADERS` dùng chung mảng; thiếu throttle theo token; lỗi 410 thô khi bấm trên trang cũ; chưa test rollback log bằng DB thật:** spec yêu cầu một thông điệp chung và không đẩy mua lại; token 256 bit nên dò không khả thi; các điểm còn lại là tinh chỉnh không có tác hại cụ thể.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test` và `pnpm --filter @piano-daily/web test` -- expected: pass
- API unit + integration (Docker Postgres/SeaweedFS) -- expected: pass (CI chạy integration)
