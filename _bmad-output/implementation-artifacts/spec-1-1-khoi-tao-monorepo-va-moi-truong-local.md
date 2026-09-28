---
title: 'Story 1.1 — Khởi tạo monorepo và môi trường local'
type: 'chore'
created: '2026-09-28'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '9a250354acf320dd16103aada1a2269161ede7d4'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Repo chưa có code. Mọi story sau cần một nền móng thống nhất về cấu trúc, phiên bản, quy ước lỗi/log/config và test.

**Approach:** Scaffold monorepo pnpm + Turborepo theo Structural Seed của Architecture (`apps/web`, `apps/admin`, `apps/api`, `packages/shared`, `packages/tokens`). Chạy toàn bộ ở local bằng `docker compose up`. Kèm theo: API có `/health`, validate env bằng zod, log pino, định dạng lỗi chuẩn, tokens "Ivory & Walnut" và bộ test Vitest (unit + integration với Postgres thật).

## Boundaries & Constraints

**Always:**
- Pin chính xác (không dùng `^`/`~`): `typescript` 6.0.3; `prisma`, `@prisma/client`, `@prisma/adapter-pg` 7.10.0.
- Các phiên bản khác theo bảng Stack: Node 24.21, pnpm 12.6, Turbo 2.11, Next 16.3 / React 19.3, Nest 12.1, Tailwind 4.3, zod 4.6, pino 10.3 / nestjs-pino 5.2, Postgres 18.6, SeaweedFS 4.47.
- `apps/api` là CommonJS. Prisma dùng generator `prisma-client`, output `apps/api/src/generated`, `moduleFormat = "cjs"`, `@prisma/adapter-pg`, và `prisma.config.ts` tự nạp `.env`.
- Config chỉ đọc qua `ConfigModule` validate bằng zod. Thiếu biến thì process thoát và nêu tên biến.
- Lỗi luôn trả `{error:{code,message,details?}}`; `code` lấy từ danh mục trong `packages/shared`.
- Log là pino JSON, mỗi request có `requestId`; không log secret.
- Web và admin là client mỏng, không import Prisma hay S3.

**Never:**
- Không tạo bảng nghiệp vụ nào: `User` thuộc 1.2, `Sheet` thuộc 1.5.
- Không làm auth, guard hay CORS credentials (thuộc 1.2/1.3).
- Không làm `docker-compose.prod.yml` hay Caddy (thuộc Story 5.1).
- Không dùng MinIO (đã archive).
- Không bật `cacheComponents` của Next.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Health OK | `GET /health`, DB sẵn sàng | 200 `{status:"ok", db:"up"}` | N/A |
| Health DB down | Postgres không kết nối được | 503 `{error:{code:"SERVICE_UNAVAILABLE",…}}` | Không lộ stack trace |
| Route không tồn tại | `GET /khong-co` | 404 `{error:{code:"NOT_FOUND",…}}` | Filter toàn cục |
| Exception bất ngờ | Handler ném lỗi thường | 500 `{error:{code:"INTERNAL_ERROR",message:"…"}}` | Log error kèm `requestId`; không trả stack |
| Thiếu env | Bỏ `DATABASE_URL` | Process thoát mã ≠ 0, log liệt kê tên biến thiếu | N/A |

</frozen-after-approval>

## Code Map

- (repo trống) -- Chỉ có `_bmad/`, `.agents/`, `.claude/`, `_bmad-output/`. Không có code để tái sử dụng; không sửa các thư mục này.
- `_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md` -- Frontmatter là nguồn giá trị token (colors/typography/rounded/spacing) cho `packages/tokens`.
- `_bmad-output/planning-artifacts/architecture/architecture-Piano Daily-2026-09-27/ARCHITECTURE-SPINE.md` -- Structural Seed, bảng Stack, Consistency Conventions.
- Môi trường máy:
  - Node host là 22.22 (có nvm; `node@24.21.0` tồn tại).
  - Corepack pnpm 12.6 bị lỗi cache (`~/.cache/node/corepack/v1/pnpm/12.6.0` thiếu `bin/pnpm.cjs`).
  - Docker 28.5 + Compose 2.40; `pdftoppm` có trên host.

## Tasks & Acceptance

