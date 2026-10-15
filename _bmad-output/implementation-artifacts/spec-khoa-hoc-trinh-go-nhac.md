---
title: 'Khoá học piano C1c: trình gõ nốt (piano-roll) trong admin để soạn nhạc cho bài học'
type: 'feature'
created: '2026-10-15'
status: 'in-review'
baseline_commit: 'f00b031'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{implementation_artifacts}/spec-khoa-hoc-noi-dung.md'
  - '{implementation_artifacts}/spec-khoa-hoc-khuong-nhac.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Nhạc của bài học hiện chỉ có đường **upload file MIDI**. Founder muốn admin có thể **tự gõ nốt ngay trên trình duyệt** (không cần phần mềm soạn nhạc), và nhập file MIDI có sẵn vào trình gõ để sửa tiếp.

**Approach:** Một **trình gõ piano-roll** (lưới phím đàn × thời gian, mỗi ô nhịp chia 1/16) ở trang soạn nhạc riêng của từng bài. Trình gõ chạy hoàn toàn ở trình duyệt admin: khi lưu, nó **tạo file MIDI** (`@tonejs/midi`) rồi đẩy qua **đúng endpoint upload MIDI hiện có**, nên toàn bộ phần sau (note-JSON, player, khuông nhạc, bàn tay, xoá object cũ) dùng lại nguyên. Nạp nhạc có sẵn vào trình gõ bằng: (a) chọn file MIDI từ máy, (b) "Mở nhạc hiện tại của bài" qua một endpoint admin mới trả file `.mid` gốc. Không nghe thử trong admin: lưu rồi xem/nghe ở trang bài học (player + khuông + bàn tay có sẵn).

## Boundaries & Constraints

**Always:**
- Trang `/courses/[trackId]/lessons/[lessonId]/music` (admin): tiêu đề bài, nút quay lại cây, trình gõ, nút **Lưu nhạc**. Cây nhánh có nút "Soạn nhạc" ở hàng mỗi bài. Xem trang: mọi admin; lưu/nhập/xoá nốt chỉ SUPER_ADMIN (EDITOR thấy trình gõ ở chế độ chỉ xem, nút lưu và sửa bị vô hiệu như phần còn lại của khoá học).
- Mô hình: nhịp (`2/4, 3/4, 4/4, 6/8`), tempo 30–240 BPM, số ô nhịp 1–64, danh sách nốt `{ midi 21–108, start, duration }` tính bằng đơn vị 1/16. Giới hạn: tối đa 5.000 nốt; vượt thì từ chối ở client với thông báo rõ.
- Gõ nốt: chọn độ dài từ bảng (tròn, trắng, đen, móc đơn, móc kép, và dạng chấm của trắng/đen/móc đơn), bấm vào ô trên lưới để thêm nốt tại đó (bám lưới 1/16); bấm vào nốt đã có để xoá; nốt cùng cao độ trùng nhau thì thay thế; nhiều nốt cùng lúc là hợp âm; nốt không được vượt quá ô nhịp cuối (cắt ngắn). Lưới hiện 4 ô nhịp mỗi trang với nút trang trước/sau và cuộn dọc cho dải phím C2–C7; nốt ngoài dải này (khi nhập MIDI) vẫn giữ và hiện khi cuộn tới.
- Lối thay thế cho bàn phím/trình đọc màn hình: một **bảng nốt** (danh sách có thứ tự theo thời gian) với form thêm nốt (cao độ, ô nhịp, vị trí trong ô, độ dài) và nút xoá từng nốt; mọi thao tác trên lưới đều làm được ở bảng này. Lưới và bảng luôn đồng bộ.
- Lưu: tạo MIDI một track, `ppq` 480 (1 đơn vị = 120 tick), tempo và nhịp theo cài đặt, velocity cố định; đặt tên file `bai-<id>.mid`; gửi qua `coursesApi.uploadMidi` (thay file cũ theo cơ chế hiện có). Lưu thành công thì quay lại trạng thái "đã lưu" (không còn thay đổi chưa lưu); rời trang khi còn thay đổi chưa lưu thì hỏi xác nhận.
- Nhập MIDI (từ máy hoặc nhạc hiện tại của bài): đọc bằng `@tonejs/midi` ở client, gộp mọi track không phải gõ (kênh 10), làm tròn về lưới 1/16 (độ dài tối thiểu 1 đơn vị), lấy tempo và nhịp đầu tiên (nhịp lạ ngoài danh sách thì đặt 4/4), tính số ô nhịp đủ chứa nốt cuối (kẹp ≤ 64); báo rõ khi có nốt bị bỏ (quá 5.000, vượt 64 ô nhịp, ngoài dải) hoặc làm tròn đổi nhịp điệu; sau khi nhập vẫn phải bấm Lưu mới ghi lên server. Nhập sẽ thay nội dung đang có (hỏi xác nhận khi đang có nốt).
- API mới: `GET /admin/courses/lessons/:id/midi/file` (mọi admin) trả file `.mid` gốc (`application/octet-stream`, `Content-Disposition: attachment`, `Cache-Control: no-store`); bài không có nhạc → 404; id không hợp lệ → 404. Đọc object từ vùng private qua `StorageService` (thêm `getObject`); không lộ khoá private.
- Truy cập: lưới có `role="application"`/nhãn mô tả cách dùng, mỗi nốt có nhãn (tên nốt, vị trí); focus ring; mọi thao tác chính có ở bảng nốt (xem trên). Giao diện admin bằng tiếng Việt như phần còn lại.
- `@tonejs/midi` (cùng bản với API, 2.0.28) chỉ được nạp động khi mở trang soạn nhạc (không vào bundle các trang admin khác).

