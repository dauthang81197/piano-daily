---
title: 'Story 1.6 — Upload PDF, tự động tạo thumbnail và ảnh từng trang'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '7bd623e61321f4f4f5201243ea03d8a14c304acf'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet chưa có file. Founder cần upload bản PDF và để hệ thống tự đếm trang, tạo thumbnail và ảnh từng trang cho trang xem công khai, thay vì xử lý ảnh bằng tay.

**Approach:**
- **Module `media` (API):** là nơi duy nhất nói chuyện với S3, dùng hai bucket public và private.
- **Bảng `SheetFile` (thuộc `catalog`).**
- **Endpoint `POST /admin/sheets/:id/files`:** nhận PDF và xử lý đồng bộ:
  1. PDF gốc lưu vào vùng private.
  2. `pdftoppm` + sharp tạo page image webp và thumbnail, lưu vào vùng public.
  3. Chỉ khi mọi object đã lưu xong mới commit DB.
  4. Lỗi ở bất kỳ bước nào thì xoá các object vừa ghi.
- **Admin:** trang sửa Sheet có uploader kéo-thả, hiện tiến trình % và thumbnail ngay khi upload xong.

## Boundaries & Constraints

**Always:**
- **Chỉ `media` import `@aws-sdk/client-s3`.** `catalog` gọi các service public của `media` (AD-1, AD-6).
  - Cấu hình qua env đã validate bằng zod: `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_BUCKET_PUBLIC`, `S3_BUCKET_PRIVATE`, `S3_PUBLIC_BASE_URL` (URL trình duyệt dùng để đọc bucket public), `S3_FORCE_PATH_STYLE` (bool), `S3_AUTO_CREATE_BUCKETS` (bool, chỉ dùng cho dev/test).
  - Client đặt `requestChecksumCalculation` và `responseChecksumValidation` là `'WHEN_REQUIRED'` (tương thích R2).
- **Key:** `{public|private}/sheets/{sheetId}/{fileType}/{hash}.{ext}`, với `hash` = sha256 (hex) của nội dung object. Riêng PAGE_IMAGE: `…/PAGE_IMAGE/{pdfHash}-p{n}.webp`.
  - Object public ghi kèm `Cache-Control: public, max-age=31536000, immutable` và content-type đúng.
- **`SheetFile`:**
  - Cột: `id` uuidv7; `sheet_id` FK tới `sheets`, `ON DELETE CASCADE`; `type` enum `PDF|MIDI|MP3|THUMBNAIL|PAGE_IMAGE`; `storage_key`; `original_name?`; `size` (bytes); `mime_type`; `page_number?`; `source_file_id?` (THUMBNAIL/PAGE_IMAGE trỏ tới PDF đã sinh ra chúng); `superseded_at?`; `created_at`.
  - Partial unique index trên `(sheet_id, type)` cho `type IN ('PDF','MIDI','MP3') AND superseded_at IS NULL` (SQL viết tay trong migration).
  - `FileType` enum dùng chung trong `packages/shared`, có test so với Prisma.
- **Validate upload:**
  - Field multipart `file` và `type`; `type` = `PDF` ở story này (MIDI/MP3 thuộc Story 1.7; type khác → 400).
  - PDF ≤ 20MB (multer `limits.fileSize`); vượt thì 413 mã `FILE_TOO_LARGE`.
  - Nội dung phải bắt đầu bằng `%PDF-` (kiểm magic bytes, không tin mime do client gửi); sai thì 415 mã `UNSUPPORTED_FILE_TYPE`.
  - PDF hỏng/không đọc được, hoặc > 100 trang, trả 422 mã `FILE_PROCESSING_FAILED` kèm lý do.
  - Sheet không tồn tại → 404.
- **Xử lý (AD-9):**
  - Chạy `pdftoppm` (execFile, không qua shell, timeout 120 giây) trong thư mục tạm riêng, xoá thư mục sau khi xong.
  - Mỗi trang được sharp chuyển sang webp chiều rộng tối đa 1400px, quality 80. Thumbnail là trang 1, webp rộng 480px.
  - Upload các object, rồi mở **một** transaction:
    1. `superseded_at = now()` cho PDF hiện hành cùng các THUMBNAIL/PAGE_IMAGE còn hiện hành của sheet;
    2. insert PDF mới, THUMBNAIL và PAGE_IMAGE (có `source_file_id`);
    3. `recomputeDerived()`.
  - Lỗi ở bất kỳ bước nào thì xoá mọi object đã ghi trong request đó và DB không đổi.
  - Upload lại đúng nội dung PDF cũ vẫn tạo bản ghi mới; object S3 trùng key thì ghi đè vô hại.
