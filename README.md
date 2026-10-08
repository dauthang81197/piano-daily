# Piano Daily

Thư viện sheet piano tuyển chọn. Monorepo pnpm + Turborepo:

| Workspace | Mô tả | Cổng |
| --- | --- | --- |
| `apps/web` | Next.js 16 (App Router) — trang công khai | 4100 |
| `apps/admin` | Next.js 16 + shadcn/ui — khu quản trị | 4101 |
| `apps/api` | NestJS 12 (CommonJS) + Prisma 7 — nơi duy nhất chạm DB và S3 | 4000 |
| `packages/shared` | Hợp đồng API: zod schema, enum, danh mục mã lỗi | — |
| `packages/tokens` | Design token "Ivory & Walnut" (Tailwind v4 `@theme`) | — |

Hạ tầng local (`docker-compose.yml`): PostgreSQL 18.6, SeaweedFS 4.47 (S3 local, cổng 8333).

## Yêu cầu

- Node **24.21** (xem `.nvmrc`), pnpm **12.6** qua Corepack
- Docker + Docker Compose v2

## Bắt đầu

```bash
nvm install && nvm use        # Node 24.21 theo .nvmrc
corepack enable               # dùng đúng pnpm@12.6.0 khai báo trong package.json
pnpm install
cp .env.example .env          # chỉnh nếu cần; mọi biến đều được liệt kê ở đây
```

Trong `.env`, đặt `JWT_ACCESS_SECRET` (bắt buộc, ≥ 32 ký tự), `CORS_ADMIN_ORIGIN` (bắt buộc, origin của admin —
mặc định `http://localhost:4101`), thông tin SUPER_ADMIN (`ADMIN_EMAIL`, `ADMIN_PASSWORD` ≥ 12 ký tự, `ADMIN_NAME`)
`CORS_WEB_ORIGIN` (origin của web, mặc định `http://localhost:4100`; CORS không kèm credentials),
`INTERNAL_API_SECRET` (bắt buộc, ≥ 32 ký tự, không bắt đầu `change-me`; web SSR gửi qua `X-Internal-Secret` để API bỏ qua
throttle — web và API dùng chung giá trị, không bao giờ đặt tiền tố `NEXT_PUBLIC_`),
`VIEW_SALT` (bắt buộc, ≥ 32 ký tự, không bắt đầu `change-me`; muối băm `visitor_hash` của bộ đếm lượt xem, chỉ API đọc)
và các biến `S3_*` (bắt buộc khi chạy API trên host; giá trị trong `.env.example` khớp SeaweedFS local).

> Nếu Corepack báo lỗi thiếu `bin/pnpm.cjs`, cache của nó bị hỏng: xoá
> `~/.cache/node/corepack/v1/pnpm/12.6.0` rồi chạy lại `corepack enable`.

### Chạy toàn bộ bằng Docker (một lệnh)

```bash
docker compose up -d --build
docker compose ps             # postgres/seaweedfs/api healthy; web/admin running
curl localhost:4000/health    # {"status":"ok","db":"up"}
pnpm db:seed   # SUPER_ADMIN + 10 Sheet mẫu (chạy trên host, trỏ tới Postgres cổng 5432; cần S3 chạy và `pdftoppm`)
```

- Web: <http://localhost:4100> · Admin: <http://localhost:4101> · API: <http://localhost:4000>
- Admin: mở <http://localhost:4101> -> chuyển về `/login`, đăng nhập bằng `ADMIN_EMAIL` / `ADMIN_PASSWORD` đã seed.
  `NEXT_PUBLIC_API_URL` được inline lúc build (compose truyền qua `build.args`); đổi giá trị thì build lại admin.
- Web song ngữ theo URL `/vi` và `/en`: truy cập path không có tiền tố sẽ được chuyển theo cookie `NEXT_LOCALE`, rồi header
  `cf-ipcountry` (VN -> `vi`), còn lại `en`. `NEXT_PUBLIC_API_URL` và `NEXT_PUBLIC_MEDIA_BASE_URL` được inline lúc build
  (vào bundle và CSP) — compose truyền qua `build.args`; đổi giá trị thì build lại web. Web SSR gọi API qua `API_INTERNAL_URL`.
- Làm mới cache: khi admin tạo/sửa/publish/archive/xoá Sheet hoặc đổi Composer/Genre/Series, API gọi
  `POST {WEB_INTERNAL_URL}/api/revalidate` (header `X-Internal-Secret` = `INTERNAL_API_SECRET`, tối đa 3 lần thử, lỗi chỉ log)
  để web `revalidateTag` các tag liên quan. `WEB_INTERNAL_URL` (compose đặt `http://web:4100`) là tuỳ chọn: bỏ trống thì tắt
  revalidate chủ động và web tự làm mới sau tối đa 10 phút. Đổi `INTERNAL_API_SECRET` ở cả web và API cùng lúc.