**Never:**
- Không nghe thử/phát âm thanh trong admin, không thêm Tone.js vào admin, không vẽ khuông nhạc trong trình gõ; không kéo-thả/kéo giãn độ dài nốt, không velocity/nhiều track/pedal/tuplet; không lưu "bản nháp" trên server (nguồn chân lý vẫn là file MIDI đã lưu).
- Không đổi pipeline MIDI phía server (parse, note-JSON, khuông, player), không đổi DB; không cho phép lưu khi không có nốt nào (muốn bỏ nhạc dùng nút gỡ ở form bài).
- Không đụng quy tắc "bài công khai cần ít nhất một phần" (lưu nhạc rỗng bị chặn ở client).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gõ nốt | Chọn "đen", bấm ô (C4, ô 1 vị trí 0) | Nốt C4 dài 4 đơn vị; hiện ở lưới và bảng | N/A |
| Xoá nốt | Bấm nốt đã có / nút xoá ở bảng | Nốt biến mất ở cả hai | N/A |
| Nốt vượt ô cuối | Bấm ở cuối ô nhịp cuối với nốt dài | Nốt bị cắt vừa ô cuối | N/A |
| Hợp âm | Bấm nhiều cao độ cùng vị trí | Các nốt cùng lúc | N/A |
| Lưu | ≥ 1 nốt, SUPER_ADMIN | Upload `bai-<id>.mid` một track `ppq` 480; bài có nhạc, trạng thái "đã lưu" | Lỗi API hiện thông báo, giữ nguyên nốt |
| Lưu rỗng | 0 nốt | Không gửi | Báo "Hãy gõ ít nhất một nốt" |
| EDITOR | vai trò EDITOR | Xem được; thêm/xoá/lưu bị vô hiệu kèm lý do | N/A |
| Nhập file MIDI | File hợp lệ | Nốt, tempo, nhịp, số ô nhịp được nạp; chưa ghi server | Không phải MIDI/hỏng/quá 2MB: báo lỗi, giữ nguyên nội dung cũ |
| Nhập quá lớn | > 5.000 nốt hoặc > 64 ô nhịp | Nạp phần đầu hợp lệ + báo số nốt bị bỏ | N/A |
| Mở nhạc hiện tại | Bài có MIDI | `GET …/midi/file` rồi nhập như trên | Bài không có nhạc: 404 → báo "bài chưa có nhạc" |
| Rời trang | Có thay đổi chưa lưu | Hỏi xác nhận | N/A |
| Bài đã công khai chỉ có nhạc | Lưu nhạc mới | Thay file, bài vẫn công khai | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/media/storage.service.ts` -- thêm `getObject(key): Promise<Buffer>`; `apps/api/src/modules/courses/{admin-courses.controller,lesson-midi.service}.ts` -- `GET lessons/:id/midi/file`; test `apps/api/test/integration/courses.spec.ts`; `public-routes.spec.ts` không đổi (route admin).
- `apps/admin/package.json` -- `@tonejs/midi`.
- `apps/admin/src/lib/midi-editor/` (mới) -- `score.ts` (kiểu, hằng, thêm/xoá/cắt nốt, kiểm tra), `midi-io.ts` (`scoreToMidi`, `midiToScore` + báo cáo nhập, nạp động `@tonejs/midi`), test thuần.
- `apps/admin/src/components/courses/music-editor/` (mới) -- `piano-roll.tsx` (lưới), `note-table.tsx` (bảng nốt + form thêm), `music-editor.tsx` (cài đặt, bảng độ dài, nhập/lưu, cảnh báo rời trang) + test; mẫu: `lesson-form.tsx` (upload, lỗi), `sheets/midi-uploader.tsx`.
- `apps/admin/src/app/(admin)/courses/[id]/lessons/[lessonId]/music/page.tsx` -- trang; `course-tree-editor.tsx` -- nút "Soạn nhạc"; `lib/api/courses.ts` -- `midiFile(lessonId)` (nhận `ArrayBuffer`).
- `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [ ] API: `StorageService.getObject`, `GET /admin/courses/lessons/:id/midi/file` + integration test (nội dung khớp file đã upload, 404 khi không có nhạc/id lạ, EDITOR đọc được, chưa đăng nhập 401)
- [x] `lib/midi-editor/score.ts` + `midi-io.ts` + test (thêm/xoá/thay thế/cắt nốt, vòng lặp `scoreToMidi`→`midiToScore` giữ nốt/tempo/nhịp, nhập làm tròn/bỏ nốt/giới hạn, MIDI hỏng)
- [x] `music-editor/` (lưới, bảng nốt, trình gõ) + trang + nút ở cây + `coursesApi.midiFile` + test component (gõ/xoá, độ dài, EDITOR chỉ xem, lưu gửi file MIDI hợp lệ, lưu rỗng bị chặn, nhập, cảnh báo thay đổi chưa lưu, lỗi API)
- [x] `README.md`, `deferred-work.md`

