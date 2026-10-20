---
title: 'Chức năng người dùng: chuyển PDF bản nhạc sang MIDI + xem khuông nhạc'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: '288a2c6'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/services/musicscore/README.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nhánh `musicscore` đã đưa vào `develop` một dịch vụ riêng (`services/musicscore`, `POST /midi`: PDF/ảnh/MusicXML → MIDI, chạy trong mạng nội bộ Docker với alias `piano-musicscore`, không có cổng ra ngoài) nhưng người dùng web chưa dùng được. Nhận dạng một bản nhạc mất từ vài chục giây đến vài phút nên không thể gọi đồng bộ qua trình duyệt, và dịch vụ không có xác thực nên không được để lộ ra ngoài.

**Approach:** Thêm chức năng "Chuyển PDF sang MIDI" cho khách đã đăng nhập (đã chốt với founder: bắt buộc đăng nhập; kết quả tạm thời, tự xoá sau vài giờ; xem khuông nhạc + nghe thử + tải MIDI, có chọn dịch giọng trước khi chuyển). `apps/api` làm cổng duy nhất: nhận file (`POST /customer/scores`), kiểm tra, ghi một dòng `score_conversions`, trả `202` ngay rồi xử lý nền (gọi `musicscore` nội bộ, tạo note-JSON bằng pipeline MIDI có sẵn, lưu object tạm); web hỏi trạng thái (`GET /customer/scores/:id`) và khi xong dùng lại `MidiPlayer` có khuông nhạc. Có giới hạn số lần/ngày, một việc đang chạy mỗi khách, dọn tự động theo hạn.

## Boundaries & Constraints

**Always:**
- Chỉ khách đăng nhập (`CustomerAuthGuard`) gọi được; mọi route theo chủ sở hữu (khách khác → 404). Throttle theo IP, kèm hạn mức theo tài khoản: tối đa 1 việc đang chạy và `SCORE_DAILY_LIMIT` (mặc định 10) việc/24 giờ; việc lỗi do hạ tầng (dịch vụ bận/không phản hồi) không tính vào hạn mức.
- Loại file xác định bằng nội dung (magic bytes), KHÔNG tin `Content-Type` do client gửi; chỉ nhận PDF, PNG, JPEG, TIFF, MusicXML (`.musicxml`/`.xml`/`.mxl`); kích thước ≤ `SCORE_MAX_UPLOAD_MB` (mặc định 20, nhỏ hơn giới hạn 25 của `musicscore`); `transpose` là số nguyên −12..12.
- Không lưu file gốc (PDF/ảnh): giữ trong bộ nhớ tới khi xử lý xong; chỉ lưu kết quả tạm (MIDI ở bucket private `private/conversions/<id>/…`, note-JSON ở `public/conversions/<id>/<hash>.json` với khoá không đoán được) và xoá khi hết `SCORE_RESULT_TTL_HOURS` (mặc định 6) hoặc khi khách bấm xoá.
- Dịch vụ `musicscore` chỉ gọi qua `MUSICSCORE_URL` (biến môi trường, không có giá trị mặc định); chưa cấu hình thì tính năng "chưa mở" (API trả `503`, web hiện thông báo, không lỗi 500) và các route khác không ảnh hưởng.
- Việc treo/khởi động lại: dòng `PENDING`/`PROCESSING` quá hạn hoặc còn sót sau khi API khởi động lại chuyển `FAILED` (mã hạ tầng); không bao giờ để trạng thái kẹt vĩnh viễn.
- Web: i18n vi/en (chuỗi mới vào `messages/{vi,en}.json`), dùng `Card`/`Button`/`EmptyState`, focus ring, vùng chạm ≥ 44px, không tràn ngang ở 390/768/1280px, `prefers-reduced-motion`, AA (chữ brass dùng `secondary-strong`); nêu rõ hai cảnh báo: nhận dạng không hoàn hảo (đối chiếu bản gốc) và chỉ tải lên bản nhạc bạn có quyền sử dụng.
- Không log nội dung file hay URL ký sẵn; log chỉ có id, trạng thái, mã lỗi.

