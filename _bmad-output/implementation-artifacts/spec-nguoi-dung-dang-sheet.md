---
title: 'Người dùng đăng bản nhạc (Sheet): trang "Bản nhạc của tôi", đăng giống admin'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_commit: 'f86e5d4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-chuyen-pdf-sang-midi.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-catalog-sidebar-full-width.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chỉ admin mới đăng được Sheet (form + upload PDF/MIDI/MP3 ở `apps/admin`, API `/admin/sheets*`). Founder muốn khách đã đăng nhập cũng đăng bản nhạc được, với quy trình tương tự admin.

**Approach (đã chốt với founder):** Thêm luồng đăng cho khách đã đăng nhập. Bài đăng **công khai ngay** (admin gỡ/ẩn sau), **không giới hạn ngoài việc phải đăng nhập** (không cần xác minh email, không hạn mức, không tick bản quyền), **luôn miễn phí** (không nhập giá, không HOT). Khách nhập: PDF (bắt buộc), tiêu đề, độ khó (Level), thể loại, tác giả (chọn có sẵn hoặc gõ tên mới), cùng MIDI, MP3, video YouTube, lời và hợp âm, mô tả, phụ đề, điểm độ khó. Khách quản lý bài của mình ở trang **"Bản nhạc của tôi"** (danh sách, trạng thái, sửa, đổi file, xoá); tên người đăng hiện trên trang bài công khai. Dùng lại tối đa `SheetsService` (tạo, sửa, đính/gỡ file, đổi trạng thái, xoá) và pipeline PDF/MIDI/MP3 sẵn có; chỉ thêm quyền sở hữu, lớp API riêng cho khách và giao diện. Admin thấy người đăng và gỡ bài được ở trang quản trị hiện có.

## Boundaries & Constraints

**Always:**
- Mọi route của khách yêu cầu `CustomerAuthGuard` (tài khoản còn hoạt động), thao tác chỉ trên bài của chính mình (`uploaderId = customer.id`; bài của người khác hoặc không tồn tại → `404`); bài do admin tạo (không có `uploaderId`) khách không đụng tới được.
- Bài của khách luôn `isFree = true`, không giá (`price*Cents = null`), `isHot = false`, không gán Series; khách không đặt được các trường này kể cả khi cố gửi (schema chặt `strictObject`, trường lạ → `400`).
- Đăng ở hai bước như admin: tạo bản nháp (JSON) rồi tải file (multipart) rồi **Đăng** (chuyển `PUBLISHED`, cần PDF đã xử lý xong). Bản nháp chưa đăng không công khai. Khách có thể **gỡ** bài về nháp (`DRAFT`) và đăng lại; xoá bài do khách thực hiện qua cùng logic `remove` của admin (xoá hẳn nếu chưa có đơn/tải, ngược lại lưu trữ `ARCHIVED`), file được dọn như hiện nay.
- Dùng lại nguyên các kiểm tra của admin: loại file bằng magic bytes, giới hạn dung lượng, PDF tối đa số trang hiện có, MIDI ≤ 2MB, MP3 đúng định dạng, YouTube chuẩn hoá, slug duy nhất, Genre/Composer phải tồn tại.
- Tác giả: chọn từ danh sách (`composerId`) HOẶC `composerName` mới (không cả hai); tên mới được chuẩn hoá (cắt khoảng trắng, 1–100 ký tự), tìm Composer trùng (không phân biệt hoa thường/dấu) và dùng lại, không thì tạo mới. Thể loại chỉ chọn từ danh sách có sẵn (không tạo Genre mới).
- Admin: bài của khách luôn xem/sửa/ẩn/xoá được như mọi bài; danh sách và chi tiết admin hiện **người đăng** (tên + email), lọc được "do người dùng đăng"; admin gỡ bài thì khách thấy trạng thái đã bị gỡ (`ARCHIVED`) và không đăng lại được cho tới khi admin trả về.
- Xoá tài khoản khách không xoá bài: `uploaderId` về `null` (bài thành "của hệ thống", hiển thị không tên người đăng).
- Công khai: trang chi tiết Sheet hiện "Đăng bởi {tên}" khi có người đăng (dùng tên hiển thị của khách; không email); danh sách, tìm kiếm, sitemap, JSON-LD, cache tag, revalidate hoạt động như mọi bài; nút Tải ở bài của khách như Sheet miễn phí (đăng nhập để tải).
- Giữ lớp bảo vệ kỹ thuật tối thiểu (không phải hạn mức nghiệp vụ): throttle theo IP cho tạo/tải file/đăng; không log nội dung file; không tin tên/Content-Type do client gửi.
- Giao diện: i18n vi/en, `Card`/`Button`/`EmptyState`, focus ring, vùng chạm ≥ 44px, AA, reduced-motion, không tràn ngang ở 390/768/1280px; upload file có tiến trình (% tải lên) và báo lỗi từng file bằng chữ.

