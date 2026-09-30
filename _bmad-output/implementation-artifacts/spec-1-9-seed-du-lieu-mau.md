---
title: 'Story 1.9 — Seed dữ liệu mẫu'
type: 'feature'
created: '2026-09-30'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'ab49bf7d1d193c0b901f2e3785975bfb038bceab'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `db:seed` hiện chỉ tạo SUPER_ADMIN. Epic 2–4 cần thư viện có sẵn Composer, Genre, Series và Sheet (kèm thumbnail, ảnh trang, note-JSON) để phát triển và demo mà không phải nhập tay.

**Approach:** Mở rộng `prisma/seed.ts` để, sau SUPER_ADMIN, tạo Composer/Genre/Series và 10 Sheet mẫu. File PDF/MIDI/MP3 được sinh bằng code rồi đi qua đúng `SheetsService.attachFile` (dựng tay `SheetMediaService`/`StorageService`, không dùng DI của Nest vì `tsx` không emit decorator metadata). Thêm lệnh `pnpm db:seed` ở gốc repo.

## Boundaries & Constraints

**Always:**
- **Dữ liệu:** 4 Composer, 4 Genre, 2–3 Series, 10 Sheet trải theo Level 3/3/2/2 (BEGINNER/INTERMEDIATE/ADVANCED/EXPERT). 8 Sheet PUBLISHED (2 trong số đó `isHot`), 2 Sheet DRAFT. Mỗi Sheet có PDF (1–4 trang), MIDI và MP3, gắn Genre; một phần có Series và `youtubeUrl`/`lyricsChords`.
- **Sinh file bằng code**, đặt tại `apps/api/prisma/fixtures/{pdf,midi,mp3}.ts`. Chuyển `makePdf`/`makeMidi` (và `corruptPdf`, `PNG_1X1`, `corruptMidi`, `midiWithNoTracks`) từ `apps/api/test/fixtures/` sang đây; hai file test cũ chỉ còn `export * from` để test hiện có không đổi. MP3 mẫu: tag `ID3` + vài frame MPEG1 Layer III 128kbps im lặng. Mỗi Sheet nhúng nhãn riêng để hash khác nhau.
- **Media đi đúng pipeline:** tạo Sheet bằng `SheetsService.create`, rồi `attachFile` cho PDF, MIDI, MP3. Composer/Genre/Series tạo bằng service tương ứng (slug tự sinh).
- **PUBLISHED/HOT:** Story 1.8 chưa vào `develop`, nên seed ghi thẳng `status`, `isHot`, `firstPublishedAt` bằng Prisma sau khi đủ file. Chỉ publish Sheet đã có PDF hiện hành.
- **Idempotent, tự chữa lành:** nhận diện theo tên (Composer/Genre), `(tên, composer)` (Series), `(tiêu đề, composer)` (Sheet). Đã có thì bỏ qua; Sheet có mà thiếu PDF/MIDI/MP3 hiện hành thì chỉ đính bù phần thiếu. Chạy lại không đổi số bản ghi, không upload lại file đã có.
- **Env:** giữ `ADMIN_*` như cũ; thêm validate các biến `S3_*` bằng zod (tách `storageEnvSchema` khỏi `envSchema` trong `src/config/env.ts`, dùng lại ở seed). Thiếu biến nào thì thoát mã ≠ 0 và nêu tên biến. Nếu `S3_AUTO_CREATE_BUCKETS` bật thì seed gọi `ensureBuckets()`.
- **Log:** không in email đầy đủ, mật khẩu hay secret.
- **Root:** `package.json` gốc thêm `"db:seed": "pnpm --filter @piano-daily/api db:seed"`; cập nhật README (điều kiện: DB đã migrate, S3 chạy, có `pdftoppm`).

