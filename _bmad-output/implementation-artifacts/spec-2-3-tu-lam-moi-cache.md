---
title: 'Story 2.3 — Tự làm mới cache khi admin thay đổi nội dung'
type: 'feature'
created: '2026-10-02'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '14463e913256fbf38776b94d973c29d014e150f9'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Web công khai cache dữ liệu theo tag (`force-cache`, `revalidate: 600`) nhưng không có gì kích hoạt làm mới khi admin publish, sửa, đổi Level/Composer/Genre/Series, archive hay xoá, nên trang cũ còn hiển thị tới 10 phút.

**Approach:** Thêm `catalog.CacheInvalidator` tính tập tag (cả giá trị cũ lẫn mới) và, sau khi DB commit, gọi `POST /api/revalidate` của web kèm secret (retry, lỗi chỉ log); web có route handler gọi `revalidateTag(tag, { expire: 0 })`.

## Boundaries & Constraints

**Always:**
- **`CacheInvalidator` (`apps/api/src/modules/catalog/cache-invalidator.ts`, provider trong `CatalogModule`):**
  - `tagsFor(before, after)` thuần, nhận `SheetCacheState | null` = `{id, status, level, composerId, seriesId|null, genreIds[]}` (`null` = chưa tồn tại / đã xoá). Trả tập tag không trùng gồm `sheet:{id}`, `list:level`, `list:composer`, `list:series` (nếu có) và `list:genre` cho **cả trạng thái trước và sau**, cộng `search` và `sitemap`. **Nếu cả hai trạng thái đều không PUBLISHED thì trả `[]`** (Draft không hiện công khai). Tag sinh bằng `cacheTags` của shared.
  - `tagsForTaxonomy(kind: 'composer'|'genre'|'series', id)`: `list:{kind}:{id}`, cả 4 `list:level:*` (tên Composer/Genre hiện trên thẻ và tag cloud của trang Level), `search`, `sitemap`. Không liệt kê từng Sheet.
  - `snapshot(sheetId)` đọc `SheetCacheState` từ DB (`null` nếu không có); dùng `PrismaService`, chạy ngoài transaction của thao tác.
  - `notify(tags)`: không chờ; nếu `tags` rỗng hoặc `WEB_INTERNAL_URL` chưa cấu hình thì bỏ qua. Gọi `POST {WEB_INTERNAL_URL}/api/revalidate`, header `X-Internal-Secret: INTERNAL_API_SECRET`, body `{ tags }`, timeout mỗi lần 5 giây, tối đa **3 lần thử** (chờ 250ms rồi 500ms giữa các lần); hết lần thì `logger.error` (không log secret) và **không bao giờ ném lỗi hay chặn thao tác admin**.
- **Điểm gọi:** chỉ **sau khi commit DB thành công**. `SheetsService`: `create`, `update`, `setStatus`, `setHot`, `remove` (archive hoặc xoá), `attachFile`, `removeFile` — lấy `snapshot` trước, thực hiện, lấy `snapshot` sau (`null` nếu đã xoá), rồi `notify(tagsFor(before, after))`; thao tác lỗi thì không notify. `ComposersService`, `GenresService`, `SeriesService`: `create`, `update`, `remove` → `notify(tagsForTaxonomy(...))`. Hành vi và response hiện có của các thao tác giữ nguyên.
- **Env API:** thêm `WEB_INTERNAL_URL` (tuỳ chọn, URL http/https; compose đặt `http://web:4100`). Thiếu thì tắt revalidate (không lỗi; có `logger.warn` một lần lúc khởi động) — lưới an toàn `revalidate: 600` vẫn chạy. Dùng chung `INTERNAL_API_SECRET` làm secret.
- **Web `apps/web/src/app/api/revalidate/route.ts`** (`POST`, `runtime` Node): so sánh `X-Internal-Secret` với `INTERNAL_API_SECRET` bằng `timingSafeEqual` (băm sha256 trước); sai/thiếu → **401** và không revalidate gì. Body zod `{ tags: string[] }` (1–100 phần tử, mỗi tag khớp một dạng hợp lệ của `cacheTags`: `sheet:`, `list:level|composer|genre|series:`, `search`, `sitemap`, `ads`, `settings`); sai → 400. Hợp lệ → `revalidateTag(tag, { expire: 0 })` cho từng tag, trả 200 `{ revalidated: n }`. Hàm kiểm tra dạng tag đặt trong `packages/shared/src/cache-tags.ts` (`isCacheTag`) kèm test.
- **Tag trên trang Level** (Story 2.2) giữ nguyên; không đổi cách fetch.
- **Test:** unit cho `tagsFor` (đổi Level, đổi Composer, publish, archive, xoá, Draft-only), `tagsForTaxonomy`, `notify` (retry/timeout/không ném, bỏ qua khi thiếu URL); integration (server HTTP giả) cho điểm gọi; route handler của web (401, 400, 200, gọi `revalidateTag`).