- Các app chạy bản build production (ổn định). API chạy `prisma migrate deploy` trước khi listen.
- Dừng: `docker compose down` (thêm `-v` để xoá dữ liệu Postgres/SeaweedFS).

### Object storage (SeaweedFS local)

- SeaweedFS đọc identity S3 từ `infra/seaweedfs/s3.json` (mount vào container): access key `piano` / secret
  `piano-secret` (khớp `.env.example`), và identity `anonymous` chỉ được **đọc** bucket public
  (`piano-daily-public`, `piano-daily-test-public`). Bucket private không đọc ẩn danh được.
- Đổi `S3_BUCKET_PUBLIC` sang tên khác thì phải sửa quyền `Read:<bucket>` của identity `anonymous` trong
  `infra/seaweedfs/s3.json` cho khớp — nếu không ảnh public trả 403.
- Đổi `s3.json` thì tạo lại container: `docker compose up -d --force-recreate seaweedfs`.
- `S3_AUTO_CREATE_BUCKETS=true` (local/compose) để API tạo bucket còn thiếu lúc khởi động. Production (R2) để `false`.
- Ảnh public đọc thẳng từ trình duyệt qua `S3_PUBLIC_BASE_URL` (local: `http://localhost:8333/piano-daily-public/...`).
- Upload PDF (`POST /admin/sheets/:id/files`, multipart `type=PDF` + `file`) chạy `pdftoppm` (poppler-utils):
  image API đã cài sẵn; chạy API/test trên host cần cài poppler (`brew install poppler` / `apt install poppler-utils`).

### Chế độ dev nhanh (hot reload)

`pnpm db:seed` tạo SUPER_ADMIN từ `.env`, 4 Composer, 4 Genre, 3 Series và 10 Sheet mẫu (8 PUBLISHED trong đó 2 HOT, 2 DRAFT;
PDF/MIDI/MP3 sinh bằng code và đi qua đúng pipeline upload). Điều kiện: DB đã migrate, S3 (SeaweedFS) đang chạy, biến `S3_*` trong `.env`
và có `pdftoppm` (poppler: `brew install poppler` / `apt-get install poppler-utils`). Chạy lại an toàn: không tạo trùng, chỉ đính file còn thiếu.

Chỉ bật hạ tầng trong Docker, các app chạy trên máy:

```bash
docker compose up -d postgres seaweedfs
pnpm --filter @piano-daily/api exec prisma migrate deploy   # khi có migration mới
pnpm db:seed                                                # SUPER_ADMIN + dữ liệu mẫu (idempotent)
pnpm dev
```

Không bind-mount `node_modules` vào container (binary native của prisma/sharp khác nhau giữa macOS và Linux).

## Kiểm tra chất lượng

```bash
pnpm build        # build mọi workspace (qua turbo; tự chạy prisma generate)
pnpm typecheck
pnpm lint
pnpm test         # unit + integration
```

`pnpm test` của `apps/api` gồm integration test với Postgres và SeaweedFS **thật**, và unit test gọi `pdftoppm`
(cần poppler trên host). Bật container trước:

```bash
docker compose up -d --wait seaweedfs                      # S3 local, cổng 8333 (test dùng bucket piano-daily-test-*)
docker compose --profile test up -d --wait postgres-test   # tmpfs, cổng 5433
pnpm test
```

Test tự migrate DB theo `TEST_DATABASE_URL` (mặc định `postgresql://piano:piano@localhost:5433/piano_daily_test`).
Nếu cổng 5433 trên máy đã bận, đổi cả hai:

```bash
POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test
TEST_DATABASE_URL=postgresql://piano:piano@localhost:55433/piano_daily_test pnpm test
```

## Quy ước chính

