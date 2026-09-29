---
title: 'Story 1.7 — Upload MIDI và MP3'
type: 'feature'
created: '2026-09-29'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'f5304c81292dc4afddd3a2e660ae7eda413f94cf'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet mới upload được PDF (Story 1.6). Founder cần upload thêm MIDI (để Epic 2 dựng MIDI player từ note-JSON, AD-7) và MP3, cùng cách gỡ một file khi upload nhầm.

**Approach:**
- Mở rộng `POST /admin/sheets/:id/files` (đã có ở Story 1.6) để nhận thêm `type=MIDI` và `type=MP3`, dùng lại toàn bộ hạ tầng `media`/`StorageService` đã có.
- **MIDI:** file gốc `.mid` lưu vùng private; `media` dùng `@tonejs/midi` parse rồi lưu note-JSON (một `SheetFile` loại `MIDI_JSON` mới, public) — không bao giờ public file `.mid` gốc (AD-7).
- **MP3:** file gốc lưu vùng private. Vì hệ thống signed-URL cho khách hàng chưa có (Epic 3), admin nghe thử qua **presigned GET URL ngắn hạn (TTL 5 phút)** sinh bởi `StorageService`, đúng tinh thần AD-6 ("chỉ phát signed URL ngắn hạn").
- **Gỡ file:** `DELETE /admin/sheets/:id/files/:type` (PDF/MIDI/MP3) đánh `superseded_at`, không xoá object S3 (dành cho cron GC ở Story 1.8, giống cách thay file đã làm ở Story 1.6).

## Boundaries & Constraints

**Always:**
- **`packages/shared/src/file.ts`:** `UPLOADABLE_FILE_TYPES` thêm `MIDI`, `MP3`. Thêm hằng: `MIDI_MAX_BYTES = 2MB`, `MP3_MAX_BYTES = 20MB` (bằng `PDF_MAX_BYTES`, đặt tên riêng để tách biệt ngữ nghĩa), `MIDI_MIME_TYPE = 'audio/midi'`, `MP3_MIME_TYPE = 'audio/mpeg'`.
  - `hasMidiMagic(bytes)`: 4 byte đầu là `MThd` (`0x4D 0x54 0x68 0x64`).
  - `hasMp3Magic(bytes)`: có tag `ID3` (`0x49 0x44 0x33`) ở đầu, HOẶC frame sync MPEG (`bytes[0] === 0xFF && (bytes[1] & 0xE0) === 0xE0`).
- **Giới hạn dung lượng theo type:** interceptor multer giữ nguyên mức trần chung `PDF_MAX_BYTES` (20MB, DoS guard). `SheetsService` kiểm dung lượng đúng theo `type` sau khi nhận file (MIDI > 2MB → 413 `FILE_TOO_LARGE` với thông điệp riêng); tránh phụ thuộc thứ tự field multipart.
- **`FileType` (Prisma + shared) thêm `MIDI_JSON`** — file dẫn xuất công khai của MIDI, đối xứng với `THUMBNAIL`/`PAGE_IMAGE` của PDF: `source_file_id` trỏ về MIDI, cùng nằm trong partial unique index nhóm "hiện hành" (mở rộng điều kiện `type IN (...)` của Story 1.6 để bao gồm `MIDI_JSON` cho mỗi sheet, không unique riêng theo `(sheet_id, type)` bắt buộc một-một — dùng đúng cơ chế `source_file_id` + supersede cùng lúc với MIDI như PDF→THUMBNAIL/PAGE_IMAGE).
- **`sheet_files` thêm 2 cột nullable:** `duration_seconds double precision`, `note_count int` — chỉ ghi cho dòng `MIDI` (từ `Midi.duration` giây và tổng `track.notes.length` mọi track), null cho type khác. Tính một lần lúc upload, không đọc lại note-JSON khi GET.
- **Xử lý MIDI (`media`):**
  1. Kiểm `hasMidiMagic`; sai → 415 `UNSUPPORTED_FILE_TYPE`.
  2. Parse bằng `new Midi(buffer)`; ném lỗi hoặc không có track nào → 422 `FILE_PROCESSING_FAILED` (không ghi object nào).
  3. Ghi file gốc vào private (`{hash}.mid`), note-JSON (`midi.toJSON()`, `JSON.stringify`) vào public (`{hash}.json`, content-type `application/json`).
  4. `recomputeDerived()`: `has_midi` = có MIDI hiện hành.
