---
title: 'Bàn tay 3D mô phỏng đánh piano trong MIDI player'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_commit: 'ed5fa862e54e8e3c4acffb454c15fb88fe4e2bd9'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** MIDI player chỉ cho thấy phím sáng và nốt rơi; người tập không thấy tay nào, ngón nào đánh nốt nào. note-JSON chỉ có nốt/thời điểm/lực, không có thông tin tay hay ngón.

**Approach:** Suy ra tay trái/phải và ngón (1–5) từ nốt bằng hàm thuần có test, tính trước toàn bộ đường đi của hai cổ tay, rồi vẽ hai bàn tay hình học bằng three.js phủ lên phím đàn SVG. Chuyển động là hàm thuần của thời điểm phát nên tua/đổi tốc độ không làm tay giật. Chỉ làm giai đoạn thuật toán và bàn tay hình học (chưa có model skin, chưa có bàn phím 3D).

## Boundaries & Constraints

**Always:**
- Mọi logic (chia tay, chọn ngón, đường đi cổ tay) nằm trong `apps/web/src/lib/midi/hands/` là hàm thuần, không import `three`/React, có test.
- Tính toán chạy một lần khi có `ParsedNotes`; `poseAt(t)` không giữ trạng thái (không tích phân theo khung hình), cho cùng `t` luôn ra cùng kết quả.
- Mặc định tắt. `three` và lớp vẽ chỉ nạp bằng `import()` động khi người dùng bật "Hiện bàn tay"; không vào bundle ban đầu (NFR6), bundle test phải bảo vệ điều này.
- Ẩn công tắc khi người dùng bật `prefers-reduced-motion` hoặc trình duyệt không có WebGL; player vẫn dùng bình thường.
- Dọn tài nguyên (geometry, material, renderer, rAF) khi tắt hoặc gỡ component. Không ném lỗi ra ngoài component.
- Chuỗi mới nằm trong `messages/{vi,en}.json` (namespace `Player`), giọng trang trọng, không emoji. Thêm `three` và `@types/three` đúng phiên bản `0.170.0`.