- **Config:** API chỉ đọc env qua `ConfigModule` (validate bằng zod, `apps/api/src/config/env.ts`). Thiếu/sai biến thì process thoát mã 1 và log nêu tên biến.
- **Lỗi:** luôn `{"error":{"code","message","details?"}}`; `code` lấy từ `packages/shared/src/errors.ts`.
- **Log:** pino JSON (`nestjs-pino`), mỗi request có `requestId` (nhận `X-Request-Id` hợp lệ hoặc tự sinh). Không log secret, cookie, header authorization hay IP thô.
- **Prisma:** generator `prisma-client`, output `apps/api/src/generated` (không commit), `moduleFormat = "cjs"`, `@prisma/adapter-pg`; `apps/api/prisma.config.ts` tự nạp `.env`.
- **Phiên bản pin chính xác:** `typescript` 6.0.3; `prisma`, `@prisma/client`, `@prisma/adapter-pg` 7.10.0 (có `overrides` trong `pnpm-workspace.yaml`).
- **Xác thực (deny-by-default):** guard JWT toàn cục; route không cần đăng nhập phải gắn `@Public()` và nằm trong allowlist của `apps/api/test/integration/public-routes.spec.ts`. Endpoint `/auth/{login,refresh,logout,me,change-password}`: access token 15 phút trong body, refresh token xoay vòng trong cookie `HttpOnly; Secure; SameSite=Strict; Path=/auth`. IP khách chỉ lấy qua `getClientIp()`.
- **Client mỏng:** web và admin chỉ gọi API qua HTTP; ESLint chặn import Prisma/S3/pg trong hai app này.
- **Phiên admin (client):** access token chỉ nằm trong bộ nhớ JS; tải lại trang thì khôi phục bằng `/auth/refresh`
  (cookie httpOnly). Gặp 401 thì refresh một lần rồi gửi lại (`apiFetch` trong `apps/admin/src/lib/api/client.ts`).
  Các tab tuần tự hoá refresh bằng Web Locks (`pd-auth-refresh`); đăng xuất phát tới mọi tab qua `BroadcastChannel('pd-auth')`.
  Mọi trang admin là client component nằm sau `AuthGate` (nhóm route `(admin)`); không dùng middleware Next.
- **CORS:** allowlist tường minh — chỉ `CORS_ADMIN_ORIGIN`, kèm `credentials`; origin khác không nhận header `Access-Control-Allow-*`. Mọi response có `Vary: Origin`.
- **Ràng buộc triển khai (cookie refresh `Secure; SameSite=Strict`):** admin và API phải cùng *site* — cùng tên miền
  đăng ký, vd. `admin.<domain>` và `api.<domain>` — và chạy HTTPS ở mọi nơi ngoài `localhost`. Khác site thì trình duyệt
  không gửi cookie refresh (đăng nhập được nhưng tải lại trang là mất phiên); chạy HTTP thì cookie `Secure` không được lưu.