- **Xử lý MP3 (`media`):** chỉ kiểm magic bytes rồi ghi thẳng vào private (`{hash}.mp3`), không parse/transcode. `recomputeDerived()`: `has_mp3` = có MP3 hiện hành.
- **Một transaction cho mỗi lần upload** (như Story 1.6): supersede file hiện hành cùng type (và `MIDI_JSON` đi kèm khi type là MIDI), insert file mới, `recomputeDerived()`. Lỗi ở bất kỳ bước nào (parse, ghi S3, commit DB) thì không đổi DB; object đã ghi lên S3 được `discardUnreferenced` như Story 1.6 (không xoá key đang được bản hiện hành dùng).
- **Presigned URL cho MP3 (admin preview):**
  - `StorageService.presignPrivateUrl(key, ttlSeconds = 300)` dùng `@aws-sdk/s3-request-presigner` (`GetObjectCommand`), chỉ nhận key `private/`.
  - `sheetSchema.mp3.previewUrl` là presigned URL sinh **tại thời điểm trả response** (`GET`/`PATCH`/upload đều gọi `get()` cuối cùng nên tự có); không lưu DB, không tốn round-trip S3 (presign chỉ tính HMAC cục bộ).
  - Route `GET /admin/sheets/:id` (và mọi route `/admin/*`) đã qua guard JWT — presigned URL chỉ lộ ra sau khi admin đăng nhập, chấp nhận được cho preview nội bộ.
- **Gỡ file:** `DELETE /admin/sheets/:id/files/:type` (`type` = `pdf|midi|mp3`, case-insensitive qua pipe riêng). Trong một transaction: khoá Sheet (`FOR UPDATE`, dùng lại pattern của `attachPdf`), đánh `superseded_at` cho file hiện hành cùng type (và `MIDI_JSON` đi kèm nếu gỡ MIDI), `recomputeDerived()`. Không có file hiện hành cho type đó → 404 `NOT_FOUND`.
- **Response Sheet** (`sheetSchema`) thêm:
  - `midi: {originalName, size, uploadedAt, durationSeconds, noteCount, noteJsonUrl} | null`;
  - `mp3: {originalName, size, uploadedAt, previewUrl} | null`.
  - Vẫn không bao giờ trả `storageKey` hay URL private thật (chỉ presigned URL có TTL).
- **Admin:**
  - `PdfUploader` tổng quát hoá thành `SheetFileUploader` dùng chung cho PDF/MIDI/MP3 (validate theo type, message riêng), hoặc giữ `PdfUploader` và thêm `MidiUploader`/`Mp3Uploader` tái dùng cùng hook — chọn cách ít trùng lặp nhất khi code.
  - Sau khi upload MIDI: hiện thời lượng (mm:ss) và số nốt.
  - Sau khi upload MP3: `<audio controls>` trỏ `mp3.previewUrl` (presigned URL, tự hết hạn sau 5 phút — không cần xử lý hết hạn ở story này, admin reload trang để nghe lại).
  - Nút "Gỡ file" (dùng `DeleteConfirm` có sẵn) cạnh mỗi uploader khi Sheet đã có file loại đó.

