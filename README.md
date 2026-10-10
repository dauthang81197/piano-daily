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

## CI/CD và deploy (GitHub Actions → Docker Hub → VPS)

`.github/workflows/ci-cd.yml`: mọi PR chạy lint, typecheck, build và toàn bộ test (kể cả integration với Postgres/SeaweedFS). Push vào `develop` còn build 3 image (`<user>/piano-daily-{api,web,admin}:sha-<7 ký tự>` và `:latest`), đẩy lên Docker Hub rồi SSH vào VPS chạy `docker compose -f docker-compose.prod.yml up -d --wait`. API tự chạy `prisma migrate deploy` khi khởi động.

**Kiến trúc trên server** (`docker-compose.prod.yml`): chỉ Caddy mở cổng 80/443/8443/9443; web ở `https://<SITE_HOST>`, admin ở `:8443`, API ở `:9443`. Cùng một hostname nên cookie refresh `Secure; SameSite=Strict` giữa admin và API hoạt động. Chưa có domain thì dùng `<ip-gạch-ngang>.sslip.io` (ví dụ `144-91-120-200.sslip.io`), Caddy tự xin chứng chỉ Let's Encrypt. File lưu ở Cloudflare R2. Chỉ chạy MỘT instance API.

**Thiết lập một lần**
1. Trên server: `ssh root@<server> 'bash -s' < deploy/bootstrap-server.sh` (cài Docker, tạo `/opt/piano-daily/.env` với secret ngẫu nhiên). Điền các biến `S3_*` của R2 vào file đó (mẫu: `deploy/.env.production.example`). Mở cổng 80, 443, 8443, 9443.
2. Tạo cặp khoá SSH riêng cho deploy, thêm khoá công khai vào `~/.ssh/authorized_keys` của user deploy trên server.
3. GitHub → Settings → Secrets and variables → Actions:
   - Secrets: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` (access token Docker Hub quyền Read/Write), `SSH_HOST`, `SSH_USER`, `SSH_PRIVATE_KEY`, `SSH_KNOWN_HOSTS` (kết quả `ssh-keyscan <host>`).
   - Variables: `SITE_HOST` (khớp `SITE_HOST` trong `.env` của server), `MEDIA_BASE_URL` (URL công khai bucket public R2, khớp `S3_PUBLIC_BASE_URL`).
   - Environment `production` (có thể bật required reviewers nếu muốn duyệt trước khi deploy).
4. Đổi `NEXT_PUBLIC_*` (host, URL media) thì phải build lại image: chạy lại workflow.

**Production có domain thật sau Cloudflare** (TLS, CDN, `admin.`/`api.`/`cdn.`): xem [docs/cloudflare.md](docs/cloudflare.md) (`docker-compose.cloudflare.yml`, `deploy/Caddyfile.cloudflare`); chạy song song, không thay deploy sslip.io ở trên.

## Backup và khôi phục

Service `backup` trong `docker-compose.cloudflare.yml` (code ở `deploy/backup/`) chạy `pg_dump --format=custom` mỗi đêm lúc `BACKUP_AT` (mặc định `03:00`, múi giờ `Asia/Ho_Chi_Minh`) và đẩy lên bucket **private** của R2 (`S3_BUCKET_PRIVATE`) với key `backups/piano-daily-<YYYYMMDDTHHMMSSZ>.dump` (UTC). Sau khi upload thành công mới xoá bớt, giữ `BACKUP_KEEP` bản mới nhất (mặc định 14); chỉ đụng khoá `backups/piano-daily-*.dump`. Lỗi bất kỳ thì in `ERROR ...` ra stderr (xem `docker compose logs backup`) và `backup.sh` thoát mã khác 0; vòng lặp vẫn sống và thử lại hôm sau. Cảnh báo/giám sát thuộc Story 5.3.

**Chạy tay một lần** (trên server, trong thư mục `/opt/piano-daily`):

```bash
docker compose -f docker-compose.cloudflare.yml --env-file .env run --rm --no-deps backup backup-loop.sh --once
echo $?   # 0 = thành công
```

**Kiểm tra bản backup:** xem `docker compose logs backup` (dòng `INFO đã upload backups/piano-daily-....dump (N byte)`), hoặc liệt kê bucket private trong dashboard R2. Tải một bản về để thử khôi phục (dùng `aws s3 cp s3://<bucket-private>/backups/<tên>.dump ./restore-test.dump --endpoint-url $S3_ENDPOINT`).

**Khôi phục vào DB trống ở local (không bao giờ trỏ vào DB production):**