**Acceptance Criteria:**
- Given SUPER_ADMIN mở trang soạn nhạc của một bài, when gõ vài nốt rồi Lưu, then bài có nhạc và trang bài học phát được với khuông và bàn tay như file MIDI upload.
- Given bài đã có nhạc, when bấm "Mở nhạc hiện tại", then các nốt hiện lên trình gõ để sửa tiếp rồi lưu lại.
- Given file MIDI từ máy, when nhập, then nốt/tempo/nhịp được nạp và báo rõ phần bị bỏ hoặc làm tròn.
- Given EDITOR, then chỉ xem được trình gõ, mọi sửa/lưu bị vô hiệu.
- Test hiện có, lint, typecheck, build xanh; `@tonejs/midi` chỉ nạp ở trang soạn nhạc.


## Implementation Notes

- API: `StorageService.getObject` (null khi không có), `LessonMidiService.readOriginal`, `GET /admin/courses/lessons/:id/midi/file` (`StreamableFile`, `no-store`).
- Admin: mô hình thuần ở `lib/midi-editor/{score,midi-io}.ts`; `apiFetch` thêm tuỳ chọn `binary`; lưới dùng một phần tử bấm + nút cho từng nốt (nhãn truy cập), bảng nốt là lối thay thế; liên kết "Về cây khoá học" hỏi xác nhận qua `document.body.dataset.musicDirty`.
- `@tonejs/midi` chỉ được `import()` bên trong `scoreToMidi`/`midiToScore` nên không vào bundle các trang khác.
- Kiểm chứng: lint, typecheck, build xanh; admin 251 test, API integration 614 xanh.

## Review Triage Log