- **Endpoint công khai (Story 2.2, `@Public()`):** `GET /sheets?level=&genre=&sort=newest|most_viewed&page=&pageSize=` (`level` bắt buộc, `genre` là slug, mặc định 12/trang, tối đa 48) và `GET /levels/:level/summary` (`level` là enum viết hoa, vd. `BEGINNER`). Chỉ trả Sheet `PUBLISHED`, không lộ `storageKey` hay URL private.
- **Tìm kiếm và bộ lọc (Story 2.4, `@Public()`):** `GET /sheets` mở rộng: `level` nay tuỳ chọn; thêm `q` (tối đa 100 ký tự; khớp tiêu đề, lyrics, tên Composer, không phân biệt dấu, khớp tiền tố, nhiều từ là AND; `q` toàn số 1–9 chữ số khớp thêm `public_id`), `composer` (slug), `format=sheet|chords|midi|mp3|video` và `sort=relevance|newest|most_viewed` (mặc định `relevance` khi có `q`, ngược lại `newest`). Mọi bộ lọc kết hợp AND và luôn chỉ gồm Sheet `PUBLISHED`. `GET /sheets/facets` trả `{genres, composers}` kèm `count` (chỉ Sheet `PUBLISHED`). Trang web: `/{vi|en}/search`.
- **Trang Composer và Genre (Story 2.5, `@Public()`):** `GET /composers/:slug` trả `{id, slug, name, bio, avatarUrl}` (`avatarUrl` chỉ có khi ảnh nằm ở vùng public, ngược lại `null`); `GET /genres/:slug` trả `{id, slug, name, icon}`; slug không tồn tại trả 404. Thẻ Sheet trong `GET /sheets` có thêm `composer.slug`. Danh sách bài của từng trang lấy từ `GET /sheets?composer=` / `?genre=`. Trang web: `/{vi|en}/composer/{slug}` và `/{vi|en}/genre/{slug}` (sắp xếp `newest|most_viewed`, phân trang theo số trang).
- **Chi tiết Sheet (Story 2.6, `@Public()`):** `GET /sheets/:slug` (đăng ký sau `/sheets/facets`) trả thông tin đầy đủ của Sheet `PUBLISHED`: meta, điểm và ghi chú độ khó, Genre, `pages` (URL public ảnh từng trang), `midi` (`noteJsonUrl` public, thời lượng, số nốt), `youtubeUrl`, `lyricsChords`, `seriesSheets` (cùng Series, tối đa 12) và `related` (chung Series/Composer/Level, tối đa 6). Sheet Draft, Archived hoặc slug lạ đều trả 404 giống nhau. Không có key hay URL private. Trang web: `/{vi|en}/sheet/{slug}`; lyrics render Markdown (không HTML thô), video nhúng YouTube nocookie lazy-load; nút Download chưa hiển thị (Epic 3).
- **Đếm lượt xem (Story 2.7, `@Public()`):** trang chi tiết gửi beacon `POST /sheets/:id/view` từ trình duyệt (không qua SSR). API chèn `sheet_view_dedupe(sheet_id, visitor_hash, hour_bucket)` (UNIQUE) và chỉ khi chèn thành công mới `view_count + 1`, trong một câu lệnh SQL nguyên tử; `visitor_hash = sha256(ip + ua + VIEW_SALT)`, không lưu IP/UA thô. Một người xem lặp lại trong cùng giờ UTC chỉ được tính một lần. Luôn trả `204` với mọi UUID hợp lệ (Sheet lạ, Draft, Archived cho phản hồi giống hệt và không được đếm); `:id` sai dạng trả 400. Throttle 30 request/60 giây theo IP (429 + `Retry-After`). Job mỗi giờ xoá dòng dedupe cũ hơn 24 giờ. Đếm không đổi `updated_at` của Sheet và không revalidate cache web (số hiển thị theo chu kỳ 10 phút).
- **MIDI player (Story 2.8):** trang chi tiết Sheet có MIDI hiện khối "Play & Practice this piece" với Play/Pause, thanh tua, tốc độ 0.5x–2x và phím đàn ảo (nốt đang phát tô brass kèm tên nốt, nốt sắp tới rơi xuống phím). Player **chỉ** đọc note-JSON công khai (`midi.noteJsonUrl`, sinh server-side lúc upload MIDI), không bao giờ file `.mid` gốc; âm thanh là bộ tổng hợp Tone.js (bản mô phỏng, không tải mẫu piano). Vào trang không tải gì: Tone.js (`import('tone')`) và note-JSON chỉ tải khi bấm phát lần đầu, nên không bao giờ tự phát. **Bucket public phải cho CORS `GET` từ origin web** (SeaweedFS local đã bật; với Cloudflare R2 production hãy thêm CORS policy cho origin web trên bucket public) và CSP `connect-src` của web đã có origin `NEXT_PUBLIC_MEDIA_BASE_URL`.
- **Nghe nhanh trên thẻ (Story 2.9):** mỗi thẻ Sheet trong API công khai có thêm `noteJsonUrl` (URL public của note-JSON hiện hành, hoặc `null` khi không có MIDI/note-JSON) — áp cho `GET /sheets`, tìm kiếm, `seriesSheets` và `related`. Thẻ có `noteJsonUrl` hiện nút play trên thumbnail: bấm phát khoảng 12 giây đầu (tính từ nốt đầu tiên) rồi tự dừng, không điều hướng sang trang chi tiết; tại mỗi thời điểm chỉ một preview phát (bấm thẻ khác thì thẻ trước dừng). Thiết bị có hover: nút hiện khi hover/focus; cảm ứng: luôn hiện. Không tải gì trước lần bấm đầu tiên; mỗi preview mở một AudioContext riêng và đóng khi dừng. Cần cùng điều kiện CORS của bucket public như player (xem mục MIDI player). Tại mỗi thời điểm chỉ một nguồn âm thanh trên trang: bấm nghe thử trên thẻ thì player chính tạm dừng và ngược lại.
- **Xem trước Sheet Draft (Story 2.10, AD-19):** ở trang sửa Sheet, nút "Xem như người dùng" gọi `POST /admin/preview-tokens` (cần access token admin) để lấy preview token (JWT HS256, hạn 10 phút, gắn `sheetId`, audience `piano-daily:preview`, không có `sub`/`role` nên không dùng được làm access token và ngược lại), rồi mở tab mới tới `{NEXT_PUBLIC_SITE_URL}/vi/preview/sheet/{id}?token=…`. Route web này gọi `GET /sheets/:id/preview` (công khai nhưng đòi header `X-Preview-Token`; mọi lỗi token hay Sheet không tồn tại đều 404 giống nhau) và render cùng layout trang chi tiết, kể cả MIDI player, cho Sheet ở **mọi trạng thái**; `related`/`seriesSheets` vẫn chỉ gồm Sheet đã publish. Trang preview không cache (`no-store`), `noindex, nofollow`, `Referrer-Policy: no-referrer` (token nằm trong URL) và không gửi beacon đếm lượt xem. Preview luôn hiển thị bản **đã lưu**. Admin cần `NEXT_PUBLIC_SITE_URL` (inline lúc build, mặc định `http://localhost:4100`; compose truyền qua `build.args` của admin): đặt đúng URL công khai của web khi triển khai rồi build lại admin.
- **SEO (Story 2.11):** mọi trang công khai (trang chủ, Level, Search, Composer, Genre, chi tiết Sheet) có `<title>`, meta description theo locale, canonical + `hreflang` (vi, en, x-default), Open Graph và Twitter card, dựng bằng một hàm `pageMetadata` (`apps/web/src/lib/seo.ts`); Search có bộ lọc giữ `noindex, follow`, route preview giữ `noindex, nofollow`. Trang chi tiết Sheet có JSON-LD `MusicComposition` và `BreadcrumbList` (serialize an toàn, bỏ trường rỗng, không có dữ liệu bịa). `GET /sitemap-entries` (`@Public`, throttle 30/phút) trả slug + `updatedAt` của Sheet `PUBLISHED` cùng Composer/Genre có ít nhất một bài `PUBLISHED`; web dựng `/sitemap.xml` cho cả hai locale kèm `hreflang` (fetch gắn tag `sitemap`, nên publish/sửa nội dung làm mới sau khi tag được revalidate theo Story 2.3; không prerender lúc build) và `/robots.txt` (chặn `/api/` và `/{vi,en}/preview/`, trỏ tới sitemap). Sheet/Composer/Genre không tồn tại trả HTTP 404 thật nhờ kiểm ở `layout.tsx` (giống `LevelLayout`). **Giới hạn:** một file sitemap tối đa 50.000 URL (mỗi Sheet tính 2 URL cho hai locale, khoảng 25.000 Sheet); khi vượt cần chia nhỏ sitemap. Cần đặt `NEXT_PUBLIC_SITE_URL` đúng domain công khai (inline lúc build) để canonical, Open Graph, sitemap và robots dùng URL tuyệt đối đúng.
- **Giá Sheet và báo giá (Story 3.1, AD-3/AD-17):** `Sheet` có `is_free` và `price_{pdf,midi,mp3,bundle}_cents` (Int, cents USD, CHECK 0–100000; `null`/0 = không bán). Form admin nhập USD ("4.99") và đổi sang cents bằng xử lý chuỗi (`parseUsdToCents`/`formatUsd` trong `packages/shared/src/pricing.ts`, không float). `PricingService.quote()` (module `catalog`) là nguồn báo giá duy nhất: type mua được = có file hiện hành và giá > 0; Bundle chỉ khi có ít nhất 2 type mua được, giá Bundle > 0 và gồm mọi type mua được; Sheet `is_free` trả `free: true` (giá riêng vẫn được giữ nhưng bị bỏ qua). `GET /sheets/:id/quote` (`@Public()`, `Cache-Control: no-store`, throttle 60/phút) chỉ trả cho Sheet `PUBLISHED` (khác thì 404). Publish Sheet không free cần ít nhất một type mua được (422, `details.path = 'price'`); PATCH làm Sheet đang PUBLISHED mất hết khả năng bán thì bị từ chối (400). Gỡ file cuối cùng của Sheet đã publish chưa bị chặn (xem `deferred-work.md`).
- **Yêu cầu extension `unaccent`:** migration `catalog_search` chạy `CREATE EXTENSION IF NOT EXISTS unaccent` (contrib của Postgres, có sẵn trong image `postgres` chính thức dùng ở `docker-compose.yml`); tài khoản chạy migration cần quyền tạo extension. Cột `search_vector` là cột generated nên Prisma Client không ghi được; SQL thô chỉ nằm ở `sheet-search.repository.ts`.
- **Cache tag (AD-10):** chuỗi tag sinh bởi `cacheTags` trong `packages/shared/src/cache-tags.ts` (`sheet:{id}`, `list:level:{level chữ thường}`, `list:composer:{id}`, `list:genre:{id}`, `list:series:{id}`, `search`, `sitemap`, `ads`, `settings`). Web gọi dữ liệu công khai qua `publicFetch` (`force-cache`, `revalidate: 600`, kèm tag); không dùng `no-store`.
