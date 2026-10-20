---
title: 'Chuyển PDF sang MIDI: hiển thị tiến trình (% tải lên + các bước + thời gian đã chạy)'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: '8c0cd75'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-chuyen-pdf-sang-midi.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trang `/convert` chỉ có spinner và một dòng "mất từ vài chục giây đến vài phút", người dùng không biết file đã lên chưa, hệ thống đang ở bước nào, đã chờ bao lâu. Nhận dạng chạy ở Audiveris (`services/musicscore`) không báo được phần trăm.

**Approach (founder chọn A + B, không làm C):** (A) phần trăm TẢI LÊN thật, đo bằng sự kiện tiến độ upload của trình duyệt. (B) ba bước (Tải file lên → Nhận dạng bản nhạc → Tạo MIDI và khuông nhạc) với trạng thái xong/đang làm/chưa tới, kèm thời gian đã chạy và lời nhắc khi lâu bất thường. KHÔNG hiện phần trăm cho bước nhận dạng (không có dữ liệu thật, không giả thanh %).

## Boundaries & Constraints

**Always:** Chỉ đổi phía web; API, `musicscore`, hợp đồng dữ liệu không đổi. Phần trăm chỉ phản ánh tiến độ upload thật; thời gian đã chạy tính từ `createdAt` của việc (đúng cả khi tải lại trang), không bao giờ âm khi đồng hồ lệch; mọi lỗi/hạn mức/xoá/khôi phục `?job=` như trước; cùng ánh xạ lỗi giữa đường `fetch` và đường XHR; a11y: `progressbar` có nhãn và `aria-valuenow`, bước đang làm có `aria-current="step"`, trạng thái từng bước có chữ cho trình đọc màn hình, không chỉ dựa vào màu/icon; i18n vi/en; reduced-motion; không tràn ngang ở 390/768/1280px.

**Never:** Giả phần trăm cho bước nhận dạng; sửa `services/musicscore` hay API; thêm thư viện; thay đổi hành vi hạn mức/xoá/hết hạn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đang tải lên | Gửi file, có sự kiện tiến độ | Tiêu đề "Đang tải lên… n%", thanh tiến trình `aria-valuenow=n`; bước 1 đang làm, bước 2-3 chưa tới | Lỗi mạng/HTTP → thông báo như trước, form dùng lại được |
| Đang nhận dạng | Việc `PENDING`/`PROCESSING` | Bước 1 xong, bước 2 đang làm, bước 3 chưa tới; "Đã chạy m:ss" tăng mỗi giây; không có thanh % | N/A |
| Lâu bất thường | Chạy > 5 phút | Thêm lời nhắc lâu hơn bình thường; vẫn có nút xoá | Quá 12 phút thì hết thời gian chờ như trước |
| Mở lại trang | `?job=<id>` | Thời gian đã chạy tính từ `createdAt` của việc | N/A |
| Đồng hồ lệch | `createdAt` ở tương lai | Hiện 0:00, không âm | N/A |
| Sự kiện tiến độ không đo được | `lengthComputable=false` | Bỏ qua, giữ giá trị cũ | N/A |
| Reduced motion | Bật | Không chuyển động thêm (spinner/thanh theo quy tắc chung) | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/customer-api.ts` -- `createScore(token, file, transpose, onProgress?)`: có `onProgress` thì dùng XMLHttpRequest (`postWithProgress`), không thì `fetch` như cũ; lỗi dựng `Response` rồi dùng chung `toApiError`.
- `apps/web/src/components/convert/use-score-job.ts` -- trạng thái `uploading` mang `progress` (0..1), cập nhật khi phần trăm nguyên đổi.
- `apps/web/src/components/convert/convert-progress.tsx` -- mới: ba bước, thanh % khi tải lên, đồng hồ đã chạy, lời nhắc lâu.
- `apps/web/src/components/convert/convert-view.tsx` -- dùng `ConvertProgress` cho `uploading`/`running`.
- `apps/web/src/messages/{vi,en}.json` -- `Convert.steps/stepState/elapsed/uploadingPercent/progressLabel/slowHint`.
- Test: `convert-view.test.tsx`, `customer-api.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `customerApi.createScore` XHR có tiến độ + test
- [x] Hook `uploading.progress` + `ConvertProgress` + i18n + test
- [x] Chạy thật cục bộ (musicscore thật, giả lập mạng chậm), chụp ảnh

**Acceptance Criteria:**
- Given tải file lớn qua mạng chậm, when đang gửi, then % tăng dần từ 0 tới 100 và bước 1 đang làm.
- Given việc đang nhận dạng, when chờ, then bước 2 đang làm, đồng hồ tăng, không có thanh % giả.
- Given tải lại trang giữa chừng, then đồng hồ tiếp tục từ thời điểm tạo việc.
- Given test/lint/typecheck/build web, then xanh.

## Implementation Notes

Đã làm như spec. Chạy thật: giả lập upload ~600 KB/s với file 3 MB, % hiện 28–30% giữa chừng rồi sang bước nhận dạng; "Đã chạy 0:02" tăng dần; desktop và mobile không tràn ngang. Chưa kiểm chứng: hành vi trên PDF thật qua Audiveris (thời gian nhận dạng thật dài hơn nhiều so với MusicXML). Ghi chú: giới hạn `POST /customer/scores` là 5 lần/phút/IP nên thử nghiệm liên tiếp sẽ gặp 429.

## Spec Change Log

## Review Triage Log

## Design Notes

Phần trăm tải lên là số duy nhất hệ thống thật sự đo được; phần nhận dạng chạy trong Audiveris không có tiến độ nên được trình bày bằng bước + thời gian, tránh thanh % giả gây hiểu lầm (nhảy lùi, đứng ở 99%). Khi cần % thật cho nhận dạng (đếm trang đã xong) phải sửa `musicscore` để có job/tiến độ và thử với Audiveris thật: để giai đoạn sau.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && typecheck && test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` -- expected: thành công