**Execution:**
- [x] `.nvmrc`, `package.json` (root), `pnpm-workspace.yaml`, `turbo.json`, `.gitignore`, `.npmrc`, `tsconfig.base.json`, `eslint.config.mjs` -- Workspace gốc có `packageManager: pnpm@12.6.0`, `engines.node >=24.21`; các script `dev/build/lint/typecheck/test` chạy qua turbo -- Là nền cho mọi package.
- [x] `packages/shared/` -- Package `@piano-daily/shared` gồm `errors.ts` (danh mục mã lỗi: `INTERNAL_ERROR`, `NOT_FOUND`, `VALIDATION_FAILED`, `SERVICE_UNAVAILABLE` và type `ErrorResponse` kèm zod schema) và `index.ts`; build ra CJS để API require được -- Hợp đồng API duy nhất (AD-2).
- [x] `packages/tokens/` -- `@piano-daily/tokens/theme.css`: Tailwind v4 `@theme` ánh xạ đủ màu, typography, rounded và spacing từ DESIGN.md -- UX-DR1.
- [x] `apps/api/` -- Nest 12 gồm:
  - `ConfigModule` validate env bằng zod (`src/config/env.ts`);
  - `nestjs-pino` có `requestId`; `helmet`; global exception filter chuẩn hoá lỗi;
  - `PrismaService` dùng adapter-pg; `HealthController` chạy `SELECT 1`;
  - `prisma/schema.prisma` (chỉ datasource + generator, chưa có model) và `prisma.config.ts`;
  - script `start` chạy `prisma migrate deploy` rồi mới khởi động app -- Nền móng cho mọi module.
- [x] `apps/api/test/` + `vitest.config.ts`, `vitest.integration.config.ts` -- Unit test cho filter lỗi và env schema. Integration test dùng `unplugin-swc` (decorator metadata) và globalSetup migrate `TEST_DATABASE_URL`, gọi `GET /health` qua supertest với DB thật; thêm một ca DB down trả 503 -- Phủ I/O matrix.
- [x] `apps/web/` -- Next 16.3 App Router, port 3000, import tokens, trang chủ placeholder dùng font Playfair Display + Be Vietnam Pro (subset vietnamese) -- Khung cho Epic 2.
- [x] `apps/admin/` -- Next 16.3, port 3001, `shadcn init` (`components.json`), import tokens, trang placeholder -- Khung cho Story 1.3.
- [x] `apps/*/Dockerfile` -- Multi-stage dùng `node:24.21-bookworm-slim` và `turbo prune`; image api cài thêm `poppler-utils` -- Dùng chung cho local, và sau này cho production.
- [x] `docker-compose.yml` -- Gồm:
  - `postgres:18.6` có volume + healthcheck;
  - `postgres-test` (profile `test`, tmpfs, port 5433);
  - `chrislusf/seaweedfs:4.47` chạy `server -s3`;
  - api, web, admin build từ Dockerfile, `depends_on` postgres healthy -- AC chạy một lệnh.
- [x] `.env.example`, `README.md` -- Liệt kê mọi biến; hướng dẫn `nvm use`, `corepack enable`, `pnpm install`, `docker compose up`, `pnpm test` (bật `postgres-test`) và chế độ dev nhanh (`docker compose up postgres seaweedfs` + `pnpm dev`) -- Onboarding.

**Acceptance Criteria:**
- Given repo đã scaffold, when chạy `pnpm install && pnpm build && pnpm typecheck && pnpm lint`, then tất cả thành công; `pnpm ls typescript prisma @prisma/client @prisma/adapter-pg -r` chỉ ra đúng 6.0.3 và 7.10.0.
- Given Docker, when chạy `docker compose up -d --build`, then cả 5 service đều healthy/running; `curl localhost:4000/health` trả 200; web :3000 và admin :3001 trả 200.
- Given `postgres-test` đang chạy, when chạy `pnpm test`, then unit và integration test đều xanh.
- Given web hoặc admin, when render trang placeholder, then CSS có các biến token (ví dụ `--color-primary: #5C3A21`) và font đúng.

## Design Notes

- **Prisma chưa có model:** `migrate deploy` với 0 migration vẫn hợp lệ. `generate` vẫn chạy để `PrismaService` có client; Story 1.2 thêm model đầu tiên.
- **Chế độ chạy:** compose chạy các app ở chế độ production build (ổn định, đúng AC). Để có hot reload, dev chạy app trên host bằng `pnpm dev`, chỉ bật infra trong compose. Không bind-mount `node_modules` vào container (tránh lỗi binary native của sharp/prisma giữa macOS và Linux).
- **Vitest với Nest:** Vitest không emit decorator metadata, nên cần `unplugin-swc`; thiếu nó thì DI của Nest hỏng.
- **Nest 12 + TS 6.0.3:** Nest CLI chưa hỗ trợ TS 7, đó là lý do pin TS.

## Verification

**Commands:**
- `pnpm install --frozen-lockfile && pnpm build && pnpm typecheck && pnpm lint` -- expected: exit 0
- `docker compose up -d --build && docker compose ps` -- expected: postgres/seaweedfs healthy, api/web/admin running
- `curl -s localhost:4000/health` -- expected: `{"status":"ok","db":"up"}`
- `curl -s localhost:4000/khong-co` -- expected: `{"error":{"code":"NOT_FOUND",...}}`
- `docker compose --profile test up -d postgres-test && pnpm test` -- expected: mọi test pass
- `DATABASE_URL= node apps/api/dist/main.js` -- expected: thoát ≠ 0, log nêu `DATABASE_URL`