**Never:**
- Không sửa luồng nghiệp vụ hay response của các thao tác catalog; không để lỗi revalidate làm thao tác admin thất bại hay chậm.
- Không `revalidatePath`; không bật `cacheComponents`; không đặt secret vào response, log hay biến `NEXT_PUBLIC_*`.
- Không làm tìm kiếm, trang Composer/Genre/Sheet công khai hay sitemap (Story 2.4+); chỉ phát tag cho chúng.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đổi Level | Sheet PUBLISHED BEGINNER → INTERMEDIATE | Tag có `list:level:beginner` và `list:level:intermediate`, `sheet:{id}`, `search`, `sitemap` | N/A |
| Đổi Composer | PUBLISHED, Composer A → B | Có `list:composer:A` và `list:composer:B` | N/A |
| Đổi Genre/Series | thêm/bớt Genre, đổi Series | Có tag của cả giá trị cũ và mới | N/A |
| Publish | DRAFT → PUBLISHED | Tag của trạng thái sau (Level, Composer, Genre, Series) + `sheet`, `search`, `sitemap` | N/A |
| Archive / xoá | PUBLISHED → ARCHIVED / xoá hẳn | Tag của trạng thái trước (`after` = ARCHIVED hoặc `null`) | N/A |
| Draft-only | DRAFT sửa tiêu đề | `[]`, không gọi web | N/A |
| Taxonomy | sửa/xoá Composer, Genre, Series | `list:{kind}:{id}` + 4 tag `list:level:*` + `search` + `sitemap` | N/A |
| Gọi web thành công | `WEB_INTERNAL_URL` đặt | `POST /api/revalidate` có header secret và body `{tags}` đúng | N/A |
| Web lỗi | web trả 500 hoặc không kết nối | Thử tối đa 3 lần rồi `logger.error`; thao tác admin vẫn thành công | Không ném lỗi |
| Thiếu `WEB_INTERNAL_URL` | env không đặt | Không gọi gì; thao tác bình thường | `logger.warn` một lần lúc khởi động |
| Thao tác lỗi | cập nhật bị 404/422 | Không notify | N/A |
| Route đúng secret | `POST /api/revalidate` + secret + tag hợp lệ | 200, `revalidateTag(tag, {expire:0})` từng tag | N/A |
| Route sai secret | sai/thiếu header | 401, không revalidate gì | Không lộ lý do |
| Route body xấu | không phải JSON, tag lạ, quá 100 tag | 400, không revalidate | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/catalog/{sheets,composers,genres,series}.service.ts` -- các hàm ghi cần gắn notify (`create`, `update`, `setStatus`, `setHot`, `remove`, `attachFile`/`attachFileLocked`, `removeFile`; `create/update/remove` của taxonomy); đã có `Logger`.
- `apps/api/src/modules/catalog/catalog.module.ts`, `src/config/env.ts` (+ `test/unit/env.spec.ts`), `src/prisma/prisma.service.ts` -- đăng ký provider, env mới, truy vấn snapshot.
- `apps/api/test/integration/{catalog-sheets,catalog-taxonomy,public-sheets}.spec.ts`, `create-app.ts` -- mẫu integration (đăng nhập, TRUNCATE); dựng server HTTP giả của web bằng `node:http`.
- `packages/shared/src/cache-tags.ts` (+ spec) -- `cacheTags`; thêm `isCacheTag`.
- `apps/web/src/app/api/*` (mới), `src/lib/api.ts` (mẫu so sánh secret), `src/proxy.ts` (matcher đã loại `api`), `vitest.config.mts`.
- `docker-compose.yml`, `.env.example`, `README.md` -- `WEB_INTERNAL_URL`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/cache-tags.ts` (+spec) -- `isCacheTag` -- hợp đồng
- [x] `apps/api/src/modules/catalog/cache-invalidator.ts` (+ unit test) + `catalog.module.ts` -- `tagsFor`, `tagsForTaxonomy`, `snapshot`, `notify` -- AD-10
- [x] `apps/api/src/config/env.ts` (+spec) -- `WEB_INTERNAL_URL` tuỳ chọn -- cấu hình
- [x] `apps/api/src/modules/catalog/{sheets,composers,genres,series}.service.ts` -- gọi notify sau commit -- điểm gọi
- [x] `apps/api/test/integration/cache-revalidate.spec.ts` -- server giả; phủ điểm gọi, retry, thiếu URL, thao tác lỗi -- AC
- [x] `apps/web/src/app/api/revalidate/route.ts` (+test) -- 401/400/200 -- AD-10
- [x] `docker-compose.yml`, `.env.example`, `README.md` -- `WEB_INTERNAL_URL` và hướng dẫn -- hạ tầng

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build --wait` và có Sheet PUBLISHED trong Level, when admin đổi Level hoặc archive Sheet qua API, then trang `/en/level/{level}` hiển thị thay đổi ngay (không chờ 10 phút) và `docker compose logs api` không có lỗi revalidate.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap) và kiểm tra tay trên Docker (`/api/revalidate`: thiếu/sai secret → 401, đúng → 200, tag lạ/không phải JSON → 400).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Test "publish DRAFT → PUBLISHED" ghi trạng thái qua Prisma, không gọi `PATCH /status`, nên wiring `setStatus` chưa được kiểm | medium | Xác minh: `publish()` ở `cache-revalidate.spec.ts` dùng `prisma.sheet.update`; lời gọi `/status` duy nhất là PUBLISHED → ARCHIVED | patch |
| 2 | `process.env.WEB_INTERNAL_URL` đặt trong `beforeAll` không được khôi phục | low | Rò sang spec khác cùng worker; sửa rẻ | patch |
| 3 | `track`/`trackTaxonomy` không có unit test (op lỗi, snapshot lỗi, `resultId`) | medium | Chỉ có test `tagsFor`/`notify`; bỏ guard "op lỗi thì không notify" vẫn xanh | patch |
| 4 | Đổi `composerId` của Series chỉ phát `list:series:{id}`, trang Composer (Story 2.5) sẽ cũ | low | Đúng spec (taxonomy = `list:{kind}:{id}`); trang Composer chưa tồn tại nên chưa có hậu quả; ghi thành việc phụ thuộc cho Story 2.5 | defer |
| 5 | Đổi tên Composer/Genre/Series không làm mới trang chi tiết Sheet (`sheet:{id}`) | low | Trang chi tiết (Story 2.6) chưa có; Design Notes quy định 2.6 tự gắn `list:composer\|genre\|series:{id}` vào fetch | reject |
| 6 | Snapshot "trước" đọc ngoài khoá/transaction nên có thể lệch khi ghi đồng thời | low | Spec quy định snapshot ngoài transaction; lệch chỉ ở ghi đồng thời cùng Sheet và lưới `revalidate: 600` vẫn chạy | reject |
| 7 | Fire-and-forget không bền (tắt API/deploy mất retry), không có hàng đợi/metric | low | Spec: "lỗi chỉ log, lưới an toàn 600 giây"; README ghi rõ giới hạn | reject |
| 8 | 401/400 vẫn bị thử lại 3 lần; log không phân biệt; redirect có thể chuyển tiếp header secret | low | URL web là cấu hình nội bộ; sai secret là lỗi cấu hình hiển thị trong log; chỉ tốn 3 lần thử | reject |
| 9 | Route `/api/revalidate` mở trên cổng web công khai, không rate limit | low | Bảo vệ bằng secret theo AD-18; chặn ở reverse proxy là hạ tầng (Epic 5); matcher của `proxy.ts` đã loại `api` (xác minh qua curl) | reject |
| 10 | `WEB_INTERNAL_URL` hard-code trong compose trong khi README nói tuỳ chọn | false | Chủ ý như `API_INTERNAL_URL`: `.env.example` đặt `localhost:4100` cho chạy trên host, nội suy vào container sẽ sai | reject |
| 11 | `isCacheTag` chấp nhận `ads`/`settings`, mọi `list:level:*`, id không theo UUID | low | Chỉ người giữ secret mới gọi được; `cacheTags` gồm đủ các tag này theo AD-10 | reject |
| 12 | Snapshot "trước" lỗi bị coi như Sheet không tồn tại nên tag rỗng | low | Snapshot là đọc DB ngay sau khi thao tác đã chạy DB; lỗi hiếm và đã được log | reject |
| 13 | Lỗi sau commit (`tagsFor`, `resultId`) có thể làm admin nhận 500 | false | `tagsFor` thuần; snapshot sau đã bọc `safeSnapshot`; `notify` không ném | reject |
| 14 | Hai lần đọc DB thêm mỗi thao tác ghi, không timeout | low | Spec yêu cầu snapshot trước/sau; chi phí nhỏ với admin | reject |
| 15 | `SIGTERM` làm mất retry đang chờ; timer giữ shutdown | low | Giống #7 | reject |
| 16 | Không đọc/huỷ body response; burst ghi tạo nhiều lời gọi độc lập | low | Quy mô admin một người; chưa có tình huống thực tế | reject |
| 17 | `WEB_INTERNAL_URL` có path/credentials/query không bị từ chối | low | Cấu hình do vận hành đặt; lỗi hiện ngay ở lời gọi đầu | reject |
| 18 | Route không giới hạn kích thước body trước `json()`; `revalidateTag` ném giữa vòng lặp trả 500 | low | Chỉ người giữ secret; `revalidateTag` không ném với tag hợp lệ | reject |
| 19 | Seed dựng `ConfigService` có thể đọc `WEB_INTERNAL_URL` từ `process.env` rồi gọi web | low | Seed ghi PUBLISHED trực tiếp bằng Prisma (không qua service); chỉ taxonomy gọi notify, không chờ, lỗi chỉ log | reject |
| 20 | `logger.warn` thiếu WEB_INTERNAL_URL nằm ở `onModuleInit` nên không chạy ở ngữ cảnh dựng tay (seed) | low | Spec yêu cầu cảnh báo lúc khởi động API; seed không phải API | reject |
| 21 | Web có thêm dependency `zod` trực tiếp, không đồng bộ phiên bản với API | low | Cùng phiên bản `4.6.5` đã pin ở API và shared | reject |

## Design Notes

- **Hook ở service, không ở controller:** mọi đường ghi (kể cả story sau gọi service) đều tự phát tag; snapshot trước/sau cho `tagsFor` thấy cả Level/Composer cũ lẫn mới.
- **Taxonomy phát tag rộng (cả 4 level) thay vì liệt kê Sheet:** tên Composer/Genre hiện trong thẻ và tag cloud của mọi trang Level; story 2.5/2.6 đã có tag `list:composer|genre:{id}` để tự gắn.
- **Dùng chung `INTERNAL_API_SECRET`:** một secret hai chiều giữa web và API, tránh thêm biến; đổi secret ở cả hai phía cùng lúc.
- **Fire-and-forget nhưng có thể test:** `notify` trả `Promise` mà người gọi không `await`; test `await` trực tiếp.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0 (nếu `pdf-processor` timeout do tải, chạy `pnpm exec turbo run test --concurrency=1`)
- `curl -s -o /dev/null -w '%{http_code}' -X POST localhost:4100/api/revalidate -H 'content-type: application/json' -d '{"tags":["search"]}'` -- expected: 401; thêm `-H "X-Internal-Secret: $INTERNAL_API_SECRET"` -- expected: 200

**Manual checks:**
- Trình duyệt: mở `/en/level/beginner`, đổi Level hoặc archive một Sheet bằng API admin, tải lại — thay đổi hiện ngay.