- **`recomputeDerived()`** bổ sung: `has_sheet` = có PDF hiện hành; `page_count` = số PAGE_IMAGE hiện hành.
- **Response của Sheet** (GET, PATCH, upload) thêm:
  - `thumbnailUrl: string | null`;
  - `pages: [{pageNumber, url}]` (URL public đã resolve);
  - `pdf: {originalName, size, uploadedAt} | null`.
  - **Không bao giờ** trả `storage_key`, key hay URL của vùng private.
- **Admin uploader:**
  - Kéo-thả, hoặc click để chọn file (`<input type="file" accept="application/pdf">`); chỉ có trên trang sửa Sheet.
  - Thanh tiến trình % dùng XMLHttpRequest, có Bearer token và refresh một lần khi gặp 401, dùng chung phiên của `session.ts`.
  - Kiểm tra phía client ngay khi chọn file (không phải PDF / > 20MB): hiện `FormError` tại ô upload, không gửi request.
  - Xong thì hiện thumbnail, số trang, tên file; lỗi server thì hiện `FormError` tại ô upload. Các trường khác của form giữ nguyên.
- **Local/dev:**
  - SeaweedFS có cấu hình S3 identity (access key/secret theo `.env.example`) và cho đọc ẩn danh bucket public, qua file `infra/seaweedfs/s3.json` mount vào container.
  - `S3_AUTO_CREATE_BUCKETS=true` khiến API tạo bucket còn thiếu lúc khởi động. Integration test dùng bucket riêng (`piano-daily-test-public/private`).

**Never:**
- Không làm MIDI/MP3 (Story 1.7), xoá file hay dọn object cũ (GC, Story 1.8), signed URL tải file (Epic 3).
- Không upload avatar Composer (mục riêng trong deferred-work).
- Không dùng hàng đợi hay xử lý nền (AD-9: đồng bộ).
- Không chạy `pdftoppm` qua shell, không ghép chuỗi lệnh.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| PDF hợp lệ 3 trang | multipart `type=PDF`, file 3 trang | 201; Sheet `hasSheet=true`, `pageCount=3`, `thumbnailUrl` + 3 `pages` URL public đọc được (HTTP 200, `image/webp`); PDF gốc chỉ có ở bucket private | N/A |
| Upload PDF thay thế | Sheet đã có PDF 3 trang, upload PDF 2 trang | Bản cũ được đánh `superseded_at` (cả PDF lẫn ảnh); `pageCount=2`; chỉ còn 1 PDF hiện hành | N/A |
| File > 20MB | PDF 21MB | 413 `FILE_TOO_LARGE`; không object, không dòng DB | N/A |
| Không phải PDF | PNG đổi đuôi `.pdf` | 415 `UNSUPPORTED_FILE_TYPE` | Không ghi gì |
| PDF hỏng | Bắt đầu bằng `%PDF-` nhưng nội dung rác | 422 `FILE_PROCESSING_FAILED` | Không object, DB không đổi |
| Lỗi sau khi đã ghi object | Lỗi giả lập ở bước commit DB | 5xx/422; mọi object vừa ghi đã bị xoá khỏi S3; DB không đổi | Log error |
| Type không hỗ trợ | `type=MIDI` hoặc thiếu `type` | 400 `VALIDATION_FAILED` | N/A |
| Sheet không tồn tại | id lạ | 404 `NOT_FOUND` | N/A |
| Không có token | Bất kỳ | 401 | Guard global |
| Không lộ key | GET `/admin/sheets/:id` | Không có `storageKey`/`private` trong JSON | N/A |

</frozen-after-approval>

## Code Map