**Never:** Cho khách đặt giá, HOT, Series, trạng thái ngoài `DRAFT/PUBLISHED`; sửa hay xoá bài của người khác hoặc bài admin; lộ email người đăng; đổi hợp đồng các route `/admin/*` hiện có (chỉ thêm trường đọc); thêm thư viện; làm thanh toán/chia doanh thu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chưa đăng nhập | Mở `/my-sheets` hoặc gọi API | Mời đăng nhập (web) / `401` (API) | N/A |
| Đăng đủ | Form hợp lệ + PDF | Tạo nháp, tải PDF (có tiến trình), bấm Đăng → bài công khai ngay, chuyển tới trang bài | Lỗi từng bước báo rõ, bản nháp giữ lại để làm tiếp |
| Thiếu PDF khi đăng | Nháp chưa có PDF | Nút Đăng bị vô hiệu / API `409`-`422` kèm lý do | N/A |
| Tác giả mới | `composerName` = "Nguyễn A" | Tạo Composer (hoặc dùng lại bản trùng tên) | Tên rỗng/quá dài → `400` |
| Trường cấm | Gửi `isHot`, `price*`, `seriesId`, `status` lạ | `400` (schema chặt) | N/A |
| File sai loại/quá lớn | Đổi đuôi, vượt dung lượng, PDF hỏng | `415`/`413`/`422` như admin; không để object mồ côi | Dọn như hiện nay |
| Sửa bài đã đăng | Đổi tiêu đề/thể loại/file | Áp dụng ngay (đang công khai), revalidate cache | Lỗi giữa chừng không hỏng bản đang công khai |
| Gỡ về nháp / đăng lại | Khách bấm | Chuyển `DRAFT` / `PUBLISHED` (cần PDF) | Admin đã `ARCHIVED` thì khách không đăng lại được (`403`) |
| Xoá | Khách xoá | Như `remove` của admin (xoá hẳn hoặc lưu trữ nếu đã có đơn/tải) | N/A |
| Bài người khác | id lạ/của người khác/của admin | `404` | N/A |
| Admin gỡ bài của khách | Admin `ARCHIVED` | Biến khỏi công khai; khách thấy "Đã bị gỡ bởi quản trị" trong danh sách | N/A |
| Khách bị xoá tài khoản | Customer xoá | Bài còn, `uploaderId` null, không hiện tên | N/A |
| Công khai | `/sheet/<slug>` của khách | Hiện "Đăng bởi {tên}", tải miễn phí cần đăng nhập | Thiếu tên thì ẩn dòng |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration mới -- `sheets.uploader_id` (UUID null, FK `customers`, `ON DELETE SET NULL`, index); `Customer.sheets` quan hệ ngược.
- `packages/shared/src/member-sheet.ts` (+ export, test) -- `createMemberSheetSchema` (strictObject: title, subtitle, level, difficultyScore, difficultyNote, description, lyricsChords, youtubeUrl, genreIds, composerId | composerName), `updateMemberSheetSchema` (một phần), kiểu `MemberSheet` (tóm tắt: id, slug, title, status, level, hasSheet/Midi/Mp3, pageCount, thumbnailUrl, viewCount, createdAt, updatedAt) và `MemberSheetDetail`; thêm `uploader: { name } | null` vào schema chi tiết công khai (`publicSheetDetailSchema`) và `uploader: { id, name, email } | null` vào schema đọc của admin.
- `apps/api/src/modules/catalog/sheets.service.ts` -- `create` nhận thêm `uploaderId`; không đổi hành vi cũ (thêm tham số tuỳ chọn); helper tìm/tạo Composer theo tên (`ComposersService`).
- `apps/api/src/modules/catalog/member-sheets.controller.ts` + `member-sheets.service.ts` (mới) -- `GET /customer/sheets` (của tôi), `POST /customer/sheets` (tạo nháp), `GET|PATCH|DELETE /customer/sheets/:id`, `POST /customer/sheets/:id/files` + `DELETE …/files/:type` (dùng lại interceptor/pipe upload), `POST …/publish`, `POST …/unpublish`; `CustomerAuthGuard` + `ThrottlerGuard`; kiểm tra quyền sở hữu trước mọi thao tác; ép `isFree`, bỏ giá/HOT/Series; trả `MemberSheet`.
- `apps/api/src/modules/catalog/public-sheets.service.ts` -- đưa `uploader: { name }` vào chi tiết công khai (tên khách; `null` khi không có).
- `apps/api/src/modules/catalog/sheets.service.ts` (admin list) + `sheets.controller.ts` -- thêm `uploader` vào dữ liệu đọc và bộ lọc `uploadedBy=customers` (hoặc tương đương) cho danh sách admin.
- `apps/web/src/lib/customer-api.ts` -- hàm cho `/customer/sheets*` (có `onProgress` cho upload file, dùng lại `postWithProgress`).
- `apps/web/src/app/[locale]/my-sheets/page.tsx` (+ `loading.tsx`), `my-sheets/new/page.tsx`, `my-sheets/[id]/page.tsx` (sửa) -- danh sách (thẻ nhỏ, trạng thái, sửa, đổi file, gỡ/đăng, xoá), form đăng/sửa dùng chung `SheetUploadForm` (chọn/gõ tác giả, thể loại, level, các trường tuỳ chọn, ba ô tải file PDF/MIDI/MP3 với % tải lên), xem trước tên người đăng.
- `apps/web/src/components/member-sheets/` (mới) -- `SheetUploadForm`, `MySheetCard`, `FileSlot` (tải/đổi/gỡ + tiến trình), hook `useMemberSheets`.
- `apps/web/src/components/sheet/sheet-detail.tsx` -- dòng "Đăng bởi {tên}"; `components/auth/header-auth.tsx` -- link "Bản nhạc của tôi" cạnh tên khách; trang Bản nhạc (`/search`) -- nút "Đăng bản nhạc".
- `apps/web/src/messages/{vi,en}.json` -- `MySheets.*`, `Sheet.uploadedBy`, `Nav.mySheets`.
- `apps/admin/src/components/sheets/sheet-table.tsx`, `sheet-editor.tsx` (+ bộ lọc ở trang danh sách) -- cột/nhãn "Người đăng", bộ lọc "Do người dùng đăng"; không đổi luồng sửa/gỡ.
- Test: shared (schema chặt, strict keys, composerId xor composerName); API integration (Postgres + SeaweedFS thật): tạo → tải PDF → đăng → công khai có `uploader.name`; trường cấm `400`; quyền sở hữu (`404` bài người khác/admin); gỡ/đăng lại; admin `ARCHIVED` thì khách không đăng lại; xoá; composer tên mới dùng lại bản trùng; xoá khách → `uploaderId null`; throttle; unit cho `member-sheets.service`; web (form, tiến trình, lỗi, danh sách, trạng thái, mời đăng nhập); admin (cột/lọc người đăng).
- Không đổi: thanh toán, khoá học, player, `services/musicscore`, hợp đồng `/admin/*` (chỉ thêm trường đọc).