**Never:** Để lộ `musicscore` ra Internet hay thêm API key vào trình duyệt; lưu vĩnh viễn PDF/ảnh của khách; sửa `services/musicscore` ngoài README (chạy thử cục bộ); thêm trình soạn nhạc/sửa nốt trên web (giai đoạn sau); thêm thư viện mới cho web (dùng lại `MidiPlayer`, `NotationView`, `PianoView`); đổi giá trị token; đụng thanh toán/khoá học.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chuyển thành công | Khách đăng nhập, PDF sạch, transpose 0 | `202 {id,status:PENDING}` → web hỏi trạng thái tới `DONE` → khuông nhạc + nghe thử + nút Tải MIDI | N/A |
| Dịch giọng | transpose ±n | MIDI/khuông đã dịch n nửa cung | transpose ngoài −12..12 hoặc không nguyên → `400` |
| Chưa đăng nhập | Không token | Trang `/convert` mời đăng nhập (mở modal); API `401` | N/A |
| Loại file sai | `.docx`, `.exe`, content-type giả PDF nhưng nội dung khác | `415`, thông báo nêu các loại được nhận | Không lưu gì |
| File quá lớn / rỗng | > giới hạn / 0 byte | `413` / `400` | Cắt đọc ngay khi vượt giới hạn |
| Đang có việc chạy | Khách gửi thêm lần nữa | `429` kèm mã `SCORE_ACTIVE_JOB` và id việc đang chạy | N/A |
| Hết hạn mức ngày | Đã đủ `SCORE_DAILY_LIMIT` | `429` mã `SCORE_DAILY_LIMIT`, nêu giờ được thử lại | N/A |
| Không đọc được bản nhạc | `musicscore` trả 422 | Việc `FAILED` mã `SCORE_UNREADABLE`, web gợi ý PDF rõ nét/MusicXML | Tính vào hạn mức |
| Dịch vụ bận/tắt | `musicscore` 503, timeout, không kết nối | `FAILED` mã `SCORE_UNAVAILABLE`, web cho "Thử lại"; không tính hạn mức | Log lỗi |
| `MUSICSCORE_URL` trống | Chưa cấu hình | Web hiện "tính năng chưa mở"; `POST` trả `503 FEATURE_DISABLED` | N/A |
| Khách khác xem việc | id của người khác/không có | `404` | N/A |
| Hết hạn | Quá TTL | Dòng + object bị xoá; `GET` trả `404`, web nói kết quả đã hết hạn | GC lỗi thì lần sau thử lại |
| API khởi động lại giữa chừng | Dòng `PROCESSING` còn sót | Chuyển `FAILED` `SCORE_UNAVAILABLE` khi khởi động | N/A |
| Rời trang rồi quay lại | Mở lại `/convert?job=<id>` | Tiếp tục hỏi trạng thái/hiện kết quả nếu còn hạn | N/A |
| Reduced motion | Bật | Thanh tiến trình/trạng thái không chuyển động | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration mới `…_score_conversions` -- bảng `score_conversions` (id uuidv7, customer_id → customers cascade, status `PENDING|PROCESSING|DONE|FAILED`, original_name, transpose, error_code, midi_key, note_json_key, duration_seconds, note_count, created_at, finished_at, expires_at; index `(customer_id, created_at)`, `(expires_at)`).
- `apps/api/src/modules/scores/` (module mới): `scores.module.ts`, `customer-scores.controller.ts` (`POST /customer/scores` multipart `file`+`transpose`, `GET /customer/scores/:id`, `DELETE /customer/scores/:id`), `scores.service.ts` (kiểm tra magic bytes/giới hạn, tạo dòng, chạy nền, đọc/xoá), `musicscore.client.ts` (gọi `POST ${MUSICSCORE_URL}/midi?transpose=n`, timeout, ánh xạ 422/503/lỗi mạng), `score-gc.service.ts` (`@Cron` mỗi 15 phút xoá hết hạn + sweep việc kẹt; chạy sweep lúc khởi động), test cho từng phần.
- `apps/api/src/modules/media/sheet-media.service.ts` -- dùng lại phần tạo note-JSON từ MIDI (`@tonejs/midi`); tách hàm thuần nếu cần, không đổi hành vi hiện có.
- `apps/api/src/config/env.ts`, `.env.example`, `docker-compose{,.prod}.yml`, `README.md` -- `MUSICSCORE_URL`, `SCORE_MAX_UPLOAD_MB`, `SCORE_DAILY_LIMIT`, `SCORE_RESULT_TTL_HOURS`; prod: `MUSICSCORE_URL: http://piano-musicscore:3000` (network proxy đã có alias).
- `packages/shared/src/scores.ts` (+ export, test) -- zod schema/kiểu `ScoreConversion`, `SCORE_STATUS`, mã lỗi, hằng giới hạn (transpose, loại file).
- `apps/web/src/lib/customer-api.ts` -- `createScore(token, file, transpose)` (multipart), `getScore`, `deleteScore`.
- `apps/web/src/app/[locale]/convert/page.tsx` + `loading.tsx` (shell SSR, metadata/SEO), `components/convert/convert-view.tsx` (client: form tải lên, trạng thái, kết quả), `convert-result.tsx` (nhúng `MidiPlayer` `notation`, nút Tải MIDI qua URL ký sẵn, nút "Chuyển bản khác"/"Xoá"), `use-score-job.ts` (hỏi trạng thái 3s, dừng khi xong/rời trang, tối đa ~12 phút), test.
- `apps/web/src/components/layout/{nav-links,footer}.tsx` + messages -- link "Chuyển PDF sang MIDI" ở menu và footer; `Convert.*` i18n.
- `apps/web/scripts/shots.mjs`, `README.md` -- chụp `convert` (đủ trạng thái nếu dựng được) và hướng dẫn chạy thử cục bộ `services/musicscore` (`npm ci && node src/server.ts`; MusicXML chạy không cần Audiveris).
- Không đổi: `services/musicscore` (ngoài README), `apps/admin`, thanh toán, khoá học, `lib/midi/*` lõi phát nhạc.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared` -- schema/mã lỗi/hằng số + test
- [x] Prisma schema + migration `score_conversions`
- [x] `scores` module API: client, service (kiểm tra, chạy nền, hạn mức), controller, GC + sweep khởi động, env/compose/docs + test
- [x] Web: `customerApi`, trang `/convert`, `ConvertView`, hook hỏi trạng thái, kết quả (player + khuông + tải), nav/footer, i18n + test
- [x] Chạy thật cục bộ: `services/musicscore` + API + web với MusicXML mẫu (không cần Audiveris), chụp ảnh các trạng thái 390/768/1280px
- [x] Ghi rõ trong spec phần chưa kiểm chứng (PDF thật cần Audiveris)

**Acceptance Criteria:**
- Given khách đăng nhập tải lên một MusicXML hợp lệ (và PDF nếu có Audiveris), when xử lý xong, then trang hiện khuông nhạc, phát thử được và tải được file `.mid` hợp lệ; dịch giọng +2 cho MIDI cao hơn 2 nửa cung.
- Given khách chưa đăng nhập, when mở `/convert` hoặc gọi API, then được mời đăng nhập / nhận `401`; không có file nào được ghi.
- Given file sai loại (kể cả Content-Type giả), quá lớn, rỗng, then bị từ chối đúng mã (`415`/`413`/`400`) và không có dòng/object nào được tạo.
- Given khách đang có việc chạy hoặc hết hạn mức ngày, then `429` đúng mã; việc lỗi do hạ tầng không làm giảm hạn mức.
- Given `musicscore` tắt/bận/trả 422, then việc `FAILED` đúng mã, web hiển thị thông báo rõ và (trừ 422) cho thử lại; API không lỗi 500.
- Given hết TTL hoặc khách bấm xoá, then dòng và object (private + public) bị xoá và `GET` trả `404`; API khởi động lại không để việc kẹt.
- Given khách A, when truy cập việc của khách B, then `404`.
- Given test, lint, typecheck, build của api/web/shared, then xanh; web đạt AA, bàn phím, reduced-motion như U0–U5; không tràn ngang ở 3 cỡ màn hình.

## Implementation Notes

Đã làm đúng spec, với một bổ sung: `POST /customer/scores` dùng `CustomerAccessService.requireDownloadAccess` (tài khoản còn hoạt động VÀ đã xác minh email, cùng điều kiện với tải file) để chặn lạm dụng tài khoản chưa xác minh; chưa xác minh → 403 `EMAIL_NOT_VERIFIED`, web nêu rõ.
- **Shared:** `scores.ts` (`detectScoreFileKind` theo magic bytes, schema, mã lỗi job), thêm 3 `ErrorCode` (`FEATURE_DISABLED`, `SCORE_ACTIVE_JOB`, `SCORE_DAILY_LIMIT`).
- **API:** bảng `score_conversions` + migration (CHECK status/transpose); module `scores` (`MusicscoreClient`, `ScoresService` có khoá advisory theo khách khi kiểm tra "một việc đang chạy"/hạn mức, `ScoreGcService` cron 10 phút + sweep lúc khởi động, `CustomerScoresController`); env `MUSICSCORE_URL`, `SCORE_*`; compose/`.env.example`/README.
- **Web:** `/convert` (+ `loading.tsx`), `ConvertView`, `ConvertResult` (dùng `MidiPlayer notation`), hook `useScoreJob` (hỏi 3s, tối đa 12 phút, khôi phục qua `?job=`), `customerApi.createScore/getScore/deleteScore` (multipart không ép Content-Type), link "PDF sang MIDI" ở menu và footer, i18n vi/en.
- **Kiểm chứng:** shared 313 test, API unit (chỉ `backup-script.spec.ts` đỏ, đã có từ trước và không liên quan: đỏ cả khi bỏ thay đổi này), API integration 12 test mới (Postgres + SeaweedFS thật, musicscore giả: thành công, dịch giọng, loại file giả mạo, hạn mức, việc đang chạy, 422/503, GC, xoá giữa chừng, cô lập khách, tính năng tắt), web 910 test, lint/typecheck/build api/web/admin xanh. Chạy thật cục bộ với `services/musicscore` thật + MusicXML: đăng nhập → tải lên (dịch giọng +2) → theo dõi → khuông nhạc + phím/bàn tay + nghe thử → tải MIDI hợp lệ (`MThd`) → tải lại trang vẫn thấy kết quả (`?job=`) → xoá; desktop và mobile, không tràn ngang, không lỗi console của trang.
- **CHƯA kiểm chứng:** PDF/ảnh thật (cần Audiveris, máy dev không có), độ chính xác nhận dạng với bản scan, triển khai production (container `musicscore` + network NPM), tải/giới hạn thật của dịch vụ khi nhiều người dùng cùng lúc.

## Spec Change Log

## Review Triage Log

## Design Notes

Xử lý nền và polling thay vì giữ kết nối: nhận dạng mất tới vài phút, vượt thời gian chờ của proxy/trình duyệt, nên `POST` trả 202 ngay. Việc chạy ngay trong tiến trình API (không thêm hàng đợi/Redis): API chạy một instance, `musicscore` tự giới hạn `MAX_JOBS`; hàng đợi ngoài là quá mức ở quy mô này. Dòng DB là nguồn sự thật của trạng thái nên khởi động lại không làm mất khả năng báo lỗi. File gốc không lưu vì là tác phẩm của người khác (bản quyền) và để giảm dung lượng; kết quả tạm, tự xoá. note-JSON để ở bucket public dưới khoá không đoán được để `MidiPlayer` hiện có đọc bằng URL mà không đổi lõi phát nhạc; MIDI ở bucket private, tải qua URL ký sẵn ngắn hạn như các tải khác. Chưa có trình sửa nốt trên web: ứng dụng Electron đã có và quá lớn để gộp, sẽ là giai đoạn riêng nếu cần.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/shared test` · `pnpm --filter @piano-daily/api lint && typecheck && test` · `pnpm --filter @piano-daily/web lint && typecheck && test` -- expected: xanh
- `pnpm build` (không nạp `.env` vào shell) -- expected: thành công; admin build vẫn xanh
- Chạy thật: `cd services/musicscore && npm ci && node src/server.ts`, đặt `MUSICSCORE_URL=http://localhost:3000`, chạy api + web, tải MusicXML mẫu; `shots -- --label convert` -- expected: ảnh đủ trạng thái, không cảnh báo

**Manual checks (if no CLI):**
- Thử PDF thật qua Audiveris trên môi trường có cài (không dựng được trên máy dev này nếu thiếu Audiveris); thử nghiệm độ chính xác nhận dạng với bản nhạc scan.