**Never:**
- Không đổi hành vi của `attachFile`/API/schema Prisma, không tạo migration.
- Không commit file nhị phân; không thêm dependency mới.
- Không dùng dữ liệu thật hay tác phẩm còn bản quyền làm nội dung PDF (chỉ nhãn/tên bài giả).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| DB trống | migrate xong, S3 chạy | 1 SUPER_ADMIN, 4 Composer, 4 Genre, Series, 10 Sheet; mỗi Sheet `hasSheet/hasMidi/hasMp3=true`, `pageCount≥1`; đủ 4 Level; ≥1 DRAFT, ≥1 HOT | N/A |
| Chạy lại | seed đã chạy | Số bản ghi và số `sheet_files` không đổi | N/A |
| Sheet dở dang | Sheet mẫu có nhưng thiếu MIDI | Chạy lại chỉ đính MIDI, không nhân đôi PDF/MP3 | N/A |
| Thiếu env S3 | không có `S3_ENDPOINT` | Thoát mã ≠ 0, nêu `S3_ENDPOINT (thiếu)`, không ghi gì | Không tạo dữ liệu nào |
| Thiếu `pdftoppm` | không có poppler | Thoát mã ≠ 0 với thông báo rõ | Không để Sheet ở trạng thái PUBLISHED thiếu PDF |
| User admin đã tồn tại | như hiện tại | Giữ nguyên, cảnh báo nếu không phải SUPER_ADMIN hoạt động | Hành vi hiện có |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/seed.ts` -- seed hiện tại (chỉ SUPER_ADMIN, `PrismaClient` + `PrismaPg`, `readEnv`, `maskEmail`). Mở rộng; giữ nguyên phần admin.
- `apps/api/src/modules/catalog/{composers,genres,series,sheets}.service.ts` -- `create`, `attachFile(id, type, {buffer, originalName})`. Dùng lại; constructor nhận `PrismaService` (cần `ConfigService`).
- `apps/api/src/modules/media/{storage.service,sheet-media.service,pdf-processor}.ts` -- `new StorageService(config)`, `new PdfProcessor()`, `new SheetMediaService(pdf, storage)`; `onModuleInit` (ensureBuckets), `onModuleDestroy`.
- `apps/api/src/config/env.ts` -- tách `storageEnvSchema` (S3_*, kèm refine bucket khác nhau); `envSchema` tái dùng.
- `apps/api/test/fixtures/{pdf,midi}.ts` -- chuyển sang `prisma/fixtures/`, để lại re-export.
- `apps/api/test/integration/seed.spec.ts` -- chạy seed bằng `spawnSync tsx`; bổ sung env S3 test (`TEST_S3` từ `create-app.ts`) và test dữ liệu mẫu/idempotent.
- `apps/api/prisma.config.ts` -- `seed: 'tsx prisma/seed.ts'`, không đổi.
- `package.json` (gốc), `README.md` -- thêm `db:seed`, hướng dẫn.

## Tasks & Acceptance

**Execution:**
- [x] `apps/api/src/config/env.ts` -- tách `storageEnvSchema`, giữ `envSchema` cũ hành xử y hệt -- seed validate S3
- [x] `apps/api/prisma/fixtures/{pdf,midi,mp3}.ts` + `apps/api/test/fixtures/{pdf,midi}.ts` -- chuyển generator, thêm `makeMp3`, để re-export -- fixture dùng chung
- [x] `apps/api/prisma/seed-data.ts` -- danh sách khai báo Composer/Genre/Series/Sheet mẫu (không logic) -- dữ liệu
- [x] `apps/api/prisma/seed.ts` -- dựng services thủ công, seed idempotent taxonomy → Sheet → file → trạng thái -- nghiệp vụ
- [x] `apps/api/test/integration/seed.spec.ts` -- cập nhật env; thêm ca DB trống, chạy lại, Sheet dở dang, thiếu S3 -- phủ I/O matrix
- [x] `package.json` (gốc), `README.md` -- `db:seed`, điều kiện chạy -- DX

**Acceptance Criteria:**
- Given DB trống sau migrate, S3 chạy, when `pnpm db:seed`, then DB có đúng dữ liệu ở I/O matrix và thumbnail/page image/note-JSON có trên storage.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Implementation Notes

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Seed không có guard môi trường, có thể ghi dữ liệu mẫu vào production | low | Hành vi do spec quy định (`pnpm db:seed` tạo đủ dữ liệu); là lệnh dev chạy tay; guard thêm cờ/nhánh mới | reject |
| 2 | Nhận diện idempotent theo tên/tiêu đề, không có khoá ổn định; chạy đồng thời có thể trùng | low | Spec quy định nhận diện theo tên; Composer/Genre/Series không có unique theo tên; seed là lệnh chạy tay một tiến trình | reject |
| 3 | Lỗi giữa chừng (S3 sập, thiếu bucket) để lại Draft thiếu file, không có try/catch từng Sheet | low | Lỗi vẫn ném ra to tiếng với exit ≠ 0; chạy lại tự đính bù (có test "Sheet dở dang") | reject |
| 4 | Publish ghi thẳng Prisma, bỏ qua luật Story 1.8 | false | Spec (Always) quy định rõ vì 1.8 chưa vào `develop`; đã ghi chú trong code | reject |
| 5 | Chạy lại không sửa `isHot`/trạng thái của Sheet đã có; im lặng nếu Sheet bị ARCHIVED | low | Thiết kế: không ghi đè chỉnh sửa tay; `isHot` và `status` ghi cùng một câu update nên không lệch khi seed tự chạy | reject |
| 6 | `assertPdftoppm` chỉ kiểm `probe.error`, bỏ qua exit status | low | Chủ ý: ENOENT là điều cần bắt; `pdftoppm -v` không đáng tin về mã thoát; binary hỏng sẽ lỗi to ở bước xử lý PDF | reject |
| 7 | Fixture test phụ thuộc thư mục `prisma/fixtures`; helper test-only nằm trong seed fixtures | false | Spec (Always) yêu cầu đúng việc chuyển và re-export | reject |
| 8 | Test không kiểm liên kết Series/Genre; `series.count() >= 2` lỏng hơn 3 | medium | Xác minh: bỏ `genreIds`/`seriesId` trong `seedSheets` thì mọi assertion vẫn xanh | patch |
| 9 | Guard publish idempotent không có test | low | Guard bảo vệ chỉnh sửa tay khi chạy lại; test rẻ (đặt ARCHIVED/đổi isHot rồi seed lại) | patch |
| 10 | Test thiếu `pdftoppm` có assertion cuối đúng rỗng | low | Khi seed không ghi gì, `count(PUBLISHED, hasSheet=false) == 0` luôn đúng; chỉ còn exit code và stderr kiểm tra | patch |
| 11 | MIDI của các cặp Sheet (1/7, 2/8, 3/9, 4/10) giống hệt byte | low | Đúng: MIDI chỉ phụ thuộc `noteCount`. Không có hệ quả: key storage chứa `sheetId` nên không đụng nhau; câu "hash khác nhau" của spec chỉ cần cho PDF/MP3 | reject |
| 12 | `$disconnect` ném lỗi thì `storage.onModuleDestroy()` bị bỏ qua | low | Tiến trình seed thoát ngay sau đó; không có hệ quả thực | reject |
| 13 | Tìm theo tên không phân biệt hoa thường; lỗi trùng slug khi có dòng cùng tên | low | Không có input thực tế nào chạm tới; fix thêm nhánh | reject |
| 14 | Thiếu bucket khi `S3_AUTO_CREATE_BUCKETS=false` báo lỗi S3 thô sau khi đã ghi DB | low | Lỗi rõ ràng, có thể chạy lại; guard thêm API mới ở `StorageService` | reject |
| 15 | `TRUNCATE … CASCADE` trong `afterAll` có thể đua với spec khác | false | `fileParallelism: false` trong vitest.integration.config; CASCADE bao phủ FK phụ thuộc | reject |
| 16 | YouTube URL mẫu là video thật (có Rickroll); `pages` không validate; `icon` luôn được set | low | Chỉ thẩm mỹ dữ liệu mẫu; không ảnh hưởng hành vi | reject |
| 17 | README thiếu cách reset dữ liệu mẫu, không có cờ seed admin-only, lặp điều kiện chạy | low | README đã nêu điều kiện S3/`pdftoppm`; spec không yêu cầu cờ admin-only | reject |
| 18 | Tên trong `pdftoppm` test: xoá thư mục tạm trước khi assert; `node` symlink có thể thiếu shared lib | false | Test đã chạy xanh 2 lần liên tiếp; thư mục tạm chỉ cần cho lúc spawn | reject |

## Design Notes

- Dựng service thủ công thay vì `NestFactory.createApplicationContext`: `tsx` (esbuild) không emit `emitDecoratorMetadata` nên DI theo kiểu bị hỏng; constructor của các service chỉ cần vài phụ thuộc rõ ràng.
- `ConfigService` cho `PrismaService`/`StorageService` dựng bằng `new ConfigService({...validatedEnv})`.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `pnpm db:seed` hai lần liên tiếp, rồi `SELECT status, is_hot, count(*) FROM sheets GROUP BY 1,2` -- expected: số dòng không đổi giữa hai lần; 8 PUBLISHED (2 HOT), 2 DRAFT

**Manual checks:**
- Mở URL `thumbnail` và `noteJsonUrl` của một Sheet mẫu trong trình duyệt: thấy ảnh và JSON.
