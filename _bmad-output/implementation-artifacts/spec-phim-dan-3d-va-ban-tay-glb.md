---
title: 'Phím đàn 3D góc nghiêng và bàn tay model GLB'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_commit: '27856923fcf7ae6db7e5f4cb55b465211358a427'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Bàn tay hiện là các ống hình trụ nhìn từ trên xuống phủ lên phím SVG, nên ngón không thể hiện được độ cong và việc đè phím; trông giả.

**Approach:** Khi player sẵn sàng, thay phím SVG bằng một cảnh three.js nhìn nghiêng từ phía người chơi: phím đàn 3D, nốt rơi 3D trên mặt đàn phía xa, và hai bàn tay từ model `hand-right.glb` (tay trái lật đối xứng), ngón điều khiển bằng xương để đầu ngón chạm đúng phím. Dùng lại logic chia tay/chọn ngón/đường đi cổ tay có sẵn (`lib/midi/hands/`). Phím SVG vẫn là trạng thái nghỉ trước khi nạp và là phương án dự phòng.

## Boundaries & Constraints

**Always:**
- Model đặt tại `apps/web/public/models/hand-right.glb` cùng `LICENSE-hand.md` (MIT, Amazon 2019, phải giữ thông báo bản quyền) và một dòng ghi công trong trang hoặc README. Nạp cùng origin; không tải gì từ domain ngoài.
- `three`, `GLTFLoader` và cảnh 3D chỉ nạp bằng `import()` động sau khi bấm Play (NFR6); bundle test bảo vệ. Vào trang vẫn chỉ hiện phím SVG tĩnh, không request model.
- Chỉ nạp lại model một lần mỗi phiên trang; tay trái dùng chung dữ liệu, lật đối xứng bằng scale âm.
- Tỉ lệ thật: một phím trắng rộng 1 đơn vị ≈ 23,5 mm; bàn tay co theo đó (model tính bằng mét, cao ~0,19 m).
- Hai tay không chéo nhau hay cùng bấm một phím (đã đảm bảo bởi `hand-path`); đầu ngón chạm đúng phím đang bấm, ngón nhấn làm phím lún và đổi màu brass.
- Không tạo đối tượng mới mỗi khung hình (dùng lại/instancing); pixel ratio tối đa 2; dọn tài nguyên khi gỡ.
- Phương án dự phòng là phím SVG hiện có (không bàn tay) khi: không có WebGL, bật giảm chuyển động, hoặc nạp model/cảnh lỗi. Không ném lỗi ra ngoài component.
- Camera cố định (không xoay bằng chuột), tỉ lệ khung `8:3`, đặt hằng số `VIEW_ASPECT` để chỉnh. Màu da một màu cố định.
- Công tắc "Hiện bàn tay" (mặc định bật, nhớ lựa chọn) giờ chỉ ẩn/hiện bàn tay trong cảnh; phím và nốt rơi 3D vẫn hiện.
- Dòng "Now playing" bằng chữ và nhãn `aria-label` của khung vẫn có; canvas là `role="img"`.

