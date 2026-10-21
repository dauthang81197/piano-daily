---
title: 'Admin import Sheet hàng loạt: danh sách PDF → MIDI → tạo Sheet, chạy nền, có bảng theo dõi job'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_commit: 'f8f6d7b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-chuyen-pdf-sang-midi.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-nguoi-dung-dang-sheet.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Admin muốn nhập nhiều bản nhạc một lúc. Hiện phải tạo từng Sheet, tải PDF, tự làm MIDI rồi tải lên, rất lâu.

**Approach:** Ở admin thêm trang **Import hàng loạt**. Admin chọn nhiều PDF một lần; hệ thống tạo một **đợt import (batch)** gồm các **dòng (item)**, mỗi dòng một PDF. Một worker chạy nền trong API xử lý lần lượt từng dòng: gọi `musicscore` đổi PDF sang MIDI, tạo Sheet (tiêu đề lấy từ tên file, **Level mặc định `INTERMEDIATE`**), đính PDF và MIDI qua `SheetsService` (nên có thumbnail, trang, note-JSON như upload thường). Hai bảng DB riêng (`sheet_import_batches`, `sheet_import_items`) là nguồn sự thật: admin đóng trình duyệt vẫn chạy tiếp, mở lại trang là thấy đợt nào chạy đến đâu, file nào xong/lỗi/đang chạy, kèm link sang Sheet đã tạo.

## Boundaries & Constraints

**Always:**
- Chỉ ADMIN (guard admin hiện có). Mọi route dưới `/admin/sheet-imports*`.
- Tạo đợt = upload nhiều PDF (multipart, tối đa `IMPORT_MAX_FILES` = 50 file/đợt, mỗi file ≤ giới hạn PDF hiện có, kiểm magic bytes). PDF lưu **private** (`private/imports/{batchId}/{itemId}.pdf`) để sống qua khởi động lại; xoá sau khi dòng xong (DONE) hoặc khi xoá đợt. File sai loại/quá lớn bị từ chối ngay từ đầu cho từng file (báo rõ tên file), các file hợp lệ vẫn tạo dòng.
- Trạng thái dòng: `PENDING` → `PROCESSING` → `DONE` | `FAILED` | `CANCELLED`; ghi `step` hiện tại (`CONVERTING` → `CREATING` → `ATTACHING`), `attempts`, `errorCode`/`errorMessage`, `sheetId`, `startedAt`, `finishedAt`. Trạng thái đợt tính từ các dòng (đang chạy / xong / xong có lỗi / đã huỷ) và có các bộ đếm.
- Mặc định mỗi Sheet: `level = INTERMEDIATE`, `status = DRAFT` (admin xem rồi đăng; có tuỳ chọn "Đăng luôn" khi tạo đợt, mặc định tắt), không giá/HOT/Series, `isFree = false` như Sheet admin tạo tay. Tiêu đề = tên file bỏ đuôi, `_`/`-` thành khoảng trắng, cắt gọn; Tác giả mặc định: Composer **"Chưa rõ"** (tìm hoặc tạo, vì Composer là bắt buộc). Admin đổi được Level mặc định, Tác giả, Thể loại, "Đăng luôn" ở cấp đợt trước khi bấm bắt đầu; sửa từng Sheet sau bằng trang sửa Sheet sẵn có.
- Worker: một vòng nền trong tiến trình API, lấy dòng `PENDING` cũ nhất bằng `FOR UPDATE SKIP LOCKED`, chạy tối đa `IMPORT_CONCURRENCY` (mặc định 1) dòng cùng lúc, dùng lại `MusicscoreClient` (không vượt `SCORE_MAX_CONCURRENT`). Lỗi `musicscore` tạm thời (`unavailable`) thử lại tối đa 2 lần rồi `FAILED`; `unreadable` (PDF không nhận dạng được nốt) → `FAILED` ngay. Khi khởi động lại, dòng `PROCESSING` dở dang quay về `PENDING` (PDF còn trong kho) và tính một lần thử.
- Không để rác: nếu bước tạo/đính file lỗi giữa chừng, Sheet vừa tạo bị xoá lại (dòng ghi lỗi, không để Sheet nửa vời); không trùng khi thử lại (kiểm `sheetId` đã có thì tiếp tục từ bước còn thiếu).
- Admin thao tác trên đợt: xem tiến độ (tự làm mới khi còn dòng chạy), **thử lại** dòng lỗi, **huỷ** dòng chưa chạy / cả đợt, **xoá** đợt đã xong (không xoá Sheet đã tạo). Danh sách đợt có phân trang.
- Giao diện admin: mục "Import" trong sidebar (hoặc nút trên trang Sheet), trang tạo đợt (chọn nhiều file/kéo thả, cấu hình mặc định, tiến trình tải lên từng file), trang chi tiết đợt dạng bảng (tên file, trạng thái + bước, số lần thử, lỗi bằng chữ, link Sheet), thanh tiến độ tổng `x/N`. Chữ tiếng Việt, AA, không tràn ngang.
- Bảo vệ: throttle route tải lên; không log nội dung file; `MUSICSCORE_URL` chưa cấu hình thì tạo đợt báo `FEATURE_DISABLED` rõ ràng.

