---
title: 'Tuỳ chỉnh góc nhìn và màu của cảnh 3D'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '3a1ac7cfc54b7060909008e38a12fae88782b0fe'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-8-midi-player-voi-phim-dan-ao.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Cảnh 3D của MIDI player có góc nhìn cố định (nghiêng 54°) và màu cố định: bàn tay `0xdcae8c`, thanh nốt rơi phím trắng `0xb8893a`, phím đen `0x8c6a2c`. Founder và người xem không chỉnh được.

**Approach:** Thêm bảng "Tuỳ chỉnh cảnh 3D" trong khối player (chỉ khi cảnh 3D đang dùng): thanh trượt góc nâng, xoay và độ gần, ba ô chọn màu (bàn tay, nốt rơi phím trắng, nốt rơi phím đen), nút đặt lại. Áp dụng ngay không tải lại, nhớ trong trình duyệt (localStorage), mặc định giống hệt giao diện hiện tại.

## Boundaries & Constraints

**Always:** Cài đặt là một đối tượng `ViewSettings { elevation, azimuth, zoom, handColor, noteWhiteColor, noteBlackColor }` ở `lib/midi/scene3d/view-settings.ts` (thuần, không import `three`). Giới hạn: `elevation` 20–80° (mặc định 54), `azimuth` −40…40° (mặc định 0), `zoom` 0,6–1,6 (mặc định 1, lớn hơn là gần hơn); màu là chuỗi `#rrggbb` (mặc định `#dcae8c`, `#b8893a`, `#8c6a2c`). `sanitizeViewSettings(unknown)` kẹp số vào giới hạn (NaN thì lấy mặc định), bỏ màu sai định dạng, thiếu trường thì lấy mặc định; không bao giờ ném. Lưu ở khoá `piano-daily:view-settings` dạng JSON; đọc/ghi bọc try/catch (bộ nhớ bị chặn thì vẫn chạy trong phiên, như `HANDS_PREF_KEY`); đọc sau khi mount (không lệch hydration). Camera: giữ công thức `fitCamera` hiện tại, khoảng cách chia cho `zoom`, vị trí quay quanh điểm nhìn `(width/2, 0, −4,5)` theo `azimuth`, độ cao theo `elevation`; mặc định cho đúng vị trí cũ. `PianoScene.setView(settings)` đổi camera và màu vật liệu (`skin`, `barWhite`, `barBlack` gồm cả `emissive`) tại chỗ, không dựng lại cảnh; màu phím đang bấm (`activeMat`) theo màu nốt rơi phím trắng để thanh chạm phím cùng màu. `PianoView` nhận prop `view` và gọi `setView` rồi vẽ lại (khi dừng) khi nó đổi. Bảng nằm trong `MidiPlayer`, chỉ hiện khi `use3d`, đóng/mở bằng nút có `aria-expanded`; thanh trượt và ô màu có nhãn, `aria-valuetext` hiển thị đơn vị, thao tác được bằng bàn phím; thay đổi lưu ngay, nút "Đặt lại mặc định" xoá lựa chọn đã lưu. Mọi chữ qua i18n `Player` (vi/en). Công tắc "Hiện bàn tay" và cài đặt này độc lập nhau.

**Quyết định của founder (phạm vi):** bảng dành cho mọi người xem, lưu theo từng trình duyệt; mặc định toàn site không đổi và không có mặc định chỉnh ở admin.