## Implementation Notes

- **Nest 12 là ESM-only** (`@nestjs/*` có `"type":"module"`). `apps/api` vẫn là CommonJS: TS `module: nodenext` + `require(esm)` của Node 24 lo phần tương thích.
- **Thiếu env:** `@nestjs/config` validate ngay lúc `forRoot` được nạp, nên `main.ts` nạp `.env` rồi `validateEnv()` trước, sau đó mới `import()` động `AppModule`. Nhờ vậy lỗi là một dòng JSON kiểu pino (`invalidEnv: [...]`), exit 1, không kèm stack trace.
- **Mã lỗi:** danh mục chỉ có 4 mã theo spec. Các HTTP 4xx chưa có mã riêng (401/403/409/429…) tạm trả `INTERNAL_ERROR` nhưng giữ đúng status. Story 1.2 cần bổ sung `UNAUTHORIZED`, `FORBIDDEN`… vào `packages/shared`.
- **requestId:** gắn qua `customProps` của pino-http nên mọi dòng log trong request đều có. Server nhận lại `X-Request-Id` hợp lệ từ client, nếu không thì tự sinh. Log không ghi `remoteAddress` và che các header chứa IP, cookie, authorization.
- **Integration test:** mỗi URL DB nằm trong một file test riêng, vì `ConfigModule.forRoot` chỉ validate một lần cho mỗi module graph.
- **`postgres-test`:** cổng mặc định 5433, ghi đè được bằng `POSTGRES_TEST_PORT`. Trên máy dev, cổng 5433 đang bị một process ngoài Docker chiếm, nên phần xác minh chạy ở 55433.
- **shadcn:** `shadcn@4.21.0 init -d` (preset `base-nova`, `@base-ui/react`, util `cn`). `globals.css` đã được viết lại: token là nguồn duy nhất của `--color-primary/secondary` và `--radius-*`, còn biến ngữ nghĩa của shadcn trỏ về token (ring = brass). Bỏ font Geist và `.dark`.
- **pnpm 12:** dùng `allowBuilds` (thay cho `onlyBuiltDependencies`) và `overrides` để khoá TS/Prisma. pnpm tự thêm `minimumReleaseAgeExclude` cho turbo 2.11.5.
- **turbo:** đặt `agentGuidance: false` để turbo không tự sinh `AGENTS.md`.
- **Kiểm matrix (sau implement):**
  - Hàng "Thiếu env" trước đó chỉ được kiểm tay, nên đã thêm `apps/api/test/integration/missing-env.spec.ts`: test chạy `node dist/main.js` với `DATABASE_URL=''` và assert exit ≠ 0, `invalidEnv`, không có stack.
  - `turbo.json` task `test` giờ phụ thuộc cả `build` của chính package.
  - Hàng "Exception bất ngờ" được phủ bởi unit test của filter (500, không lộ message/stack, `logger.error` được gọi). `requestId` trong log đến từ `customProps` của pino-http và chưa có assert riêng.

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Lỗi body-parser (JSON sai, body quá lớn) → 500 | medium | Đã thử trên API đang chạy: JSON sai → 400 VALIDATION_FAILED (Nest tự bọc thành BadRequestException), nhưng body >100kb → 500 INTERNAL_ERROR và log level 50 `PayloadTooLargeError` | patch |
| 2 | HttpException 4xx ngoài map (401/403/409/429) → code INTERNAL_ERROR | low | Có thật, nhưng story này không có endpoint nào ném các lỗi đó. Muốn sửa phải thêm mã vào catalog shared (public surface); Story 1.2 đã được ghi chú bổ sung | reject (low) |
| 3 | Filter không kiểm `headersSent` | low | Không có route streaming; muốn sửa phải thêm nhánh guard | reject (low) |
| 4 | `invalidEnv` có thể liệt kê trùng một biến (vd. PORT=0.5) | low | Có thật (int + min cùng fail), chỉ ảnh hưởng thẩm mỹ, hiếm gặp; sửa cần thêm logic dedupe | reject (low) |
| 5 | `/health` treo khi DB nhận TCP nhưng query bị kẹt | low | Có thật về lý thuyết; healthcheck compose vẫn timeout nên container bị đánh unhealthy. Hiếm gặp, sửa cần thêm tham số timeout | reject (low) |
| 6 | Redact thiếu header `forwarded`, `proxy-authorization` | low | Cloudflare/Caddy không gửi `Forwarded` mặc định; sửa chỉ là thêm vào danh sách | patch |
| 7 | Query string có secret bị log | maybe-false | API hiện không có route nhận secret qua query. Cần xem thiết kế token của Epic 2/3 (download token nằm ở path) | reject (low nếu có thật) |
| 8 | `npm start` → `sh -c` không chuyển SIGTERM cho node | medium | `start` = `prisma migrate deploy && node dist/main.js`: node là con của sh nên shutdown hooks không chạy khi `docker compose stop` | patch |
| 9 | `NEXT_PUBLIC_API_URL` không được build vào bundle, cache sai | false | Chưa có code nào đọc biến này | reject |
| 10 | AC "5 service healthy" không đạt vì web/admin không có healthcheck | false | AC ghi "healthy/running"; web/admin đang running và trả 200 | reject |
| 11 | web/admin `depends_on` postgres, trái nguyên tắc client mỏng | low | Coupling khởi động thừa; sửa chỉ cần xoá dòng | patch |
| 12 | SeaweedFS chưa có credential/bucket như `.env.example` | false | `.env.example` đã ghi rõ các biến S3 "chưa được API đọc ở Story 1.1" | reject |
| 13 | `.env.example`: đổi `POSTGRES_PORT` mà `DATABASE_URL` vẫn cứng 5432 | low | Có thật; sửa chỉ là thêm comment như phần test | patch |
| 14 | Healthcheck `/health` mỗi 10s làm ngập log info | low | Đã đếm: 12 dòng `/health` trong 2 phút; dev đọc log sẽ gặp hằng ngày | patch |
| 15 | Đường dẫn `.env` phụ thuộc cwd | low | `ENV_FILE_PATHS` resolve theo cwd, còn `prisma.config.ts` theo `__dirname`; chạy từ gốc repo sẽ đọc `../../.env` nằm ngoài repo | patch |
| 16 | ESLint thiếu plugin Next/react-hooks | low | Không có trong spec; sửa phải thêm dependency và config | reject (low) |
| 17 | Rule chặn import có lỗ (`pg/*`, `prisma/*`, `aws-sdk`, import tương đối vào `apps/api`) | low | Có thật; sửa chỉ là mở rộng pattern | patch |
| 18 | `cn@0.4.0` không merge class Tailwind | false | Đã chạy thử: `cn('px-2 bg-red-500','px-4 bg-primary')` → `px-4 bg-primary` (merge đúng; package của shadcn-ui) | reject |
| 19 | Focus ring của admin là 3px/50% thay vì 2px brass | low | Là mặc định của shadcn; UI admin làm ở Story 1.3 | reject (low) |
| 20 | Root `pnpm test` cần Docker, không có đường unit-only | low | Đúng như thiết kế của AC (integration với DB thật) | reject (low) |
| 21 | Logging không được test: `requestId` trên dòng log, redaction, `X-Request-Id` không hợp lệ | medium | Verification-gap đã xác minh sẵn: không test nào tham chiếu `buildLoggerParams`/`genRequestId`, và integration chạy `LOG_LEVEL=silent` | patch |
| 22 | Không có smoke test tự động cho `docker compose` | medium | Verification-gap đã xác minh sẵn; cần hạ tầng CI (Story 5.3) | defer |
| 23 | Test tokens yếu về typography và phụ thuộc đường dẫn DESIGN.md | low | Có thật; sửa cần viết lại test | reject (low) |
| 24 | Metadata lệch nhau (status spec vs sprint, tên file `.mts`) | false | Status do workflow quản lý theo từng bước; `.mts` là chi tiết implement | reject |
| 25 | Trùng `fonts.ts`/`next.config.ts`, dep shared chưa dùng, `.gitignore` thiếu `.idea` | low | `.idea` đã được commit từ `c1b3d16`; phần trùng lặp là khung chờ Epic 2/1.3 | reject (low) |
| 26 | `pg_isready` qua unix socket báo sẵn sàng trong lúc postgres còn init | medium | Server tạm của entrypoint chỉ nghe socket; nếu api migrate đúng lúc restart thì exit | patch |
| 27 | api exit lúc khởi động không tự restart | low | Không có `restart:`; sửa chỉ cần thêm một dòng | patch |
| 28 | Mật khẩu Postgres có ký tự URL đặc biệt làm hỏng `DATABASE_URL` | low | Hiếm gặp với môi trường local; sửa cần encode | reject (low) |
| 29 | Build Next cần mạng để tải Google Fonts | low | Có thật; môi trường dev luôn có mạng; sửa cần vendor font | reject (low) |
| 30 | `missing-env.spec` so `toEqual` nên dễ fail khi shell có env sai | low | turbo passthrough `NODE_ENV/LOG_LEVEL/PORT`; sửa chỉ cần env tối thiểu | patch |
| 31 | `missing-env.spec` có thể chạy trên `dist` cũ | low | Chỉ khi chạy vitest trực tiếp mà không qua turbo; sửa cần build trong globalSetup | reject (low) |