```bash
# 1. DB trống
docker run -d --name pd-restore -e POSTGRES_PASSWORD=piano -e POSTGRES_DB=piano_restore -p 55434:5432 postgres:18.6
# 2. Khôi phục (file cục bộ, hoặc key S3 nếu đã export S3_* và S3_BUCKET_PRIVATE); cần pg_restore 18 và aws CLI trên máy
bash deploy/backup/restore.sh ./restore-test.dump postgresql://postgres:piano@localhost:55434/piano_restore
# 3. Chạy app trỏ vào DB đó
DATABASE_URL=postgresql://postgres:piano@localhost:55434/piano_restore pnpm --filter @piano-daily/api start
# 4. Dọn dẹp
docker rm -f pd-restore
```

Kiểm tra: đăng nhập admin, đơn hàng và nội dung hiện đúng như trên production.

**Checklist đã thử khôi phục** (điền sau khi làm thật trên máy có Docker):
- [ ] Chạy `backup-loop.sh --once` với R2 thật hoặc MinIO, bản `.dump` xuất hiện trong bucket private. Ngày thử: ____
- [ ] Khôi phục bản đó vào DB trống ở local, không có lỗi `pg_restore`. Ngày thử: ____
- [ ] Chạy app trỏ vào DB đã khôi phục, đơn hàng/nội dung đúng. Ngày thử: ____
- [ ] Xoay vòng: vượt `BACKUP_KEEP` thì bản cũ nhất bị xoá. Ngày thử: ____

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
- **Tải ngay Sheet miễn phí (Story 3.2, AD-6/AD-8/AD-20):** module `commerce` (chủ bảng `download_logs`) có `GET /files/:sheetId/:fileType/download` (`@Public()`, `fileType` ∈ `pdf|midi|mp3`, throttle 20/phút theo `getClientIp()`, `Cache-Control: no-store`). Chỉ Sheet `PUBLISHED` + `is_free` + có file hiện hành mới tải được; mọi trường hợp khác là 404 giống hệt nhau. Mỗi lượt tải ghi một `DownloadLog` (`token_id` null, `ip_hash = sha256(ip + VIEW_SALT)`, không IP thô) TRƯỚC khi trả 302 tới signed URL vùng private TTL 5 phút kèm `Content-Disposition: attachment; filename="{slug}.{pdf|mid|mp3}"`. Chi tiết công khai có thêm `isFree` và `downloadTypes`; trang chi tiết Sheet free hiện nhóm nút brass (liên kết tải trực tiếp, không modal), call-out MIDI/MP3 và nút PDF ở sidebar; định dạng không có thì ẩn, Sheet không free và route preview Draft không có nút.
- **Tạo đơn hàng PayPal (Story 3.3, AD-17/AD-20):** `POST /payments/paypal/create-order` (`@Public()`, throttle 10/phút theo `getClientIp()`, `Cache-Control: no-store`). Body `{ sheetId, fileTypes[] | bundle: true, email, expectedTotalCents }` (đúng một trong `fileTypes`/`bundle`). Thứ tự kiểm tra: `payments_enabled` (bảng `site_settings`, module `settings`) -> email -> Sheet PUBLISHED không free và type mua được (404/400) -> giá tính lại từ `PricingService.quote()`; `expectedTotalCents` lệch thì 409 `PRICE_CHANGED` kèm báo giá mới. Tắt thanh toán: 403 `PAYMENTS_DISABLED`. Thành công: Order `PENDING` (bảng `orders`, `items` là snapshot từng type kèm giá, bundle chia đều giá cho từng type, dư cents dồn vào type đầu; `order_code` dạng `PD-XXXXXX`) và đơn PayPal USD, trả `{ orderCode, paypalOrderId }`. PayPal lỗi: Order sang `FAILED` qua `OrderService` và trả 503. Chỉ `OrderService` đổi `Order.status` theo máy trạng thái ở `packages/shared`. SDK `@paypal/paypal-server-sdk` chỉ được import trong `paypal.provider.ts` (sau port `PaymentProvider`; 3.3 mới cài `createOrder`). Biến môi trường: `PAYPAL_MODE` (`sandbox` mặc định | `live`), `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` (tuỳ chọn; thiếu thì tạo đơn trả 503). Sheet từng có Order bị xoá thì chuyển `ARCHIVED` (FK `orders.sheet_id` RESTRICT). Migration seed `site_settings`: `payments_enabled`, `token_default_days=7`, `token_default_max_downloads=5`. Token, webhook, email và modal thuộc Story 3.4+ (capture: xem bên dưới).
- **Capture thanh toán và cấp DownloadToken (Story 3.4, AD-17/AD-20):** `POST /payments/paypal/capture-order { paypalOrderId }` (`@Public()`, throttle 10/phút theo `getClientIp()`, `Cache-Control: no-store`, trả 200 `{ orderCode, token, files: [{ fileType, name }] }`, không có `storage_key`). `OrderService.captureOrder()` tìm Order theo `paypal_order_id` (lạ thì 404, không gọi PayPal), gọi `PaymentProvider.capture` rồi `fulfil()`. `fulfil()` chỉ chuyển PAID khi capture `COMPLETED` và `formatUsd(amount_cents)`/currency khớp PayPal: một `prisma.$transaction` chạy `UPDATE ... WHERE status IN (PENDING, CANCELLED, FAILED)` (set `paid_at`, `paypal_capture_id`, `payer_email`, `payer_name`) và tạo đúng một `download_tokens` (`order_id` UNIQUE) cùng `download_token_files` (file hiện hành của các type đã mua). Hạn/lượt lấy từ `site_settings` (`token_default_days`, `token_default_max_downloads`) lúc cấp; token là 32 byte ngẫu nhiên mật mã học (base64url). Gọi lại hoặc đồng thời: UPDATE 0 dòng thì đọc lại và trả token đã có. Lệch amount/currency: Order giữ nguyên, `review_required=true`, log error và trả 503 chung. Từ CANCELLED/FAILED sang PAID log `LATE_CAPTURE`. PayPal từ chối (422 `INSTRUMENT_DECLINED`, capture DECLINED/FAILED): Order `FAILED` qua `OrderService`, 402 `PAYMENT_DECLINED`. `ORDER_ALREADY_CAPTURED`: `getOrder` rồi `fulfil()`. `SheetFileGcService.hasLiveDownloadTokenReference()` giữ file mà token chưa hết hạn, chưa revoked và còn lượt tham chiếu; token chết thì GC gỡ `download_token_files` rồi xoá file. Trang tải, tải qua token, email và webhook thuộc Story 3.5, 3.7, 3.8.
- **Tải file đã mua và trang tải (Story 3.5, AD-8/AD-20):** `GET /downloads/:token/:fileType` (`pdf|midi|mp3`; `@Public()`, throttle 20/60s theo `getClientIp()`, `no-store`, `X-Robots-Tag: noindex, nofollow`) trừ một lượt bằng đúng một `UPDATE download_tokens ... FROM orders ... RETURNING` (điều kiện hiệu lực nằm trong WHERE: Order `PAID`, `revoked_at` null, chưa hết hạn, `used < max`, `:fileType` thuộc `download_token_files`) cùng `DownloadLog` (có `token_id`) trong một `prisma.$transaction`, rồi 302 tới signed URL private 5 phút của file đã chụp (kể cả file superseded và Sheet ARCHIVED) với `Content-Disposition: attachment; filename="{slug}.{ext}"`. Từ chối: 404 `NOT_FOUND` (token lạ hoặc type ngoài đơn), 410 `TOKEN_REVOKED` (Order không PAID hoặc `revoked_at`), `TOKEN_EXPIRED`, `TOKEN_EXHAUSTED`; không URL, không log, không trừ lượt. `GET /downloads/:token` luôn 200 nếu token tồn tại: `{ sheetTitle, files, remainingDownloads, expiresAt, status: ACTIVE|EXPIRED|EXHAUSTED|REVOKED }` (không có `storage_key`/email). Trang web `/[locale]/downloads/[token]` (`force-dynamic`, `noindex`, header `no-store` + `Referrer-Policy: no-referrer`, `robots.txt` chặn `/{locale}/downloads/`) hiện nút brass cho từng file (liên kết thường, không prefetch vì mỗi lần bấm trừ một lượt) và dòng hiệu lực; token hết hiệu lực hiện "Link tải đã hết hiệu lực" kèm cách liên hệ. Biến `NEXT_PUBLIC_CONTACT_EMAIL` (tuỳ chọn, inline lúc build; Actions variable `CONTACT_EMAIL`) cho mailto liên hệ; để trống thì trang chỉ nhắc liên hệ qua email đã dùng khi mua.
- **Modal thanh toán trên trang chi tiết (Story 3.6):** `quoteSchema` thêm `paymentsEnabled` (`default(true)` cho phản hồi cũ); `GET /sheets/:id/quote` (vẫn `no-store`) ghi đè bằng `SettingsService.paymentsEnabled()` (`catalog` import `SettingsModule`, settings không phụ thuộc ngược), `create-order` vẫn chặn `PAYMENTS_DISABLED` làm lớp cuối. Web: `lib/public-api.ts` (`ApiError`, `fetchQuote`, `createPaypalOrder`, `capturePaypalOrder`; `credentials:'omit'`, `no-store`). Sheet không free (không phải route preview) hiện nút Download brass theo `downloadTypes` giao với `items` của báo giá (type không có giá ẩn hẳn) qua `PurchaseProvider`/`PurchaseButtons`; `paymentsEnabled=false` thì nút `aria-disabled` kèm chú thích và không mở modal. `PaymentModal` (fade, toàn màn hình `< md`, focus vào modal và trả về nút gọi khi đóng, Esc/X/overlay chỉ đóng khi không xử lý và popup PayPal không mở) lấy lại báo giá khi mở, mặc định chỉ chọn file của nút vừa bấm, Bundle chỉ khi người dùng chọn, email hợp lệ mới bật nút PayPal chính thức (`@paypal/react-paypal-js`, USD, `intent: capture`); `createOrder` gửi `expectedTotalCents`, `onApprove` capture rồi chuyển tới `/[locale]/downloads/[token]`. Lỗi hiện trong `FormError` (`PRICE_CHANGED` cập nhật giá mới từ `details`, `PAYMENT_DECLINED`, mạng, popup bị đóng) và giữ nguyên lựa chọn/email. Biến `NEXT_PUBLIC_PAYPAL_CLIENT_ID` (inline lúc build; Actions variable) truyền qua Dockerfile/compose/CI/`.env.example`; CSP `img-src` cho phép ảnh PayPal. Không có client secret ở web; email tới người mua thuộc Story 3.7.
- **Email link tải và mua lại cùng email (Story 3.7, AD-1/AD-20):** module `notify` (`EmailPort` + `ResendEmailAdapter` gọi REST `https://api.resend.com/emails` bằng `fetch`, không SDK) là cổng email duy nhất. Thiếu `RESEND_API_KEY` hoặc `EMAIL_FROM` thì adapter chỉ log cảnh báo và bỏ qua (thanh toán không ảnh hưởng); `SITE_URL` (tuỳ chọn, mặc định `CORS_WEB_ORIGIN`) dựng link `{SITE_URL}/{locale}/downloads/{token}`. `orders.locale` (`vi`|`en`, mặc định `vi`) lấy từ `locale` tuỳ chọn của `create-order` (modal gửi locale hiện tại). Chỉ lần `fulfil()` thắng mới gửi email (sau commit, không chặn response); gửi thành công mới set `email_sent_at` (UPDATE `WHERE email_sent_at IS NULL`); lỗi Resend chỉ log tên lỗi + mã đơn. `create-order` (sau khi qua `payments_enabled`, email, quote và `expectedTotalCents`) tìm đơn PAID cùng email + Sheet có token ACTIVE bao phủ mọi type yêu cầu: có thì không tạo Order, gửi lại email và trả 409 `ALREADY_PURCHASED` (không có token); tối đa 3 lần gửi lại mỗi giờ cho mỗi email (khoá SHA-256, bộ nhớ trong tiến trình, vượt thì 429 `TOO_MANY_REQUESTS`). Token hết hạn/hết lượt/thu hồi hoặc thiếu type thì tạo đơn mới như thường. Modal hiện `ALREADY_PURCHASED` dạng trạng thái (`role="status"`), không điều hướng, không mở PayPal. Gửi thật cần domain đã xác minh trên Resend.
- **Yêu cầu extension `unaccent`:** migration `catalog_search` chạy `CREATE EXTENSION IF NOT EXISTS unaccent` (contrib của Postgres, có sẵn trong image `postgres` chính thức dùng ở `docker-compose.yml`); tài khoản chạy migration cần quyền tạo extension. Cột `search_vector` là cột generated nên Prisma Client không ghi được; SQL thô chỉ nằm ở `sheet-search.repository.ts`.
- **Cache tag (AD-10):** chuỗi tag sinh bởi `cacheTags` trong `packages/shared/src/cache-tags.ts` (`sheet:{id}`, `list:level:{level chữ thường}`, `list:composer:{id}`, `list:genre:{id}`, `list:series:{id}`, `search`, `sitemap`, `ads`, `settings`). Web gọi dữ liệu công khai qua `publicFetch` (`force-cache`, `revalidate: 600`, kèm tag); không dùng `no-store`.