**Never:** Không đổi API, DB, trang admin hay CSP; không thêm dependency; không nạp `three` hoặc cảnh 3D sớm (test `midi-player-bundle` phải còn xanh); không đổi phím SVG khi không có WebGL hoặc khi giảm chuyển động (không có bảng); không lưu lên máy chủ hay gửi đi đâu.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mặc định | Chưa chỉnh gì | Cảnh y như trước (54°, 0°, 1, ba màu cũ) | N/A |
| Kéo thanh trượt | Đổi `elevation`/`azimuth`/`zoom` | Camera đổi ngay, khớp bàn phím vẫn trong khung, lưu lại | N/A |
| Đổi màu | Chọn `#3366ff` cho nốt phím trắng | Thanh nốt phím trắng và phím đang bấm đổi màu ngay, lưu lại | Màu sai định dạng: bỏ qua |
| Đặt lại | Bấm "Đặt lại mặc định" | Về mặc định, xoá mục đã lưu | N/A |
| Tải lại trang | Đã lưu cài đặt | Khôi phục sau khi mount | JSON hỏng hoặc ngoài giới hạn: kẹp/lấy mặc định |
| Bộ nhớ bị chặn | `localStorage` ném lỗi | Vẫn chỉnh được trong phiên | Nuốt lỗi |
| Không WebGL / giảm chuyển động | `use3d` sai | Không hiện bảng, giữ phím SVG | N/A |
| Đổi kích thước | Resize canvas | Giữ nguyên góc nhìn đã chỉnh, vẫn vừa khung | N/A |
| Đang phát/tua | Chỉnh khi đang phát | Phát và tay không bị ảnh hưởng | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/midi/scene3d/view-settings.ts` (mới) -- `ViewSettings`, `DEFAULT_VIEW_SETTINGS`, `VIEW_LIMITS`, `sanitizeViewSettings`, `readViewSettings`/`writeViewSettings`/`clearViewSettings` (localStorage try/catch).
- `apps/web/src/components/sheet/piano-scene.ts` -- `BRASS`, `BRASS_DARK`, `SKIN`; `fitCamera` (góc nâng 54° cố định); vật liệu `skin`, `barWhite`, `barBlack`, `activeMat`; thêm `setView` vào `PianoScene`.
- `apps/web/src/components/sheet/piano-view.tsx` -- nhận `view`, gọi `scene.setView` và vẽ lại.
- `apps/web/src/components/sheet/view-settings-panel.tsx` (mới) -- bảng thanh trượt, ô màu, nút đặt lại (không import `three`).
- `apps/web/src/components/sheet/midi-player.tsx` -- state `viewSettings` (mẫu `HANDS_PREF_KEY`/`readHandsPref`), nút mở bảng, truyền `view` xuống `PianoView`.
- `apps/web/src/messages/{vi,en}.json` -- namespace `Player` thêm chữ cho bảng.
- Test: `view-settings.test.ts`, `view-settings-panel.test.tsx`, `piano-view.test.tsx` (mock `setView`), `midi-player-hands.test.tsx` (mẫu test bật/tắt tay), `midi-player-bundle.test.ts` (không nạp sớm); README mục MIDI player.

## Tasks & Acceptance

**Execution:**
- [x] `lib/midi/scene3d/view-settings.ts` + test -- kiểu, mặc định, giới hạn, sanitize, đọc/ghi/xoá an toàn
- [x] `piano-scene.ts` -- camera theo `ViewSettings`, `setView` đổi màu vật liệu và camera tại chỗ
- [x] `piano-view.tsx` + test -- prop `view`, gọi `setView` và vẽ lại
- [x] `view-settings-panel.tsx` + test -- thanh trượt, ô màu, nhãn, đặt lại, bàn phím
- [x] `midi-player.tsx`, messages vi/en + test -- state, lưu, mở bảng chỉ khi `use3d`
- [x] README -- bảng tuỳ chỉnh, khoá lưu, giới hạn

**Acceptance Criteria:**
- Given người xem mở bảng và kéo "Góc nâng", when thả, then camera đổi ngay, lưu lại và tải lại trang vẫn giữ.
- Given người xem đổi màu nốt rơi, when chọn màu mới, then thanh nốt rơi (và phím đang bấm) đổi ngay mà không dựng lại cảnh.
- Given bấm "Đặt lại mặc định", when xong, then mọi giá trị về mặc định và mục lưu bị xoá.
- Given dữ liệu đã lưu bị hỏng hoặc ngoài giới hạn, when tải trang, then dùng giá trị hợp lệ gần nhất hoặc mặc định, không lỗi.

## Implementation Notes

- Triển khai trực tiếp (không subagent triển khai), theo lớp: `view-settings` (thuần) → `view-apply` (áp màu/camera, test ở Node) → cảnh/`PianoView` → bảng → `MidiPlayer`/i18n → README.
- `cameraPlacement` là công thức camera duy nhất; có test khẳng định cài đặt mặc định cho đúng vị trí cũ ở nhiều tỉ lệ khung và bề ngang. Màu và camera được tách sang `view-apply.ts` để test được mà không cần WebGL; `piano-scene.ts` chỉ gọi.
- `PianoView` truyền `view` vào `createPianoScene` (không nháy mặc định lúc nạp) và gọi `setView` + vẽ lại khi `view` đổi.
- Phím đang bấm theo màu nốt rơi phím trắng (quyết định của spec).
- Phạm vi do founder chốt: mọi người xem, lưu theo trình duyệt; chưa có mặc định toàn site ở admin.

## Spec Change Log

## Review Triage Log

- **medium | patch — Spec hứa bàn phím vẫn trong khung khi kéo thanh trượt nhưng xoay ±40° cắt gấp đôi theo chiều dọc và góc nâng 20° cắt ~13% theo chiều ngang (đo bằng chiếu bốn góc bàn phím):** `cameraPlacement` lùi xa vừa đủ (tìm nhị phân) để bốn góc nằm trong khung (cắt tối đa 5%, hoặc không tệ hơn khung mặc định ở tỉ lệ đó, nên mặc định giữ nguyên vị trí cũ); độ gần > 1 là phóng to có chủ ý; test lưới góc nâng × xoay × tỉ lệ khung.
- **medium | patch — Phần ghép trong `createPianoScene` (màu ban đầu từ `view`, `setView` đổi đúng vật liệu, resize giữ góc nhìn) không có test:** `piano-scene.test.ts` dùng `WebGLRenderer` giả (ghi lại cảnh và camera đã vẽ) và nạp model thật; kiểm màu da, hai màu nốt rơi, phím đang bấm, `emissive`, camera sau `setView` và `resize`, cảnh không dựng lại.
- **low | patch — `view` ban đầu và `setView` chỉ trộn với mặc định nên trường `undefined` hay ngoài giới hạn có thể làm camera NaN:** cả hai đều qua `sanitizeViewSettings`; có test.
- **low | patch — `PianoView` chạy lại `setView` và vẽ mỗi lần bật/tắt phát:** effect chỉ phụ thuộc `ready` và `view`, đọc `playing` qua ref.
- **low | patch — Trợ năng: tên của thanh trượt kèm giá trị (đọc hai lần cùng `aria-valuetext`), `aria-controls` trỏ tới phần tử chưa có khi bảng đóng:** `aria-labelledby` chỉ trỏ vào nhãn; `aria-controls` chỉ có khi bảng mở; có test.
- **low | patch — Độ gần hiển thị "1.00" và dấu chấm ở tiếng Việt:** `Intl.NumberFormat` theo ngôn ngữ, luôn có chữ số lẻ (vi 1,25; en 1.25).
- **low | patch — Phụ thuộc: `view-settings.ts` kéo `world.ts` (mã cảnh 3D) vào bundle ban đầu chỉ để lấy độ dài phím; test bundle chưa khẳng định cài đặt và bảng nằm ở bundle ban đầu:** tách `keyboard-geometry.ts` (thuần), `world.ts` xuất lại; thêm khẳng định ở test bundle và `view-apply.ts` vào danh sách không nạp sớm.
- **low | patch — Test: `document.body.innerHTML = ''` giữa hai lần render, ép kiểu `as never`; README thiếu giới hạn đã biết:** dùng `unmount`, dựng `Vector3` thật; README ghi giới hạn.
- **false — Stub `localStorage` của test bộ nhớ bị chặn không được khôi phục:** cấu hình vitest có `unstubGlobals: true` (đã kiểm), các test sau không bị ảnh hưởng.
- **false — Cam kết "không kéo three vào bundle ban đầu" chưa được kiểm:** test bundle đã dựng đồ thị nạp sớm của `midi-player.tsx` (gồm `view-settings.ts` và bảng) và khẳng định không có gói `three`; nay có thêm khẳng định tường minh.
- **low (rejected) — Ghi `localStorage` mỗi nấc thanh trượt; bảng không đóng bằng Escape/không chuyển tiêu điểm; `viewOpen` mở lại khi 3D trở lại; hai sự kiện `onChange` trước khi vẽ lại (sự kiện rời rạc của React được xử lý và vẽ lại tuần tự, không tái hiện được); không đồng bộ giữa tab và không có số phiên bản khoá; nhãn "Xoay trái – phải" chưa nói rõ camera hay cảnh; không kiểm tương phản màu; `isDefaultViewSettings` làm sạch trước khi so:** mỗi lần ghi chỉ ~150 byte, bảng là phần mở rộng gọn không có yêu cầu trợ năng riêng, còn lại hiếm hoặc chỉ là cách trình bày; vá cần thêm nhánh/tham số hơn lợi ích.
- **low (rejected) — Phím đen đang bấm theo màu nốt rơi phím trắng:** quyết định của spec (một vật liệu phím đang bấm); đã ghi trong README.

## Design Notes

Mặc định phải trùng giao diện hiện tại để người chưa chỉnh gì không thấy khác. `setView` đổi màu tại chỗ (không dựng lại vật liệu) nên không đụng vòng vẽ. Phím đang bấm theo màu nốt rơi phím trắng để thanh chạm phím cùng một màu.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint && pnpm build` -- expected: pass
- `pnpm --filter @piano-daily/web test` -- expected: pass (gồm `midi-player-bundle`)

**Manual checks (không có CLI):**
- Mở một Sheet có MIDI, bấm Play, mở "Tuỳ chỉnh cảnh 3D": kéo từng thanh trượt và đổi từng màu thấy đổi ngay; tải lại trang vẫn giữ; "Đặt lại" về như cũ.