## Tasks & Acceptance

**Execution:**
- [x] Shared: schema `member-sheet` + trường `uploader` (công khai và admin) + test
- [x] Prisma: `sheets.uploader_id` + migration; `SheetsService.create` nhận `uploaderId`
- [x] API: `member-sheets` controller/service (CRUD của tôi, file, publish/unpublish), composer theo tên, `uploader` ở chi tiết công khai và danh sách admin + test tích hợp
- [x] Web: `customerApi` sheets, trang `/my-sheets` (danh sách, mới, sửa), form + tiến trình, link ở header/trang Bản nhạc, "Đăng bởi" ở trang bài + i18n + test
- [x] Admin: cột và bộ lọc "Người đăng" + test
- [x] Chạy thật cục bộ (đăng PDF thật 3 trang, MIDI, MP3, xem công khai, admin gỡ), chụp ảnh 390/768/1280px

**Acceptance Criteria:**
- Given khách đã đăng nhập, when tạo bài với PDF hợp lệ rồi bấm Đăng, then bài công khai ngay ở danh sách, tìm kiếm, trang chi tiết (có "Đăng bởi {tên}") và có trang xem thử PDF/thumbnail như bài admin.
- Given khách cố gửi giá, HOT, Series hay trạng thái ngoài phạm vi, then `400` và không có gì được ghi.
- Given bài của người khác hoặc của admin, when khách gọi bất kỳ route nào, then `404`.
- Given khách sửa/đổi file/gỡ/đăng lại/xoá bài của mình, then hành vi như hướng dẫn trong ma trận, cache công khai được làm mới, không để object mồ côi.
- Given admin gỡ bài (`ARCHIVED`), then bài ra khỏi công khai, khách thấy "đã bị gỡ" và không đăng lại được.
- Given admin mở danh sách, then thấy người đăng và lọc được bài do người dùng đăng.
- Given test/lint/typecheck/build của shared, api, web, admin, then xanh; AA, bàn phím, reduced-motion như U0–U5; không tràn ngang ở 3 cỡ màn hình.

