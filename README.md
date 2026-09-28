# Piano Daily

Thư viện sheet piano tuyển chọn. Monorepo pnpm + Turborepo:

| Workspace | Mô tả | Cổng |
| --- | --- | --- |
| `apps/web` | Next.js 16 (App Router) — trang công khai | 3000 |
| `apps/admin` | Next.js 16 + shadcn/ui — khu quản trị | 3001 |
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

> Nếu Corepack báo lỗi thiếu `bin/pnpm.cjs`, cache của nó bị hỏng: xoá
> `~/.cache/node/corepack/v1/pnpm/12.6.0` rồi chạy lại `corepack enable`.

### Chạy toàn bộ bằng Docker (một lệnh)

```bash
docker compose up -d --build
docker compose ps             # postgres/seaweedfs/api healthy; web/admin running
curl localhost:4000/health    # {"status":"ok","db":"up"}
```

- Web: <http://localhost:3000> · Admin: <http://localhost:3001> · API: <http://localhost:4000>
- Các app chạy bản build production (ổn định). API chạy `prisma migrate deploy` trước khi listen.
- Dừng: `docker compose down` (thêm `-v` để xoá dữ liệu Postgres/SeaweedFS).

### Chế độ dev nhanh (hot reload)

Chỉ bật hạ tầng trong Docker, các app chạy trên máy:

```bash
docker compose up -d postgres seaweedfs
pnpm --filter @piano-daily/api exec prisma migrate deploy   # khi có migration mới
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

`pnpm test` của `apps/api` gồm integration test với Postgres **thật**. Bật container test trước:

```bash
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
- **Client mỏng:** web và admin chỉ gọi API qua HTTP; ESLint chặn import Prisma/S3/pg trong hai app này.
