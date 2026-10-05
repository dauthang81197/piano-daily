---
title: 'Story 2.7 — Đếm lượt xem chống trùng'
type: 'feature'
created: '2026-10-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd13cf3ecf86aa24f30381e394df818795f45c6fc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `view_count` chưa bao giờ tăng: trang chi tiết được cache nên server không đếm được, và nếu đếm thô thì một lần refresh hay một bot sẽ bơm số liệu "xem nhiều nhất" và dashboard.

**Approach:** Trang chi tiết (client) gửi beacon `POST /sheets/:id/view`; API (`catalog`) chèn một dòng vào bảng dedupe `SheetViewDedupe(sheet_id, visitor_hash, hour_bucket)` UNIQUE và chỉ khi chèn thành công mới tăng `view_count` thêm 1, trong cùng một câu lệnh nguyên tử; endpoint có throttle, bỏ qua mọi Sheet không PUBLISHED và không lưu IP thô.

## Boundaries & Constraints

**Always:**
- **Migration SQL tay** (`apps/api/prisma/migrations/<ts>_sheet_view_dedupe/`) và model Prisma `SheetViewDedupe` (`@@map("sheet_view_dedupe")`): `sheet_id uuid` FK `sheets(id)` `ON DELETE CASCADE`, `visitor_hash char(64)` (sha256 hex), `hour_bucket timestamptz`, khoá chính/UNIQUE `(sheet_id, visitor_hash, hour_bucket)`, thêm index `hour_bucket` cho việc dọn. `prisma migrate diff` không được báo lệch giữa schema và migration.
- **Đếm nguyên tử, SQL thô chỉ trong repository `catalog`** (`sheet-views.repository.ts`, `Prisma.sql` tham số hoá, không `$queryRawUnsafe`): một câu lệnh `WITH published AS (SELECT id FROM sheets WHERE id = $1 AND status = 'PUBLISHED'), ins AS (INSERT INTO sheet_view_dedupe … SELECT … FROM published ON CONFLICT DO NOTHING RETURNING sheet_id) UPDATE sheets SET view_count = view_count + 1 WHERE id IN (SELECT sheet_id FROM ins)`. **Không** dùng `prisma.sheet.update` để tăng đếm vì `@updatedAt` sẽ đổi `updated_at` và làm sai dòng "Sheet database updated on …" cùng ngày cập nhật ở trang chi tiết. Trả về `boolean` đã đếm hay chưa (chỉ để test/log, không lộ ra client).
- **`visitor_hash`** là hàm thuần `visitorHash(ip, userAgent, salt)` (unit test): `sha256` hex của `ip`, `userAgent` (cắt 256 ký tự, thiếu thì rỗng) và `salt`, nối bằng ký tự phân tách cố định để tránh nhập nhằng. IP lấy qua `getClientIp()` (AD-18), **không bao giờ** lưu hay log IP thô hay UA thô. `hour_bucket` là mốc giờ UTC hiện tại cắt về đầu giờ.
- **`VIEW_SALT`** (biến môi trường API) **bắt buộc**, ≥ 32 ký tự, không bắt đầu `change-me` (cùng khuôn `INTERNAL_API_SECRET`: thiếu thì API không khởi động; lỗi nêu tên biến, không lộ giá trị). Thêm vào `env.ts` (+ cập nhật `env.spec.ts`), `docker-compose.yml` (service `api`, bắt buộc), `.env.example` (giá trị dev) và README; `create-app.ts` đặt giá trị test. Không bao giờ có tiền tố `NEXT_PUBLIC_`.
- **Endpoint** `POST /sheets/:id/view` (`@Public()`, thêm vào allowlist `public-routes.spec.ts`): `:id` là UUID (sai dạng → 400 `VALIDATION_FAILED`); luôn trả `204` không body với mọi UUID hợp lệ — Sheet không tồn tại, Draft, Archived, đã đếm trong giờ hay vừa đếm đều **không phân biệt được** (không lộ trạng thái). Có throttle theo `getClientIp()`: `ThrottlerGuard` kèm `@Throttle` 30 request/60 giây (ghi đè mặc định 5/60 s); vượt giới hạn → 429 + `Retry-After`; secret nội bộ vẫn được miễn như mọi route khác. Không `Cache-Control` cho phép lưu response.
- **Dọn dẹp:** job `@Cron` mỗi giờ (cùng khuôn `SheetFileGcService`, có cờ `running`) xoá dòng dedupe có `hour_bucket` cũ hơn 24 giờ; lỗi chỉ log. Phương thức `run(now)` gọi được trực tiếp trong test.
- **Web:** client component `ViewBeacon({ sheetId })` gửi đúng một lần khi mount bằng `fetch(`${publicApiUrl()}/sheets/${sheetId}/view`, { method: 'POST', keepalive: true })` — không header tuỳ biến, không body, không credentials (request đơn giản, không preflight), lỗi bị nuốt, không ảnh hưởng UI. Đặt trong `sheet/[slug]/page.tsx` (không đặt trong `SheetDetail`) để Story 2.10 (preview Draft) dùng lại `SheetDetail` mà không gửi beacon. Bỏ qua khi thiếu `NEXT_PUBLIC_API_URL`.
- **Cache:** không revalidate cache web theo lượt xem (sẽ làm nhiễu cache); số hiển thị trên thẻ/chi tiết cập nhật theo `revalidate: 600` sẵn có.
- **Test:** unit (`visitorHash`, env), integration API (Postgres thật: đếm một lần, lặp trong giờ không tăng, visitor khác tăng, UA khác tăng, Draft/Archived/lạ → 204 không đếm và không tạo dòng dedupe, IP thô không nằm trong DB, `updated_at` không đổi, throttle 429, GC), component `ViewBeacon`, test trang.