## Implementation Notes

Đã làm đúng spec. **Shared:** `member-sheet.ts` (`createMemberSheetSchema` strictObject, xor `composerId`/`composerName` chuẩn hoá tên; `updateMemberSheetSchema`; `memberSheetListSchema`), export `memberSheetFields` từ `sheet.ts`; thêm trường ĐỌC `uploader` (`{id,name,email}`, tuỳ chọn) vào `sheetSchema`, `uploaderName` vào `sheetListItemSchema`, `uploadedBy` vào query danh sách admin, `uploader: { name }` vào chi tiết công khai. **DB:** `sheets.uploader_id` (FK `customers`, `ON DELETE SET NULL`, index), migration `20261023100000_sheet_uploader` (khớp schema Prisma). **API:** `SheetsService.create(body, { uploaderId })`; `MemberSheetsService`/`MemberSheetsController` (`/customer/sheets*`: danh sách, tạo, xem, sửa, tải/gỡ file, đăng, gỡ về nháp, xoá) là lớp mỏng trên `SheetsService`: kiểm tra sở hữu (khách khác hoặc bài của admin → 404), ép `isFree`, không giá/HOT/Series, tác giả theo tên (tìm trùng hoặc tạo), bài `ARCHIVED` thì khách không đăng/gỡ được (403); throttle theo IP; chi tiết công khai trả tên người đăng; admin list/chi tiết có người đăng và lọc. **Web:** `/my-sheets` (danh sách, thao tác), `/my-sheets/new`, `/my-sheets/[id]` (form chung `SheetUploadForm`, ô file có % tải lên, tạo→tải→đăng có "Thử lại từ bước dở", sửa/đổi/gỡ file, đăng/gỡ/xoá có xác nhận), link "Bản nhạc của tôi" ở header khi đăng nhập, nút "Đăng bản nhạc" ở trang Bản nhạc, dòng "Đăng bởi {tên}" ở trang bài; trang new/edit `force-dynamic` (không bake gợi ý rỗng lúc build). **Admin:** cột "Người đăng", bộ lọc "Nguồn", dòng người đăng + email ở trang sửa.
**Kiểm chứng:** shared 328, api unit (chỉ `backup-script.spec.ts` đỏ, đã có từ trước), api integration 675 (thêm 12 test mới Postgres + SeaweedFS thật: tạo/đăng/công khai có tên, trường cấm, sở hữu, gỡ/đăng lại, admin gỡ, xoá + dọn file, xoá khách → uploader null, admin list/lọc), web 976, admin 279; lint/typecheck/build xanh. Chạy thật (web + API dev + Postgres + SeaweedFS + poppler): đăng PDF 3 trang + MIDI bằng tài khoản thật, tác giả gõ mới, thấy "Đăng bởi Demo" ở trang bài, danh sách, gỡ về nháp, sửa, xoá; desktop và mobile không tràn ngang, không lỗi trang.
**Phát hiện:** (1) khách CHƯA xác minh email không đăng nhập được (API từ chối đăng nhập `EMAIL_NOT_VERIFIED`), nên "chỉ cần đăng nhập" trên thực tế = đã xác minh email; API không tự chặn thêm vì chỉ cần token khách hợp lệ (test tích hợp dùng token trực tiếp). (2) Ở môi trường dev không có `WEB_INTERNAL_URL` nên trang công khai vẫn trả 200 (cache cũ) sau khi gỡ về nháp; production có revalidate; ở mức API thì 404 (đã kiểm bằng test). **Chưa kiểm chứng:** Safari/iOS, trình đọc màn hình, tải file lớn (20MB) và nhiều trang qua mạng chậm, chống lạm dụng/spam thực tế (chưa có hạn mức theo quyết định của founder).