**Never:**
- Không đổi lõi phát (`player-core.ts`), âm thanh, hay dữ liệu/API note-JSON phía server.
- Không tải model/asset ngoài, không đổ bóng thời gian thực nặng, không bàn phím 3D.
- Không hứa ngón đúng như người chơi thật: UI phải ghi chú đây là mô phỏng gợi ý.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Hai track | ≥2 track có nốt | Track có cao độ trung bình thấp hơn = tay trái, cao hơn = tay phải | N/A |
| Một track | Mọi nốt cùng track | Chia theo cao độ quanh C4 (60) có trễ để không đổi bên liên tục; chuỗi nốt liền kề nhau giữ cùng tay | N/A |
| Hợp âm | Nhiều nốt cùng lúc một tay | Ngón gán tăng dần theo cao độ (tay phải: thấp→ngón 1, tay trái: thấp→ngón 5); tối đa 5 nốt/tay | Nốt thứ 6+ của một tay bỏ qua ngón (không vẽ) |
| Giai điệu | Dãy nốt liền bậc / nhảy xa | Quãng liền bậc dùng ngón kế tiếp; quãng xa mới dời cổ tay | N/A |
| Tua / đổi tốc độ | `t` bất kỳ | `poseAt(t)` đúng vị trí tại `t`, không cần chạy từ đầu | N/A |
| Nốt ngoài dải phím | `midi` không có trong `layout.byMidi` | Bỏ qua khi vẽ, không ảnh hưởng tay | N/A |
| Không WebGL / reduced-motion | Trình duyệt thiếu hoặc người dùng yêu cầu | Không hiện công tắc | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/midi/note-json.ts` -- `PlayerNote`, `parseNoteJson` gộp mọi track; thêm `track?: number` (chỉ số track không gõ) để chia tay. Test hiện có ở `note-json.test.ts`.
- `apps/web/src/lib/midi/keyboard-layout.ts` -- `layoutKeyboard`, `Key.x`/`width` theo đơn vị "phím trắng = 1": tái dùng để đặt ngón; `NoteIndex` để lấy nốt quanh `t`.
- `apps/web/src/components/sheet/piano-keyboard.tsx` -- SVG viewBox `whiteKeys × (FALL_H 5 + WHITE_H 3.4)`; lớp 3D phải khớp toạ độ này (không đổi file).
- `apps/web/src/components/sheet/midi-player.tsx` -- thêm công tắc và gắn lớp phủ; `core.position()` cho thời điểm; vòng cập nhật 30 khung/giây hiện có.
- `apps/web/src/components/sheet/midi-player-bundle.test.ts` -- thêm kiểm tra `three` không nằm trong đồ thị import tĩnh.
- `apps/web/src/messages/{vi,en}.json` -- namespace `Player`.
- Mới: `src/lib/midi/hands/{hand-split,fingering,hand-path}.ts` (+test), `src/components/sheet/hands-overlay.tsx` (nạp động), `hands-scene.ts` (three).

## Tasks & Acceptance

**Execution:**
- [x] `note-json.ts` (+test) -- thêm `track` vào `PlayerNote` -- nguồn chia tay
- [x] `lib/midi/hands/hand-split.ts` (+test) -- `assignHands(notes)`: ưu tiên track, nếu không thì cao độ + trễ -- ma trận Hai track/Một track
- [x] `lib/midi/hands/fingering.ts` (+test) -- `assignFingers`: DP chi phí theo chuyển động liền nhau, hợp âm gán theo cao độ -- Hợp âm/Giai điệu
- [x] `lib/midi/hands/hand-path.ts` (+test) -- `buildHandPath(notes, layout)` trả `poseAt(t)` cho từng tay: x cổ tay, ngón nào đang nhấn/sắp nhấn; nhìn trước ~0.3 s, giới hạn tốc độ tối đa, làm mượt bằng easing theo `t` -- ổn định, tua đúng
- [x] `hands-scene.ts` + `hands-overlay.tsx` -- bàn tay hình học (lòng bàn tay + 5 ngón nhiều đốt, co theo nhấn), camera trực giao khớp viền SVG, phủ lên vùng phím, `pointer-events: none`, dọn tài nguyên -- vẽ
- [x] `midi-player.tsx`, messages, `package.json`, bundle test -- công tắc, import động, ghi chú mô phỏng -- tích hợp, NFR6

**Acceptance Criteria:**
- Given Sheet có MIDI, when vào trang chưa bật công tắc, then không có request tải `three` và không có `<canvas>`.
- Given đang phát và đã bật, when nốt đánh, then đúng tay, đúng ngón chạm đúng phím và các ngón khác nhấc nhẹ; cổ tay không nhảy theo từng nốt trong cùng một thế tay.
- Given đang bật, when tua hoặc đổi tốc độ, then tay đứng đúng vị trí tại thời điểm mới, không giật.
- Given tắt công tắc hoặc rời trang, then renderer được `dispose`, không còn vòng rAF.

## Implementation Notes

- Không dùng subagent (người dùng chưa cho phép); implement trực tiếp.
- Hằng số hình học phím (`FALL_H`, `WHITE_H`, `BLACK_H`) chuyển từ `piano-keyboard.tsx` sang `keyboard-layout.ts` (cùng `HANDS_EXTRA`) để cảnh 3D dùng chung toạ độ mà không import từ component. Thêm `onset-groups.ts` và `capabilities.ts` (WebGL, reduced-motion) trong `lib/midi/hands/`.
- Camera trực giao nhìn từ trên xuống, canvas phủ SVG cộng thêm `HANDS_EXTRA` ở đáy cho lòng bàn tay. Nhấn ngón thể hiện bằng ánh brass và co đầu ngón (nhìn từ trên không thấy độ sâu).
- `midi-player-bundle.test.ts`: chuẩn hoá dấu phân cách đường dẫn (trước đó hỏng trên Windows).
- `three`/`@types/three` 0.170.0 cài qua `npx pnpm@12.6.0` (corepack cục bộ hỏng).
- Chưa kiểm tra bằng mắt trong trình duyệt (extension Chrome không kết nối); cần xem thủ công theo mục Verification.
- Lỗi có sẵn, không thuộc việc này: `src/lib/ads.test.ts` và các lỗi `tsc` ở `components/ads` (kiểu `@piano-daily/shared` cũ).

## Spec Change Log

## Review Triage Log

Review tự rà soát trong cùng phiên (chưa chạy ba reviewer subagent vì chưa được cho phép). Đã đọc lại diff, không phải review độc lập.

| Finding | Verdict | Evidence |
|---------|---------|----------|
| `midi-player-bundle.test.ts` so khớp đường dẫn bằng `/` nên hỏng trên Windows và khiến kiểm tra `not.toContain` mới của việc này đúng ngẫu nhiên | medium | patch: chuẩn hoá dấu phân cách trong `eagerGraph`; 8/8 test qua |
| Tay đúng/ngón đúng chỉ là heuristic, không bảo đảm khớp ngón đàn thật | low | đã ghi chú mô phỏng trong UI (`handsNote`); đúng ý định |
| Chưa xem được hình bàn tay trong trình duyệt (extension Chrome không kết nối) | maybe-false | cần xem thủ công: tay có nằm đúng phím, lòng bàn tay có hiện hết trong canvas; xem Verification |

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web test` -- expected: toàn bộ test qua
- `pnpm --filter @piano-daily/web typecheck` -- expected: không lỗi
- `pnpm --filter @piano-daily/web lint` -- expected: không lỗi

**Manual checks (if no CLI):**
- Mở `/vi/sheet/<slug>` có MIDI: bật "Hiện bàn tay", phát; kiểm tra hai tay ổn định, ngón nhấn khớp phím sáng; tua và đổi tốc độ không giật; Network chỉ nạp `three` sau khi bật.