**Never:** Chạy trên luồng khách; tự đăng công khai khi admin không chọn; ghi đè Sheet có sẵn (trùng tên chỉ tạo slug mới theo quy tắc slug hiện có); thêm thư viện hay hàng đợi ngoài (Redis/BullMQ); đổi hợp đồng `/admin/sheets*` hiện có.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Đợt 5 PDF hợp lệ | Chọn 5 PDF, mặc định | 1 đợt, 5 dòng `PENDING`; lần lượt `PROCESSING`→`DONE`; 5 Sheet `DRAFT`, Level Trung cấp, có PDF + MIDI | — |
| PDF không có nốt | PDF scan mờ | Dòng `FAILED` (`SCORE_UNREADABLE`), không tạo Sheet, các dòng khác vẫn chạy | Báo chữ, nút Thử lại |
| musicscore sập | Dịch vụ tắt giữa đợt | Dòng thử lại 2 lần rồi `FAILED` (`SCORE_UNAVAILABLE`); đợt "xong có lỗi" | Thử lại sau khi dịch vụ lên |
| API khởi động lại | Đang `PROCESSING` | Về `PENDING`, chạy tiếp, không tạo Sheet trùng | — |
| File sai loại / quá lớn / >50 file | Trộn file | File lỗi bị liệt kê và từ chối, file đúng vẫn nhập | 400 kèm danh sách từng file |
| Huỷ giữa đợt | Admin bấm Huỷ | Dòng `PENDING` → `CANCELLED`; dòng đang chạy chạy nốt | — |
| Tên file trùng nhau | `A.pdf` hai lần | Hai Sheet, slug khác nhau | — |
| Admin đóng trình duyệt | Đang chạy | Job vẫn chạy; mở lại thấy đúng tiến độ | — |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration mới: `sheet_import_batches` (id, createdBy, mặc định level/composerId/genreIds/publish, status tính từ dòng, createdAt), `sheet_import_items` (batchId FK cascade, originalName, storageKey, status, step, attempts, errorCode/message, sheetId FK SET NULL, startedAt, finishedAt, thứ tự).
- `apps/api/src/modules/imports/*` (module mới): service, worker (vòng nền + khôi phục lúc khởi động), controller `/admin/sheet-imports`, đăng ký trong `AppModule`; dùng `SheetsService`, `MusicscoreClient` (export từ `ScoresModule`), `StorageService`.
- `packages/shared/src/sheet-import.ts` (+spec): schema/DTO, trạng thái, mã lỗi, tên-file→tiêu đề; env `IMPORT_MAX_FILES`, `IMPORT_CONCURRENCY`.
- `apps/admin/src/app/(admin)/imports/*`, `components/imports/*`, sidebar; test hook/component.
- Test: unit (tên file→tiêu đề, trạng thái đợt), integration Postgres + SeaweedFS với `MusicscoreClient` giả (thành công, unreadable, unavailable→retry, khôi phục khởi động, huỷ, thử lại, dọn khi lỗi).

## Verification

**Commands:** `pnpm lint && pnpm typecheck`; `pnpm --filter @piano-daily/api test` + integration; `pnpm --filter @piano-daily/admin test`; `prisma migrate diff --exit-code`; Playwright chạy thật với `musicscore` local (MusicXML/PDF) chụp màn hình tạo đợt và bảng tiến độ.

**Manual checks:** thử PDF thật qua Audiveris (chưa kiểm được ở local), tắt `musicscore` giữa đợt, restart API giữa đợt.

## Ghi chú triển khai

- API tách hai bước để có tiến trình và lỗi theo từng file: `POST /admin/sheet-imports` (cấu hình đợt, trả đợt rỗng) rồi `POST /admin/sheet-imports/:id/files` cho từng PDF. Worker bắt đầu chạy ngay khi file đầu vào, không đợi hết file.
- "Đăng luôn" đặt thêm `isFree = true`: Sheet công khai bắt buộc miễn phí hoặc có giá, mà import không đặt giá. Bản nháp giữ `isFree = false` như Sheet admin tạo tay.
- Khôi phục sau khi API chết giữa chừng: dòng `PROCESSING` về `PENDING`; khi chạy lại, nếu còn Sheet dở thì xoá đi rồi làm từ đầu (thay cho "tiếp tục từ bước còn thiếu") để không trùng. Có một cửa sổ rất hẹp giữa lúc tạo Sheet và ghi `sheetId` vào dòng, nếu chết đúng lúc đó sẽ còn một bản nháp mồ côi (không hiển thị công khai).
- Dòng `FAILED` giữ PDF tạm để Thử lại; PDF chỉ bị xoá khi dòng DONE, bị huỷ hoặc đợt bị xoá.
- Kiểm chứng: integration (Postgres + SeaweedFS, musicscore giả) 12 test; admin 6 test; chạy tay admin + API + worker + musicscore giả (OCR 4 giây, một file lỗi) ở 1280px và 390px, không tràn ngang. Chưa kiểm PDF thật qua Audiveris.