- **`apps/api/src/modules/catalog/`:**
  - `sheets.service.ts`: `SELECT`, `toSheet`, update có transaction.
  - `sheet-derived.ts`: `recomputeDerived(sheetId, tx)` hiện chỉ đặt `has_chords`/`has_video`, sẽ mở rộng.
  - `catalog.helpers.ts`: `UuidParamPipe`, `notFound`.
- **`apps/api/src/common/`:**
  - `http-exception.filter.ts`: `STATUS_TO_CODE` đã map 413 → VALIDATION_FAILED; cần thêm mã riêng `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `FILE_PROCESSING_FAILED` qua `AppException`.
  - `validation.ts`: `exceptionFactory`.
  - `config/env.ts`: schema zod; test ở `test/unit/env.spec.ts`.
- **`apps/api/prisma/schema.prisma`:** các model Sheet/SheetGenre, quy ước uuidv7/timestamptz; migration có SQL tay (CHECK) ở `20260929090000_catalog_sheet`.
- **`packages/shared/src/sheet.ts`:** `sheetSchema` sẽ thêm `thumbnailUrl`, `pages`, `pdf`. `errors.ts` là catalog mã lỗi.
- **Hạ tầng:**
  - `docker-compose.yml`: service `seaweedfs` (`server -dir=/data -s3 -s3.port=8333`, chưa có config identity) và env của api.
  - `.env.example`: đã có biến S3 (ghi chú "chưa được đọc").
  - `apps/api/Dockerfile`: đã cài `poppler-utils`; host có `/opt/homebrew/bin/pdftoppm`.
- **Admin:**
  - `apps/admin/src/components/sheets/{sheet-form,sheet-editor}.tsx`: form sửa Sheet.
  - `lib/auth/session.ts`: `getAccessToken`, `refreshSession`.
  - `lib/api/http.ts`: `API_URL`, `toApiError`, `ApiError`.
  - `components/form-error.tsx`.
- **Test:** `apps/api/test/integration/catalog-sheets.spec.ts` (mẫu login, TRUNCATE); `test-env.ts` (URL DB test).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/{errors,sheet,file}.ts` (+spec) -- mã lỗi `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `FILE_PROCESSING_FAILED`; enum `FileType`; `PDF_MAX_BYTES = 20MB`, `PDF_MAX_PAGES = 100`; `sheetSchema` thêm `thumbnailUrl`, `pages`, `pdf` -- hợp đồng.
- [x] `apps/api/prisma/schema.prisma` + migration `<ts>_sheet_files` -- enum `FileType`, bảng `sheet_files` (index `sheet_id`, `source_file_id`), partial unique index SQL tay -- AD-16.
- [x] `apps/api/src/config/env.ts` (+ test) -- các biến S3 (có default hợp lý cho region/path-style; `S3_AUTO_CREATE_BUCKETS` mặc định false) -- config.
- [x] `apps/api/src/modules/media/` -- `MediaModule`:
  - `StorageService`: `putPublic`, `putPrivate`, `deleteObjects`, `publicUrl(key)`, `ensureBuckets()` gọi trong `onModuleInit` khi bật cờ;
  - `PdfProcessor`: `render(buffer) → {pageCount, pages: Buffer[], thumbnail: Buffer}` bằng execFile `pdftoppm` + sharp, thư mục tạm, timeout, giới hạn trang;
  - `SheetMediaService`: xử lý một upload PDF và trả danh sách object đã ghi, để `catalog` commit hoặc rollback -- AD-6, AD-9.
- [x] `apps/api/src/modules/catalog/sheet-files.controller.ts` + mở rộng `sheets.service.ts`/`sheet-derived.ts` -- `POST /admin/sheets/:id/files` (`FileInterceptor('file', { limits: { fileSize: 20MB } })`, multer bị vượt giới hạn thì map sang `FILE_TOO_LARGE`); gọi `media`, rồi transaction supersede + insert + recompute; lỗi thì `deleteObjects`; response là `Sheet` -- nghiệp vụ.
- [x] `apps/api/test/fixtures/` + `test/integration/sheet-files.spec.ts` + unit test `PdfProcessor` -- fixture PDF 3 trang và 2 trang được sinh bằng code (không commit file nhị phân lớn) hoặc là file nhỏ < 10KB; phủ toàn bộ I/O matrix, kiểm object public đọc được qua `S3_PUBLIC_BASE_URL` và object private không đọc ẩn danh được -- AC.
- [x] `infra/seaweedfs/s3.json`, `docker-compose.yml`, `.env.example`, `README.md`, `turbo.json` -- identity S3 và quyền đọc ẩn danh bucket public; env S3 cho api (endpoint nội bộ `http://seaweedfs:8333`, public base `http://localhost:8333/<bucket>`); hướng dẫn chạy test cần seaweedfs -- hạ tầng.
- [x] `apps/admin/src/lib/api/upload.ts` -- `uploadSheetFile(sheetId, file, onProgress)` bằng XHR (Bearer token, 401 thì refresh một lần rồi thử lại, lỗi parse thành `ApiError`) -- tải lên có tiến trình.
- [x] `apps/admin/src/components/sheets/pdf-uploader.tsx` + gắn vào trang sửa Sheet -- vùng kéo-thả, click chọn file, validate client, thanh %, thumbnail + số trang + tên file, `FormError`; upload xong cập nhật dữ liệu Sheet trên trang nhưng không reset các trường form đang sửa -- UX-DR19.
- [x] `apps/admin/src/components/sheets/pdf-uploader.test.tsx` -- chọn file sai hoặc quá lớn thì lỗi, không request; upload thành công thì hiện thumbnail; lỗi server thì hiện `FormError`; tiến trình % cập nhật (XHR giả) -- phủ UI.

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build --wait` và đã đăng nhập admin, when mở một Sheet và kéo-thả một PDF, then thấy tiến trình %, rồi thumbnail và số trang; ảnh thumbnail tải được từ `http://localhost:8333/...`.
- Given `pnpm build && pnpm typecheck && pnpm lint && pnpm test` (có seaweedfs và postgres-test đang chạy), then tất cả xanh.