## Spec Change Log

## Review Triage Log

## Design Notes

Dùng lại `SheetsService` thay vì viết lại để mọi bất biến của admin (PDF xử lý, slug, trạng thái, dọn file, cache tag) áp cho bài của khách; lớp mới chỉ thêm quyền sở hữu và ép các trường cấm, nên bề mặt rủi ro nhỏ. Hai bước (tạo nháp rồi tải file) giữ nguyên mô hình admin và cho phép tải file lớn có tiến trình mà không giữ một request dài.

**Rủi ro đã chấp nhận theo quyết định của founder (ghi lại để sau này rà):** công khai ngay và chỉ cần đăng nhập nghĩa là bản quyền, nội dung xấu và spam xuất hiện ngay trên site và chỉ được gỡ sau khi admin phát hiện; tài khoản chưa xác minh email và không hạn mức nên có thể đăng hàng loạt. Giảm nhẹ có sẵn: admin gỡ nhanh bằng `ARCHIVED`, danh sách admin lọc theo người đăng, throttle theo IP. Khuyến nghị cho giai đoạn sau (ngoài phạm vi): nút báo cáo, xác minh email trước khi đăng, hạn mức/ngày, hoặc hàng chờ duyệt.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/shared test` · `pnpm --filter @piano-daily/api lint && typecheck && test` (gồm integration) · `pnpm --filter @piano-daily/web lint && typecheck && test` · `pnpm --filter @piano-daily/admin lint && typecheck && test` -- expected: xanh
- `pnpm lint && pnpm typecheck` ở gốc; build web/admin/api (không nạp `.env` vào shell) -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label my-sheets` -- expected: ảnh, không cảnh báo

**Manual checks (if no CLI):**
- Đăng thật PDF nhiều trang, MIDI, MP3 trên môi trường dev; xem bài công khai; admin gỡ; thử với tài khoản khách thứ hai (không sửa được bài người khác).