**Never:**
- Không public file `.mid` hay `.mp3` gốc dưới bất kỳ hình thức nào (AD-7, AD-6).
- Không transcode/nén MP3, không validate sâu hơn magic bytes (không thêm ffmpeg).
- Không làm publish/archive/HOT hay cron GC (Story 1.8) — object superseded vẫn còn trên S3 sau story này.
- Không đổi hành vi PDF hiện có ngoài việc dùng lại interceptor/pattern.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| MIDI hợp lệ 1.5MB | `type=MIDI`, file có `MThd` | 201; `hasMidi=true`, `midi.durationSeconds>0`, `midi.noteCount>0`, `midi.noteJsonUrl` đọc được (public, `application/json`) | N/A |
| MIDI > 2MB | file 3MB | 413 `FILE_TOO_LARGE` (thông điệp riêng cho MIDI) | Không object, không dòng DB |
| MIDI sai magic bytes | file không bắt đầu `MThd` | 415 `UNSUPPORTED_FILE_TYPE` | N/A |
| MIDI có magic bytes nhưng hỏng | `MThd` + rác | 422 `FILE_PROCESSING_FAILED` | Không object |
| MP3 hợp lệ 5MB | `type=MP3`, có tag `ID3` hoặc frame sync | 201; `hasMp3=true`, `mp3.previewUrl` tải được bằng GET ẩn danh (presigned) trong 5 phút | N/A |
| MP3 > 20MB | file 21MB | 413 `FILE_TOO_LARGE` | Không object, không dòng DB |
| MP3 sai magic bytes | PNG đổi đuôi `.mp3` | 415 `UNSUPPORTED_FILE_TYPE` | N/A |
| Thay MIDI | Sheet đã có MIDI, upload MIDI mới | MIDI cũ + `MIDI_JSON` cũ superseded; chỉ 1 MIDI hiện hành | N/A |
| Gỡ MP3 đang có | `DELETE .../files/mp3` | 204; `hasMp3=false`, `mp3=null` trong GET sau đó | N/A |
| Gỡ file không tồn tại | `DELETE .../files/midi` khi chưa có MIDI | 404 `NOT_FOUND` | N/A |
| Gỡ type không hợp lệ | `DELETE .../files/png` | 400 `VALIDATION_FAILED` | N/A |
| Không có token | Bất kỳ endpoint trên | 401 | Guard global |
| Lỗi giữa chừng khi ghi S3 (MIDI) | note-JSON ghi lỗi sau khi đã ghi file gốc | Object vừa ghi (chưa được tham chiếu) bị xoá; DB không đổi | Log error |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/catalog/sheet-files.controller.ts` -- `PdfUploadInterceptor`, `decodeOriginalName`, route `POST :id/files`. Mở rộng `uploadBodySchema`/`uploadFileTypeSchema` (đã enum hoá), thêm route `DELETE :id/files/:type`.
- `apps/api/src/modules/catalog/sheets.service.ts` -- `attachPdf`, `discardUnreferenced`, `SELECT`/`toSheet`, `fileRow`. Cần tổng quát `attachPdf` → `attachFile(id, type, upload)` dùng chung transaction/khoá/rollback pattern; thêm `removeFile(id, type)`.
- `apps/api/src/modules/media/{storage.service,sheet-media.service,pdf-processor}.ts` -- `StorageService.put{Public,Private}`, `zoneOf`, `deleteObjects`; `SheetMediaService.storePdf`, `StorageWriteError`, `sheetKey`. Thêm `storeMidi`, `storeMp3`, `presignPrivateUrl`.
- `apps/api/prisma/schema.prisma` + migration `20260929120000_sheet_files` -- enum `FileType`, bảng `sheet_files`, partial unique index SQL tay (`sheet_files_current_source_key`, điều kiện `type IN ('PDF','MIDI','MP3')`).
- `packages/shared/src/{file,sheet,errors}.ts` -- `FileType`, `UPLOADABLE_FILE_TYPES`, `hasPdfMagic`, `PDF_MAX_BYTES`; `sheetSchema`, `sheetPdfSchema`, `sheetPageSchema`.
- `apps/admin/src/lib/api/upload.ts` -- `uploadSheetFile(sheetId, file, onProgress, {type, signal})` đã nhận `type: UploadableFileType` sẵn, không cần sửa.
- `apps/admin/src/components/sheets/pdf-uploader.tsx` (+ test) -- mẫu uploader kéo-thả, validate client, live region; `apps/admin/src/components/taxonomy/delete-confirm.tsx` -- mẫu nút xoá 2 bước.
- `apps/api/test/fixtures/pdf.ts`, `apps/api/test/integration/sheet-files.spec.ts` -- mẫu fixture sinh code và integration test (login, TRUNCATE, spy `StorageService`).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/file.ts` (+spec) -- thêm `MIDI`, `MP3` vào `UPLOADABLE_FILE_TYPES`; `MIDI_MAX_BYTES`, `MP3_MAX_BYTES`, `MIDI_MIME_TYPE`, `MP3_MIME_TYPE`, `hasMidiMagic`, `hasMp3Magic`, thông điệp lỗi riêng cho từng type -- hợp đồng.
- [x] `packages/shared/src/sheet.ts` (+spec) -- `sheetMidiSchema`, `sheetMp3Schema`; `sheetSchema` thêm `midi`, `mp3`; `removeFileTypeSchema` (`pdf|midi|mp3`, lowercase) -- hợp đồng.
- [x] `apps/api/prisma/schema.prisma` + migration `<ts>_sheet_files_midi_mp3` -- thêm `MIDI_JSON` vào enum `FileType`; cột `duration_seconds`, `note_count` trên `sheet_files`; mở rộng điều kiện partial unique index để gồm `MIDI_JSON` -- AD-1, AD-16.
- [x] `apps/api/src/modules/media/sheet-media.service.ts` -- `storeMidi(sheetId, upload)` (parse `@tonejs/midi`, ném `PdfProcessingError`-style riêng khi hỏng, ghi gốc + note-JSON, trả `duration`/`noteCount`); `storeMp3(sheetId, upload)` (ghi thẳng, kiểm magic bytes trước khi gọi service) -- xử lý.
- [x] `apps/api/src/modules/media/storage.service.ts` -- `presignPrivateUrl(key, ttlSeconds)` bằng `@aws-sdk/s3-request-presigner` -- preview MP3.
- [x] `apps/api/src/modules/catalog/sheets.service.ts` -- tổng quát `attachPdf` thành `attachFile` dùng chung cho 3 type (validate dung lượng theo type, gọi đúng hàm `media`, supersede đúng nhóm file kèm theo); `removeFile(id, type)` (khoá, supersede, recompute, 404 nếu không có); mở rộng `SELECT`/`toSheet` để trả `midi`/`mp3` (dùng `presignPrivateUrl` cho `mp3.previewUrl`, `publicUrl` cho `midi.noteJsonUrl`) -- nghiệp vụ.
- [x] `apps/api/src/modules/catalog/sheet-files.controller.ts` -- validate dung lượng theo type sau khi nhận file (413 nếu vượt); route `DELETE :id/files/:type` -- endpoint.
- [x] `apps/api/test/fixtures/midi.ts` -- sinh MIDI hợp lệ tối thiểu bằng code (không cần `@tonejs/midi` để tạo, viết tay theo chuẩn MIDI file format: header `MThd` + một track `MTrk` có vài note-on/note-off) -- fixture.
- [x] `apps/api/test/integration/sheet-files.spec.ts` (mở rộng) + unit test cho `storeMidi`/`hasMidiMagic`/`hasMp3Magic` -- phủ toàn bộ I/O matrix trên Postgres + SeaweedFS thật -- AC.
- [x] `apps/admin/src/components/sheets/{midi-uploader,mp3-uploader}.tsx` (+ test), tái dùng logic chung với `pdf-uploader.tsx` (tách hook/helper nếu hợp lý) -- hiện thời lượng/số nốt (MIDI), `<audio>` player (MP3), nút "Gỡ file" bằng `DeleteConfirm` -- UX-DR19.
- [x] `apps/admin/src/lib/api/sheets.ts` -- `sheetsApi.removeFile(sheetId, type)` gọi `apiFetch` -- API client.
- [x] `apps/admin/src/components/sheets/sheet-editor.tsx` -- gắn `MidiUploader`, `Mp3Uploader` cạnh `PdfUploader` -- lắp ráp.