## Design Notes

- **Transaction không bọc bước S3:** S3 không nằm trong transaction DB. Vì vậy mọi object được ghi trước, DB commit sau cùng; lỗi thì xoá object đã ghi. Object mồ côi chỉ còn lại khi process chết giữa chừng, và sẽ được cron GC của Story 1.8 dọn.
- **Ảnh cũ bị supersede theo PDF:** THUMBNAIL/PAGE_IMAGE đi theo PDF sinh ra chúng (`source_file_id`). Khi PDF bị thay thế thì các ảnh đó cũng được đánh `superseded_at` trong cùng transaction.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `docker compose up -d --build --wait`, đăng nhập, rồi `curl -F type=PDF -F file=@<pdf> localhost:4000/admin/sheets/<id>/files -H "Authorization: Bearer …"` -- expected: 201, `pageCount>0`, `curl -I <thumbnailUrl>` trả 200 `image/webp`

**Manual checks:**
- Trình duyệt: trang sửa Sheet, kéo-thả PDF, thấy % rồi thumbnail; thử file PNG thì thấy lỗi tại ô upload.

## Implementation Notes

**Quyết định và điểm lệch khỏi spec:**
- **`source_file_id`:** FK tự tham chiếu `ON DELETE CASCADE` (spec không nêu). Xoá dòng PDF (GC Story 1.8) thì các dòng THUMBNAIL/PAGE_IMAGE sinh từ nó bị xoá theo. Migration thêm CHECK `size >= 0` và `page_number IS NULL OR >= 1`.
- **Rollback storage theo `discardUnreferenced`:** khi commit DB thất bại hoặc ghi S3 lỗi giữa chừng, `catalog` chỉ xoá những key vừa ghi mà **không** có dòng `SheetFile` nào tham chiếu. Lý do: upload lại đúng nội dung cũ sinh ra cùng key với bản hiện hành, nếu xoá mù sẽ làm hỏng bản đang dùng. Nếu không truy vấn được DB để kiểm tra (vd. DB sập) thì không xoá gì. Object mồ côi để GC Story 1.8 dọn. Đây là điểm lệch nhỏ so với "lỗi thì xoá mọi object đã ghi": ưu tiên không bao giờ xoá object đang được dùng.
- **Khoá Sheet trong transaction:** `SELECT … FOR UPDATE` trên `sheets` trước khi supersede, để hai upload đồng thời chạy tuần tự và không vi phạm partial unique index.
- **Giới hạn trang:** `pdftoppm -l 101` chỉ render tối đa 101 trang. Có trang thứ 101 thì trả 422, không render hết PDF quá dài. Render với `-scale-to-x 1400 -scale-to-y -1` để giới hạn bộ nhớ, sau đó sharp (withoutEnlargement).
- **Lỗi 422 `FILE_PROCESSING_FAILED`:** `message` là lý do (tiếng Việt), kèm `details: {reason}`. Thiếu `pdftoppm` (ENOENT) vẫn là 500, vì đó là lỗi cấu hình máy chủ chứ không phải lỗi của file.
- **ESLint:** thêm rule chặn import `@aws-sdk/*` trong `apps/api/src` ngoài `modules/media` (AD-1/AD-6).
- **Env:** thêm refine buộc `S3_BUCKET_PUBLIC` khác `S3_BUCKET_PRIVATE`. Cờ boolean nhận `true/false/1/0/yes/no/on/off`.
- **SeaweedFS:** mỗi bucket là một collection và được cấp trước vài volume. Với 4 bucket (dev + test), cấu hình mặc định hết volume nên upload bị 500. Compose chạy `-volume.max=100 -master.volumeSizeLimitMB=64`. Container cũ cần `docker compose up -d --force-recreate seaweedfs`. Identity anonymous trong `infra/seaweedfs/s3.json` chỉ có `Read:` hai bucket public, nên phải sửa theo khi đổi `S3_BUCKET_PUBLIC`.
- **Integration test:** mọi test dùng `createApp` giờ cần SeaweedFS đang chạy, vì bucket test được tạo lúc khởi động. Test đọc/liệt kê bucket bằng `S3Client` riêng; code app vẫn chỉ đi qua `media`.
- **Admin:** uploader đặt trên form, ngoài `<form>`. Upload xong chỉ `setSheet` và không đổi `key` của form, nên các trường đang sửa giữ nguyên.