**Never:**
- Không đổi lõi phát, âm thanh, API, hay logic chia tay/ngón (chỉ tái dùng).
- Không texture/normal map mới, móng tay, nếp da (làm sau nếu cần).
- Không thêm dependency ngoài `three` đã có; loader lấy từ `three/examples/jsm`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Phát bình thường | Nốt đang bấm | Phím tương ứng lún và sáng brass, ngón đúng chạm phím | N/A |
| Nốt sắp tới | Trong cửa sổ nhìn trước | Thanh nốt rơi trên mặt đàn phía xa về phía phím đúng cột | N/A |
| Phím đen | Ngón bấm phím đen | Đầu ngón chạm mặt trên phím đen (cao hơn phím trắng) | N/A |
| Tua / đổi tốc độ | `t` bất kỳ | Tư thế tay đúng tại `t`, không giật | N/A |
| Tắt "Hiện bàn tay" | Công tắc tắt | Chỉ ẩn tay, phím và nốt rơi vẫn chạy | N/A |
| Không WebGL / giảm chuyển động | Môi trường thiếu | Dùng phím SVG, không tay, không công tắc | N/A |
| Lỗi nạp model | `.glb` 404 hoặc hỏng | Quay về phím SVG không tay | Không ném lỗi |
| Nốt ngoài dải phím | `midi` không có phím | Bỏ qua khi vẽ | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/midi/hands/hand-path.ts` -- `buildHandPath/poseAt` cho `tipX`, `reach`, `press`, `black`, `knuckleX`, cổ tay `x`; tái dùng nguyên.
- `apps/web/src/lib/midi/keyboard-layout.ts` -- `layoutKeyboard`, `Key.x/width`, `NoteIndex.window` (`active`, `falling` chuẩn hoá 0..1); `FALL_H/WHITE_H/BLACK_H/HANDS_EXTRA` chỉ còn dùng cho SVG.
- `apps/web/src/components/sheet/hands-overlay.tsx` + `hands-scene.ts` -- lớp phủ ống trụ hiện tại: thay bằng cảnh 3D đầy đủ (giữ cách nạp động, vòng rAF, `onUnavailable`).
- `apps/web/src/components/sheet/midi-player.tsx` -- khung, công tắc, `HandsOverlay` lazy, `getTime`; đổi thành chọn giữa cảnh 3D và `PianoKeyboard`.
- `apps/web/src/components/sheet/piano-keyboard.tsx` -- SVG, giữ làm trạng thái nghỉ và dự phòng.
- `apps/web/src/components/sheet/midi-player-bundle.test.ts` -- thêm kiểm tra `GLTFLoader`/cảnh 3D không vào bundle ban đầu.
- `apps/web/src/lib/csp.ts` -- `connect-src 'self'` đã đủ cho nạp `.glb` cùng origin; không đổi.
- `apps/web/src/lib/midi/hands/capabilities.ts` -- `canShowHands` (WebGL, giảm chuyển động) dùng để chọn 3D hay SVG.
- Mới: `public/models/{hand-right.glb,LICENSE-hand.md}`, `lib/midi/scene3d/{world.ts,hand-rig.ts}` (toán thuần: key→thế giới, mốc đầu ngón, ánh xạ tên xương; có test), `components/sheet/piano-scene.ts(x)` (three).

## Tasks & Acceptance

**Execution:**
- [x] `public/models/*` -- thêm model và giấy phép; ghi công -- bản quyền MIT
- [x] `lib/midi/scene3d/world.ts` (+test) -- ánh xạ phím/nốt rơi/ngón sang toạ độ 3D theo mm thật, vị trí mặt phím trắng/đen -- logic thuần
- [x] `lib/midi/scene3d/hand-rig.ts` (+test đọc `.glb` kiểm tên đủ 25 xương) -- ánh xạ ngón → chuỗi xương, mục tiêu đầu ngón, giới hạn góc khớp -- ngón chạm phím
- [x] `components/sheet/piano-scene.ts(x)` -- cảnh: phím lún, nốt rơi, hai tay GLB bằng xương, camera 3/4, dọn tài nguyên -- vẽ
- [x] `midi-player.tsx`, `hands-overlay` cũ, messages, bundle test -- chọn 3D hay SVG, công tắc chỉ ẩn tay, dự phòng -- tích hợp, NFR6
- [x] Kiểm tra bằng ảnh chụp Chrome headless ở vài thời điểm -- ngón chạm phím, tay không xuyên nhau

**Acceptance Criteria:**
- Given Sheet có MIDI, when vào trang chưa bấm Play, then chỉ có phím SVG tĩnh, không request `three` hay `.glb`.
- Given đã phát và môi trường đủ, when nốt đánh, then phím 3D lún sáng và ngón đúng chạm đúng phím; hai tay không xuyên nhau.
- Given `.glb` lỗi hoặc không WebGL, then hiện phím SVG, không tay, không báo lỗi bẩn.
- Given gỡ component, then renderer/geometry/material được `dispose`, không còn rAF.

## Implementation Notes

- Implement trực tiếp (không subagent). Model GLB xuất xương **phẳng** (không cha-con): `reparentSkeleton` dựng lại cây xương bằng `attach` rồi mới giải IK. Trục khớp (lấy bằng thực nghiệm): ngón 2–5 gập quanh trục X cục bộ (âm = gập vào lòng bàn tay), xoè quanh Y; ngón cái gập quanh Y, xoè quanh X; lòng bàn tay quay về −X của model.
- IK: bình phương tối thiểu có giảm chấn trên 3 tham số mỗi ngón, giải trên bản sao nhẹ của khung xương (`HandSolver`), kẹp giới hạn khớp; cổ tay đặt ở độ cao 3 phím, lùi 2 phím so với mép trước (chọn bằng tìm lưới để mọi ngón với tới phím trắng/đen, sai số < ~1 phím, ngón cái–phím đen là ngoại lệ hiếm).
- Camera cố định, tỉ lệ 2:1 (không phải 8:3 như dự kiến: 8:3 quá dẹt để thấy cả tay và vùng nốt rơi), nhìn xuống 54°; thêm cẳng tay hình trụ để không lộ mặt cắt cổ tay. `FALL_LENGTH` = 14 phím.
- Đã xoá `hands-overlay`/`hands-scene` (lớp phủ ống trụ cũ) và `HANDS_EXTRA`. Chuỗi 3D không có nhãn tên nốt (SVG có); dòng "Now playing" vẫn có.
- Kiểm tra hình: harness Vite + Chrome headless (ngoài repo), chụp ở vài thời điểm; ngón chạm đúng phím, hai tay không xuyên nhau.

## Spec Change Log

## Review Triage Log

Review tự rà soát trong phiên (chưa chạy reviewer subagent). Đã đọc lại diff, không phải review độc lập.

| Finding | Verdict | Evidence |
|---------|---------|----------|
| Khung 3D không có nhãn tên nốt như SVG | low | dòng "Now playing" bằng chữ vẫn có; thêm nhãn 3D để sau |
| Cảnh 3D chưa kiểm trên thiết bị thật (di động, GPU yếu) | maybe-false | cần xem thủ công hiệu năng; có `pixelRatio ≤ 2`, bể đối tượng cố định, không đổ bóng |

## Design Notes

- Model WebXR: xương `wrist`, `{thumb,index-finger,middle-finger,ring-finger,pinky-finger}-{metacarpal,phalanx-proximal,(intermediate),phalanx-distal,tip}`; ngón cái không có `intermediate`. Hướng/trục gập khớp chỉ biết khi xem tư thế gốc: dựng tay thử và chụp để suy ra trục gập, giới hạn nằm trong `hand-rig.ts`.
- Cách ép đầu ngón: giải IK chuỗi xương (CCD hoặc giải tích) tới mục tiêu mặt phím; cổ tay lấy `pose.x`.

## Verification

**Commands:**
- `npx vitest run` (trong `apps/web`) -- expected: các test mới và cũ qua, trừ `ads.test.ts` đã lỗi sẵn
- `npx eslint src` -- expected: không lỗi

**Manual checks (if no CLI):**
- Chụp Chrome headless cảnh thử ở vài thời điểm: ngón chạm phím, phím lún, nốt rơi đúng cột, tay trái đối xứng tay phải.