**Never:**
- Không lưu IP/UA thô; không dùng Redis hay bộ nhớ tiến trình để dedupe; không để client chọn `visitor_hash` hay `hour_bucket`; không proxy beacon qua SSR (phải đi từ trình duyệt, để IP/UA là của người xem).
- Không làm đếm cho preview Draft (2.10), dashboard thống kê, hay chống bot nâng cao (CAPTCHA, lọc UA).
- Không thêm dependency; không đổi hành vi `/admin/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lượt đầu | Sheet PUBLISHED, visitor mới | `204`; `view_count + 1`; một dòng dedupe | N/A |
| Refresh trong giờ | cùng IP + UA, cùng giờ | `204`; `view_count` không đổi | N/A |
| Visitor khác | IP hoặc UA khác | `204`; `view_count + 1` | N/A |
| Sang giờ mới | cùng visitor, `hour_bucket` khác | `204`; `view_count + 1` | N/A |
| Gửi dồn song song | N request đồng thời cùng visitor | Đúng 1 lượt được tính | UNIQUE + `ON CONFLICT DO NOTHING` |
| Draft/Archived | Sheet không PUBLISHED | `204` giống hệt; không tăng, không tạo dòng dedupe | N/A |
| Sheet không tồn tại | UUID hợp lệ nhưng lạ | `204` giống hệt | N/A |
| `:id` sai dạng | `abc` | 400 `VALIDATION_FAILED` | N/A |
| Bị gọi dồn dập | > 30 request/60 s từ một IP | 429 + `Retry-After` | N/A |
| Secret nội bộ | `X-Internal-Secret` đúng | Không bị throttle | N/A |
| Riêng tư | sau khi đếm | Không có IP/UA thô trong bảng dedupe; `visitor_hash` 64 ký tự hex | N/A |
| Không đổi ngày cập nhật | sau khi đếm | `sheets.updated_at` giữ nguyên | N/A |
| Sheet bị xoá | xoá Sheet | Dòng dedupe xoá theo (CASCADE) | N/A |
| Dọn dẹp | dòng dedupe > 24 giờ | `run()` xoá; dòng mới hơn giữ | Lỗi chỉ log |
| Thiếu `VIEW_SALT` | env thiếu/ngắn/`change-me…` | API không khởi động, lỗi nêu tên biến | `EnvValidationError` |
| Beacon web | trang chi tiết mount | Đúng 1 lần `POST`, `keepalive`, không header/body; lỗi mạng bị nuốt | N/A |
| Preview/Thiếu env | `SheetDetail` dùng riêng, hoặc thiếu `NEXT_PUBLIC_API_URL` | Không gửi beacon | N/A |
| Route public | quét controller | `POST /sheets/:id/view` nằm trong allowlist | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/{schema.prisma,migrations/}` -- thêm model `SheetViewDedupe` và migration tay; mẫu SQL tay ở `20261002090000_catalog_search`; enum Postgres `"SheetStatus"`.
- `apps/api/src/modules/catalog/{public-sheets.controller,catalog.module}.ts` -- thêm route `POST sheets/:id/view` (sau `sheets/facets`, trước/không đụng `sheets/:slug` vì khác method); đăng ký repository và service GC; `SheetSearchRepository` là mẫu SQL thô có tham số.
- `apps/api/src/modules/catalog/sheet-file-gc.service.ts` -- mẫu `@Cron` + cờ `running` cho job dọn.
- `apps/api/src/common/http/client-ip.ts` (`getClientIp`), `apps/api/src/app.module.ts` (cấu hình `ThrottlerModule`: tracker theo IP, `skipIf` secret nội bộ), `modules/identity/auth.controller.ts` (cách dùng `@UseGuards(ThrottlerGuard)`).
- `apps/api/src/config/env.ts` (+ `test/unit/env.spec.ts`), `test/integration/create-app.ts`, `docker-compose.yml` (service `api`), `.env.example`, `README.md` -- thêm `VIEW_SALT`; **`.env` cục bộ của nhà phát triển (gitignored) cũng cần giá trị mới**.
- `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` -- mẫu integration và allowlist.
- `apps/web/src/lib/public-env.ts` (`publicApiUrl`), `apps/web/src/app/[locale]/sheet/[slug]/page.tsx` -- nơi gắn `ViewBeacon`; thêm `apps/web/src/components/sheet/view-beacon.tsx` (+ test). `next.config.ts`: CSP `connect-src` đã có origin API.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/prisma/{schema.prisma,migrations/<ts>_sheet_view_dedupe}` -- bảng dedupe + index -- AD-11
- [x] `apps/api/src/config/env.ts` (+`env.spec.ts`), `create-app.ts`, `docker-compose.yml`, `.env.example` -- biến `VIEW_SALT` bắt buộc -- AD-11
- [x] `apps/api/src/modules/catalog/{visitor-hash,sheet-views.repository,sheet-views.service,sheet-view-dedupe-gc.service}.ts` (+ unit test `visitorHash`), `catalog.module.ts` -- đếm nguyên tử, dọn dẹp -- FR4
- [x] `apps/api/src/modules/catalog/public-sheets.controller.ts` -- `POST /sheets/:id/view` kèm throttle -- FR4
- [x] `apps/api/test/integration/{public-sheets,public-routes}.spec.ts` (hoặc `sheet-views.spec.ts`) -- phủ Matrix API và allowlist -- AC
- [x] `apps/web/src/components/sheet/view-beacon.tsx` (+test), `app/[locale]/sheet/[slug]/page.tsx` (+test) -- beacon -- FR4
- [x] `README.md` -- ghi endpoint, `VIEW_SALT`, quyền riêng tư -- tài liệu

**Acceptance Criteria:**
- Given stack chạy và đã `pnpm db:seed`, when mở một trang `/en/sheet/<slug>` rồi refresh nhiều lần trong cùng giờ, then `view_count` của Sheet đó chỉ tăng 1; mở bằng trình duyệt/IP khác thì tăng thêm.
- Given beacon gọi dồn dập hoặc Sheet không PUBLISHED, when gọi `POST /sheets/:id/view`, then bị 429 sau 30 request/phút/IP và Sheet không PUBLISHED không được đếm mà phản hồi không khác Sheet lạ.
- Given đã có lượt xem, when kiểm tra DB, then bảng dedupe chỉ có hash 64 ký tự (không IP/UA thô) và `updated_at` của Sheet không đổi.
- Given `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (build không đặt `NODE_ENV=development`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| `missing-env.spec.ts` spawn thiếu `VIEW_SALT` nên `invalidEnv` có thêm `VIEW_SALT`; chỉ xanh khi `.env` cục bộ có biến | high | patch | Đúng: môi trường spawn không có `VIEW_SALT`; trên máy/CI sạch sẽ fail. Thêm biến vào env của test |
| `turbo.json` `globalPassThroughEnv` thiếu `VIEW_SALT` (các biến API khác đều có) | medium | patch | Đúng: `INTERNAL_API_SECRET` có trong danh sách, `VIEW_SALT` thì không; thêm vào |
| Chưa có test CORS cho response `POST /sheets/:id/view` từ origin web | medium | patch | `cors.spec.ts` chỉ phủ `/auth/login` và `GET /health`; thêm test khẳng định Allow-Origin và không Allow-Credentials |
| Câu "không phân biệt được" nói tuyệt đối trong khi độ trễ có thể khác | low | patch | Sửa chú thích controller và README thành "phản hồi giống hệt" |
| Giả mạo `CF-Connecting-IP` khi gọi thẳng API vượt throttle và làm phồng đếm | low | - | Ranh giới tin cậy do AD-18 quy định (Caddy chuyển tiếp `CF-*` chỉ từ dải Cloudflare); cùng giả định với throttle đăng nhập; không thuộc story này |
| Bot/crawler và tải nền/prerender làm phồng đếm; thiếu lọc UA | low | - | Spec loại trừ chống bot nâng cao; dedupe theo giờ hạn chế tác hại |
| `record` ném lỗi khi DB hỏng thì beacon trả 500 | low | - | Phản hồi trung thực; client nuốt lỗi; giữ 500 để lỗi hạ tầng không bị che |
| Tranh chấp khoá hàng `sheets` khi nhiều visitor khác nhau cùng một Sheet; bloat tuple | low | - | Thiết kế do AD-11 quy định (một câu lệnh, UNIQUE trong Postgres, không Redis); `view_count` không nằm trong chỉ mục nên cập nhật dạng HOT; chưa có bằng chứng tải |
| `getClientIp` trả `unknown` làm nhiều visitor chung hash | low | - | Chỉ khi socket không có địa chỉ; không xảy ra qua HTTP thật |
| `z.uuid()` từ chối UUID sai bit phiên bản | false | - | Sheet id sinh bằng `uuidv7()` của Postgres, hợp lệ RFC |
| Test "thiếu NEXT_PUBLIC_API_URL" có thể pass rỗng | false | - | `publicApiUrl()` ném khi chuỗi rỗng (đã đọc mã); test khẳng định `fetch` không được gọi |
| Cron chạy trên mọi instance; chung bucket throttle với NAT; thiếu test IPv6/UA mảng; chiến lược xoay muối | low | - | API chạy một instance (AD-15); giới hạn 30/phút đủ rộng; ngoài phạm vi |

## Design Notes

- **Một câu lệnh CTE:** kiểm tra PUBLISHED, chèn dedupe và tăng đếm cùng chạy nguyên tử; hai request song song cùng visitor chỉ một cái chèn được nên chỉ một lượt được tính, không cần khoá hay transaction nhiều bước.
- **Vì sao không `prisma.sheet.update`:** `@updatedAt` tự đặt `updated_at = now()` nên mỗi lượt xem sẽ làm "cập nhật mới" giả trên trang Level và trang chi tiết.
- **204 cho mọi trường hợp:** tránh để kẻ dò phân biệt được Sheet Draft với Sheet không tồn tại (UX-DR15) và tránh lộ việc đã đếm hay chưa.
- **Bucket theo giờ cố định:** cùng một người đọc qua mốc giờ có thể được tính hai lần; chấp nhận theo AD-11 để dedupe chỉ cần UNIQUE, không cần đọc-rồi-ghi.
- **`VIEW_SALT` bắt buộc:** thiếu muối thì hash IP/UA có thể bị dò ngược bằng bảng tra; deny-by-default như `INTERNAL_API_SECRET`.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `pnpm --filter @piano-daily/api exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` -- expected: exit 0 (không lệch; cần shadow DB theo cấu hình Prisma của repo)

**Manual checks:**
- Trình duyệt (stack compose): mở `/en/sheet/<slug>`, xem Network có một `POST /sheets/<id>/view` trả `204` không preflight; refresh vài lần rồi kiểm tra `view_count` trong DB chỉ tăng 1; thử một Draft id bằng `curl -X POST` thấy `204` và số không đổi.