**Sửa sau review:**
- **S3 lỗi giữa chừng:** `storePdf` không tự xoá nữa mà ném `StorageWriteError { keys, cause }`. `attachPdf` gọi `discardUnreferenced(keys)` rồi ném lại lỗi gốc (5xx). Có 2 integration test: Sheet chưa có PDF (object bị xoá, không có dòng DB) và upload lại đúng nội dung hiện hành (object hiện hành vẫn đọc được, dòng DB không đổi).
- **`PdfProcessor`:**
  - lỗi sharp thành `PdfProcessingError` ("Không xử lý được ảnh trang PDF…");
  - chỉ SIGKILL do Node gửi khi hết timeout (`killed`, không phải `ERR_CHILD_PROCESS_STDIO_MAXBUFFER`) mới báo "quá thời gian";
  - signal khác và vượt maxBuffer báo "Không đọc được file PDF";
  - stdout không dùng, stdout/stderr bị chặn bởi `maxBuffer`; stderr (cắt 2000 ký tự) và exit code/signal được log qua Nest Logger;
  - có unit test cho các trường hợp trên.
- **Controller:**
  - lỗi multer khác dung lượng (field sai tên, quá nhiều file/part, multipart hỏng) thành 400 `VALIDATION_FAILED`, `details:[{path:'file'}]`, thông điệp tiếng Việt, có integration test field sai tên;
  - multer `defParamCharset: 'utf8'` thay cho đoán latin1→utf8;
  - tên file cắt theo code point (255).
- **Admin uploader:**
  - `ref` chặn upload thứ hai khi đang chạy;
  - chấp nhận `application/x-pdf`, `application/octet-stream` hoặc type rỗng nếu đuôi là `.pdf`; `accept="application/pdf,.pdf"`;
  - live region `role="status"` luôn có mặt, thông báo "Đã tải lên N trang.";
  - XHR `timeout` 5 phút, `ontimeout` báo lỗi tiếng Việt riêng;
  - có test cho refresh thành công rồi vẫn 401 (xoá phiên, không gửi lần ba, hiện FormError).
- **README:** ghi chú `Read:<bucket>` trong `s3.json` phải khớp `S3_BUCKET_PUBLIC`.

## Spec Change Log

## Review Triage Log