**Acceptance Criteria:**
- Given stack chạy bằng `docker compose up -d --build --wait` và đã đăng nhập admin, when upload MIDI rồi MP3 cho một Sheet, then thấy thời lượng/số nốt của MIDI và nghe được MP3 bằng player trong form; gỡ MP3 thì player biến mất và `hasMp3=false`.
- Given `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh.

## Design Notes

- **`MIDI_JSON` không phải type upload được** (`UPLOADABLE_FILE_TYPES` không chứa nó) — chỉ `media` tạo ra, giống `THUMBNAIL`/`PAGE_IMAGE`.
- **Gỡ file không xoá S3 ngay:** nhất quán với cách "thay file" của Story 1.6 (superseded, GC dọn ở Story 1.8). Tránh hai chính sách xoá khác nhau trong cùng module.
- **Presigned URL không lưu DB:** tính lại mỗi lần GET nên luôn còn hạn khi trả về; admin để tab mở quá 5 phút thì bấm play lỗi — chấp nhận được cho preview nội bộ, ghi chú trong Implementation Notes nếu cần UX tốt hơn sau này (không thuộc phạm vi story).

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0
- `docker compose up -d --build --wait`, đăng nhập, `curl -F type=MIDI -F file=@<mid> localhost:4000/admin/sheets/<id>/files -H "Authorization: Bearer …"` -- expected: 201, `midi.noteCount>0`; `curl -I <midi.noteJsonUrl>` trả 200 `application/json`
- `curl -F type=MP3 -F file=@<mp3> ...` rồi `curl -I <mp3.previewUrl>` -- expected: 200, phát được audio (`Content-Type: audio/mpeg`)

**Manual checks:**
- Trình duyệt: trang sửa Sheet, upload MIDI (xem thời lượng/số nốt), upload MP3 (bấm play), gỡ từng file.

## Implementation Notes

**Quyết định và điểm lệch khỏi spec:**
- **Migration `MIDI_JSON` tách làm 2 file:** Postgres từ chối dùng một giá trị enum mới trong CÙNG transaction đã `ALTER TYPE … ADD VALUE` nó (trừ khi type cũng được `CREATE` trong transaction đó) — xác minh trực tiếp trên Postgres 18 (`unsafe use of new value`). Vì `prisma migrate deploy` chạy mỗi migration trong một transaction riêng, tách thành `20260929121000_sheet_file_type_midi_json` (chỉ `ADD VALUE`) rồi `20260929121500_sheet_files_midi_mp3` (cột + partial unique index dùng `MIDI_JSON`). Đã áp cho cả DB dev và test, `prisma generate` lại để enum shared khớp Prisma (`sheet-enums.spec.ts` xanh).
- **Trần cứng multer dùng chung cho mọi type (`UPLOAD_HARD_LIMIT_MESSAGE`):** thông điệp 413 ở tầng interceptor đổi từ `PDF_TOO_LARGE_MESSAGE` sang thông điệp trung tính (không còn nói "File PDF" khi thực ra đang upload MP3/MIDI vượt trần). `SheetsService.validateUpload` vẫn kiểm chính xác theo `type` sau khi nhận đủ file (MIDI 2MB có thông điệp riêng; MP3 trùng 20MB với trần cứng nên phần lớn bị chặn ngay ở multer, tầng service vẫn kiểm để không phụ thuộc thứ tự field).
- **`@tonejs/midi` ném giá trị không phải `Error`** (chuỗi thô) khi file hỏng — `storeMidi` bọc mọi throw (kể cả non-Error) thành `MidiProcessingError`. File "không có track nào" (`ntrks=0`, không có `MTrk`) khiến `Header` constructor của thư viện tự ném `TypeError` khi dựng `Midi` (không trả `tracks: []` như có thể suy ra từ câu chữ spec) — đã xác minh bằng script thủ công; vẫn giữ thêm kiểm `tracks.length === 0` sau khi parse thành công để đúng tinh thần spec dù nhánh này hiện không có input nào chạm tới với thư viện bản 2.0.28.
- **`toSheet` trở thành async:** `presignPrivateUrl` (dùng `@aws-sdk/s3-request-presigner`) trả `Promise<string>` dù chỉ tính HMAC cục bộ (không round-trip S3, theo đúng thiết kế). Mọi call site (`get`/`create`/`update`/`attachFile`) đổi thành `await toSheet(...)`.
- **`UploadedPdf`/`PdfUpload` đổi tên thành `UploadedSheetFile`/`MediaUpload`** (dùng chung PDF/MIDI/MP3); giữ `export type PdfUpload = MediaUpload` (deprecated alias) phòng import cũ còn sót — hiện không còn nơi nào dùng.
- **`attachPdf` tổng quát thành `attachFile(id, type, upload)`**, `SUPERSEDE_GROUPS`/`MAGIC_CHECK`/`WRONG_TYPE_MESSAGE`/`TOO_LARGE_MESSAGE`/`MAX_BYTES` là các `Record<UploadableFileType, …>` tra theo `type` — tránh nhánh `if/else` lặp lại cho PDF/MIDI/MP3.
- **`DELETE :id/files/:type` trả 204 rỗng** (không trả `Sheet`) — admin tự cập nhật state cục bộ (spread `hasX:false, x:null`) thay vì gọi lại GET, khớp AC "gỡ MP3 thì player biến mất ngay".
- **Admin — tách `useSheetFileUpload`** (kéo-thả/tiến trình/huỷ/chặn double-drop) từ `PdfUploader` để `MidiUploader`/`Mp3Uploader` dùng chung mà không sửa `PdfUploader` (giảm rủi ro hồi quy trên Story 1.6). Do `uploading` và `progress` giờ đến từ hook riêng (không còn cùng scope để TS narrow theo "aliased condition"), các nhánh hiển thị progress/status dùng thẳng `progress !== null` thay vì biến `uploading` đã tính sẵn.
- **`MidiUploader`/`Mp3Uploader` gỡ file:** lỗi hiện qua `FormError` riêng (không dùng chung ô lỗi upload), theo đúng pattern `onDelete` có sẵn ở `genre-form.tsx` (bắt lỗi nội bộ, không throw lại để `DeleteConfirm` luôn reset trạng thái `confirming/busy`).
- **Test:** `apps/api/test/fixtures/midi.ts` viết tay theo chuẩn SMF (VLQ delta-time, `Set Tempo` 120bpm cho duration xác định); có `corruptMidi()` (magic đúng, thân rác) và `midiWithNoTracks()` (`ntrks=0`). `apps/api/test/unit/sheet-media.spec.ts` test `storeMidi`/`storeMp3` với `StorageService` giả (không đụng S3 thật); `packages/shared/src/file.spec.ts` test `hasMidiMagic`/`hasMp3Magic`. `apps/api/test/integration/sheet-files.spec.ts` mở rộng phủ toàn bộ I/O matrix (MIDI, MP3, DELETE) trên Postgres + SeaweedFS thật; ca `type=MIDI -> 400` cũ (Story 1.6) đổi thành `type=PNG`/`type=MIDI_JSON` vì MIDI nay là type hợp lệ.
- **Toàn bộ `pnpm build && pnpm typecheck && pnpm lint && pnpm test`** chạy xanh (Turborepo, cả 5 package) với stack Docker thật (`postgres`, `postgres-test`, `seaweedfs`) đang chạy sẵn.

**Chưa làm / rủi ro còn lại:**
- Chưa chạy `bmad-review` (Review Triage Log dưới đây còn rỗng) — nên chạy một vòng review độc lập trước khi coi story là "done".
- Manual check qua trình duyệt thật (`docker compose up -d --build --wait`, upload MIDI/MP3 qua UI, bấm play, gỡ file) chưa được thực hiện trong phiên này; chỉ có test tự động (unit + integration + component test admin) xác nhận hành vi.
- `noteJsonUrl`/`previewUrl` không lưu DB nên khi seed (Story 1.9) sinh dữ liệu mẫu MIDI/MP3, cần đảm bảo Sheet mẫu đi qua đúng `attachFile` (đã ghi trong epic context) — story này không đụng seed.

## Spec Change Log

## Review Triage Log

Vòng review 1 (tự kiểm bằng tay trên Docker + Blind Hunter, Edge Case Hunter, Verification Gap).

| # | Phát hiện | Verdict | Bằng chứng | Route |
|---|---|---|---|---|
| 1 | `presignPrivateUrl` dùng client S3 cấu hình `S3_ENDPOINT` nội bộ (`http://seaweedfs:8333`), nên `mp3.previewUrl` trả về host `seaweedfs` mà trình duyệt của admin không phân giải được | high | Tự kiểm bằng tay: upload MP3 qua Docker, `mp3.previewUrl` bắt đầu bằng `http://seaweedfs:8333/...`; `curl` từ host tới URL này timeout/connection refused. Nghe thử MP3 trong admin hỏng hoàn toàn ở mọi máy dev | patch |
| 2 | 4 chỗ gọi `toSheet(...)` (nay là async) không có `await` trước `return`, khiến các catch bao quanh (đặc biệt trong `attachFile`) không bắt được lỗi presign | medium | Đúng theo ngữ nghĩa JS: `return <promise>` thoát khỏi try/catch trước khi promise settle. Hệ quả trong `attachFile`: bỏ qua dòng log lỗi (không ảnh hưởng tính đúng đắn của rollback vì key lúc đó đã được DB tham chiếu, `discardUnreferenced` vẫn giữ đúng) | patch |
| 3 | `removeMidi`/`removeMp3` đóng gói state mới bằng cách spread prop `sheet` đang render (có thể cũ), nên nếu một uploader khác vừa cập nhật `sheet` trong lúc DELETE còn đang chạy thì bản cập nhật đó bị ghi đè mất | medium | Có thật: `sheet-editor.tsx` truyền thẳng `setSheet` (React state setter) làm `onUploaded`; `removeMidi`/`removeMp3` gọi `onUploaded({...sheet, ...})` thay vì dùng dạng hàm cập nhật | patch |
| 4 | `hasMidi`/`midi` có thể lệch nếu dòng `MIDI_JSON` mất mà `MIDI` còn (hỏng dữ liệu, lỗi GC tương lai) | low | Hiện không thể xảy ra: cả hai được ghi/supersede cùng một transaction. Chỉ là rủi ro cho Story 1.8 (GC) nếu không tôn trọng cặp này | defer (Story 1.8) |
| 5 | Cột `duration_seconds`/`note_count` không có ràng buộc DB rằng chỉ MIDI mới được ghi | low | Chỉ là quy ước ở tầng code (`fileRow`), đã nhất quán ở mọi nơi ghi hiện tại | reject (low) |
| 6 | `storeMidi` khi `@tonejs/midi` ném lỗi không phải string thì bỏ qua message/stack gốc | low | Có thật; sửa rẻ (`{cause: err}` giống `StorageWriteError` đã dùng) | patch |
| 7 | `storeByType` dùng if/else ngầm định thay vì switch/map tường minh như các bảng `Record<UploadableFileType,...>` ngay phía trên | low | Đúng, nhưng `UploadableFileType` đã đóng (3 giá trị, không đổi trong story này); sửa rẻ | patch |
| 8 | Không có test khẳng định TTL thật của presigned URL (chỉ test tải ngay sau khi cấp) | medium | Có thể assert tĩnh: query string của presigned URL chứa `X-Amz-Expires=300`, không cần chờ 5 phút thật | patch |
| 9 | Không có test ở đúng biên `MIDI_MAX_BYTES`/`MP3_MAX_BYTES` (chỉ test vượt ngưỡng) | low | Có thật; sửa rẻ (buffer đúng N byte phải qua, N+1 byte phải lỗi) | patch |
| 10 | MIDI có track nhưng 0 note vẫn được chấp nhận (`noteCount=0`) | false | Không vi phạm I/O matrix (frozen) của story; một file chỉ có tempo/meta vẫn là MIDI hợp lệ, từ chối sẽ quá khắt khe | reject |
| 11 | `presignPrivateUrl` ném `Error` thường thay vì `AppException` khi key không phải private | false | Nhất quán với `publicUrl()` đã có từ trước (cùng file, cùng kiểu guard cho lỗi lập trình) | reject |
| 12 | Tên file spec thiếu dấu ("va" thay vì "và") | false | Đúng quy ước đã thống nhất trước đó: tên file story không dấu (ASCII) trên toàn dự án | reject |
| 13 | Giới hạn dung lượng lặp lại ở 3 tầng (client, interceptor, service) | false | Đúng như spec (frozen) đã giải thích lý do: interceptor giữ trần chung để tránh phụ thuộc thứ tự field multipart, service kiểm chính xác theo type | reject |
| 14 | `<audio>` không có `onError` khi presigned URL hết hạn (5 phút) | false | Spec (Design Notes) đã ghi rõ đây là điều chấp nhận được, ngoài phạm vi story | reject |
| 15 | Chưa chạy review độc lập, chưa kiểm tay trên trình duyệt thật | n/a | Review độc lập đang chạy ở bước này; kiểm tay trên trình duyệt do người dùng thực hiện sau khi lỗi #1 được sửa | n/a |
| 16 | carried — Presigned URL dùng endpoint S3 nội bộ, trình duyệt admin không truy cập được | high | carried: cùng claim và vị trí với #1; evidence cũ vẫn ghi nhận URL `seaweedfs:8333`, chưa có thay đổi khắc phục trong working tree | patch |
| 17 | carried — Xóa MIDI/MP3 có thể ghi đè state mới hơn từ uploader khác | medium | carried: cùng claim với #3; hai hàm xóa vẫn spread prop `sheet` của render hiện tại | patch |
| 18 | Multer giới hạn dung lượng có thể lọt thành 500 thay vì 413 | false | Integration test ở `apps/api/test/integration/sheet-files.spec.ts` gửi MP3 vượt 20MB và khẳng định phản hồi là 413 với mã `FILE_TOO_LARGE`; interceptor bắt `PayloadTooLargeException` từ đường xử lý upload của Nest | reject |
| 19 | carried — `toSheet()` không được await trong nhánh trả kết quả upload | medium | carried: cùng claim với #2; các call site vẫn trả Promise trực tiếp theo mô tả cũ | patch |
| 20 | carried — Lỗi MIDI không phải string làm mất nguyên nhân gốc | low | carried: cùng claim với #6; cần giữ nguyên verdict và route của lần triage trước | patch |
| 21 | carried — Schema xóa file nhận chữ thường còn pipe chuẩn hóa chữ hoa/thường | false | carried: cùng claim với #7; pipe vẫn gọi `toLowerCase()` trước khi parse schema | reject |
| 22 | carried — MP3 vượt 20MB có thể nhận thông điệp chung từ interceptor | false | carried: cùng claim với #13; trần cứng chung và message trung tính được ghi rõ trong Implementation Notes | reject |
| 23 | carried — Chưa có assertion TTL 300 giây của presigned URL | medium | carried: cùng claim với #8; test vẫn chỉ kiểm chữ ký và tải URL ngay | patch |
| 24 | carried — Chưa kiểm tra đúng biên dung lượng MIDI/MP3 | low | carried: cùng claim với #9; test vẫn chỉ kiểm trường hợp vượt ngưỡng | patch |
| 25 | Code Map mô tả gộp migration enum và index, trong khi implementation tách thành hai migration | false | Implementation Notes đã ghi chính xác hai migration và lý do tách; code map là tham chiếu ban đầu, không làm sai lệch hành vi hoặc thứ tự migration hiện tại | reject |
| 26 | carried — Presigned URL dùng endpoint S3 nội bộ, trình duyệt admin không truy cập được | high | carried: edge-case reviewer nêu lại claim #1 tại cùng `storage.service.ts`; evidence cũ vẫn áp dụng | patch |
| 27 | carried — Chưa có assertion TTL 300 giây của presigned URL | medium | carried: verification-gap reviewer nêu lại claim #8; test hiện tại chưa assert `X-Amz-Expires=300` | patch |