Vòng review 1 (Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | Rollback khi ghi S3 lỗi giữa chừng trong `storePdf` xoá cả object đang được bản hiện hành dùng (upload lại cùng nội dung → key trùng) | high | Có thật: key chỉ phụ thuộc nội dung; nhánh catch của `storePdf` gọi `discard(written)` mà không kiểm tra tham chiếu (nhánh lỗi commit thì đã kiểm). Hậu quả: Sheet đang dùng bị hỏng ảnh | patch |
| 2 | Nhánh rollback khi ghi S3 lỗi chưa có test | medium | Verification-gap đã xác minh sẵn | patch |
| 3 | Race: hai upload cùng nội dung chạy đồng thời, một bên lỗi commit rồi xoá key dùng chung | low | Cần upload trùng + chạy đồng thời + lỗi commit; cùng loại với việc GC phải kiểm tra tham chiếu | defer (Story 1.8) |
| 4 | Lỗi của sharp thành 500 thay vì 422 | low | Có thật; sửa chỉ cần bọc vào `PdfProcessingError` | patch |
| 5 | Trang PDF quá cao/hẹp làm tràn bộ nhớ; không giới hạn số upload chạy đồng thời | low | Chỉ founder upload file của chính mình; sửa cần thêm cơ chế giới hạn | reject (low) |
| 6 | `pdftoppm` crash do signal hoặc vượt `maxBuffer` bị báo là "quá thời gian"; stderr không được log | low | Có thật; sửa trực tiếp (chỉ SIGKILL do timeout mới báo quá giờ, bỏ qua stdout, log stderr) | patch |
| 7 | Key ảnh trang theo `pdfHash` nên có thể ghi đè URL "immutable" khi renderer đổi phiên bản | low | Quy tắc key nằm trong phần frozen của spec | reject |
| 8 | Tên file bị cắt ngang cặp surrogate; decode latin1 phải đoán | low | Có thật; sửa trực tiếp (`defParamCharset: 'utf8'`, cắt theo code point) | patch |
| 9 | Uploader: thả hai file liên tiếp thì chạy hai upload | low | Có thật; sửa trực tiếp bằng ref | patch |
| 10 | Override tên bucket public mà không sửa `s3.json` thì ảnh trả 403 | low | Chỉ cần ghi chú trong README | patch |
| 11 | Lỗi multer khác (field lạ, hai file) trả thông điệp tiếng Anh, không có details | low | Có thật; sửa trực tiếp | patch |
| 12 | PDF quá dài vẫn render đủ 101 trang rồi mới từ chối | low | Chỉ ảnh hưởng hiệu năng, hiếm gặp | reject (low) |
| 13 | Request không có giới hạn thời gian tổng; XHR không có timeout | low | Có thật; sửa trực tiếp (timeout XHR + thông điệp) | patch |
| 14 | Ảnh Draft/superseded đọc được công khai; có thể liệt kê bucket public | false | Đã thử: `ListObjectsV2` ẩn danh bị 403; đọc theo URL là đúng thiết kế AD-6 | reject |
| 15 | Migration thiếu ràng buộc theo `type` (page_number, source_file_id, trang trùng) | low | Guard cho trạng thái chưa xảy ra | reject (low) |
| 16 | Kiểm tra MIME phía client quá chặt (`application/x-pdf`, `octet-stream`) | low | Có thật; sửa trực tiếp (fallback theo đuôi `.pdf`, server đã kiểm magic bytes) | patch |
| 17 | Response upload không được validate; gặp 401 thì gửi lại toàn bộ file | low | Hiếm gặp | reject (low) |
| 18 | Test 413 có thể chập chờn (EPIPE) | maybe-false | Đã chạy nhiều lần đều xanh | reject |
| 19 | Upload thành công không được thông báo cho screen reader | low | Có thật; sửa trực tiếp (live region) | patch |
| 20 | Tracking lệch (task chưa tick, Implementation Notes rỗng) | low | Có thật: task đã được đối chiếu với diff và tick ở bước này; Implementation Notes giao bổ sung | patch |
| 21 | Chưa có test cho khoá dòng khi upload đồng thời | medium | Verification-gap đã xác minh sẵn, disposition `defer` | defer |
| 22 | Nhánh "refresh xong nhưng retry vẫn 401" của upload chưa có test | low | Verification-gap đã xác minh sẵn | patch |
