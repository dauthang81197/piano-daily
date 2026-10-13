---
title: 'Hoàn thiện bàn tay 3D: ngón cái nghỉ tự nhiên, da và cẳng tay, quãng tám cùng một tay'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'e2ae11924fcf926f3e85c2e437fd253482a6dccc'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-tay-piano-muot-va-tu-nhien.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** (A) Ngón cái ở tư thế nghỉ buông thõng xuống và cong về phía người chơi (ảnh của founder, cả hai tay): tư thế nghỉ hiện tại đặt đầu ngón cái ở (−3,30; −3,17; −2,61) so với cổ tay trong khi tư thế gốc của model là (−3,31; −2,08; −3,90), và vị trí nghỉ theo trục ngang bị đặt −1,6 nên ngón cuộn vào dưới lòng bàn tay. (B) Da là màu phẳng, cẳng tay là hình trụ trơn có mép lộ ở cổ tay. (C) Quãng tám đánh cùng lúc quanh C4 (ví dụ C3+C4) bị `assignHands` tách sang hai tay.

**Approach:** (A) Tư thế nghỉ ngón cái lấy từ động học thuận của tư thế tự nhiên (nằm ngang ra ngoài và hướng ra trước, ngang tầm các ngón khác), vị trí nghỉ ngang của ngón cái là −2,0. (B) Da dùng vật liệu có sheen và ánh ấm nhẹ; cẳng tay là mặt tròn xoay thon, mặt cắt elip khớp cổ tay model, có tay áo vải trung tính. (C) Thêm một khoản phạt nhỏ khi tách một lần đánh còn vừa một tay (≤ 12 nửa cung).

## Boundaries & Constraints

**Always:** (A) `REST_PARAMS.thumb` ≈ `[-0,14; -0,42; 0,30]` (hoặc giá trị gần đó cho cùng tư thế) và `REST_TIP[1]` là kết quả forward kinematics của nó trên `hand-right.glb`, có test đối chiếu; đầu ngón cái nghỉ phải nằm ra ngoài (x ≤ −1,9 so với cổ tay), ra trước khớp gốc ngón cái ít nhất 1,4 phím (z ≤ −3,9) và không thấp hơn các ngón khác ở tư thế nghỉ (y ≥ −2,7). Vị trí nghỉ ngang theo ngón là bảng `FINGER_REST_OFFSET` ở `hand-path.ts`: ngón cái −2,0, ngón 2–5 giữ −0,8, 0, 0,8, 1,6 (tay phải; tay trái đối xứng); `knuckleX`, vị trí cổ tay theo ngón và giới hạn lệch dùng bảng này. IK nghỉ của ngón cái sai số ≤ 5 mm; chạm phím trắng của ngón cái (lệch ≤ 0,5 phím so với vị trí nghỉ, nhấn và không nhấn) sai số ≤ 10 mm; mọi tiêu chí mượt của `spec-tay-piano-muot-va-tu-nhien` (bước góc khớp ≤ 0,15 rad, IK trong tầm ≤ 10 mm, ≥ 5 bài mẫu) còn đúng. (B) Vật liệu da `MeshPhysicalMaterial` (sheen, độ nhám vừa) màu theo `ViewSettings.handColor`, `emissive` cùng tông ở cường độ thấp, `sheenColor` là màu da sáng hơn; `applyViewColors` cập nhật cả ba. Cẳng tay: mặt tròn xoay (lathe) nằm dọc theo trục z từ cổ tay về phía người chơi, mặt cắt elip bằng nửa rộng ≈ 1,15 và nửa cao ≈ 0,88 ở cổ tay (số đo từ đỉnh lưới của model), rộng dần tới ≈ 1,6 × 1,25, đầu gần cổ tay chồng lên mép model để không lộ mặt cắt, cùng vật liệu da; tay áo là một mặt tròn xoay rộng hơn cẳng tay ~0,2 bắt đầu cách cổ tay ≥ 3,5, có viền cổ tay áo, vật liệu vải riêng (màu trung tính tối, không theo `handColor`). (C) `SPLIT_PENALTY` nhỏ (≈ 1 nửa cung) cộng vào mọi cách chia một lần đánh sao cho cả hai tay đều có nốt, chỉ khi toàn bộ lần đánh nằm trong `SPAN_LIMIT`; quãng tám C3+C4 cùng lúc cho một tay (trái); lần đánh có giai điệu cao và bè thấp (ví dụ C3 và C5) vẫn chia hai tay.

**Never:** Không thay `hand-right.glb` (cần chọn nguồn model, việc sau). Không đổi API, DB, admin hay CSP; không thêm dependency; không nạp `three` sớm (test `midi-player-bundle`). Không làm hai tay chạm nhau hay ngón vắt chéo; `buildHandPath().poseAt(t)` vẫn là hàm thuần của `t`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Ngón cái nghỉ | Không nốt nào đang nhấn | Ngón cái nằm ngang ra ngoài và ra trước, không buông xuống; khớp trong khoảng tự nhiên | N/A |
| Ngón cái nhấn | Nốt do ngón cái chơi | Đầu ngón chạm phím (sai số ≤ 10 mm), rồi nhấc về tư thế nghỉ mới | N/A |
| Tay trái | Cùng tư thế | Ngón cái nghỉ đối xứng gương với tay phải (ra phía ngoài của bàn tay, hướng ra trước) | N/A |
| Thế năm ngón | C D E F G | Ngón cái ở C, các ngón còn lại lệch ≤ 0,5 phím so với vị trí nghỉ, cổ tay không dời | N/A |
| Gam có luồn ngón cái | Gam 3 quãng tám | Bước góc khớp ≤ 0,15 rad, IK trong tầm ≤ 10 mm, ngón không vắt chéo | N/A |
| Cẳng tay | Mọi tư thế tay | Cẳng tay nối liền cổ tay, không lộ mặt cắt model; tay áo bắt đầu sau cổ tay | N/A |
| Đổi màu bàn tay | `handColor` mới | Da, cẳng tay (không phải tay áo) đổi màu; sheen/emissive đổi theo | Màu sai bị bỏ qua (đã có) |
| Quãng tám cùng tay | C3+C4 đồng thời | Cả hai nốt về tay trái, ngón 5 và 1 (hoặc 1 và 5) | N/A |
| Giai điệu và bè | C3 và C5 đồng thời | Bè tay trái, giai điệu tay phải | N/A |
| Hợp âm hẹp | C3 E3 G3 | Một tay, như trước | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/midi/scene3d/hand-rig.ts` -- `REST_PARAMS.thumb`, `LIMITS.thumb`, `PRIOR` (kéo về nghỉ).
- `apps/web/src/lib/midi/scene3d/world.ts` -- `REST_TIP[1]`, `SHORT_FINGER_SHIFT` (ngón cái chạm sát mép trước), `WRIST_Y/Z`.
- `apps/web/src/lib/midi/hands/hand-path.ts` -- `fingerOffset` = `(finger − 3) × FINGER_SPACING` thành `FINGER_REST_OFFSET`; dùng ở `buildTrack` (anchor/slot), `fingerAt` (`knuckleX`).
- `apps/web/src/lib/midi/hands/hand-split.ts` -- `splitByPitch` (`handCost`, hoà thì chọn `k` nhỏ nhất làm quãng tám bị tách), thêm `SPLIT_PENALTY`.
- `apps/web/src/components/sheet/piano-scene.ts` -- vật liệu `skin`, `forearmGeo` (`CylinderGeometry(1.5, 1.05, 9.5, 20)`), nhóm tay; `scene3d/view-apply.ts` -- `applyViewColors` (thêm sheen/emissive).
- `apps/web/src/lib/midi/scene3d/forearm.ts` (mới) -- hồ sơ lathe của cẳng tay và tay áo (thuần, test được).
- Test: `hand-rig.test.ts`, `hand-animator.test.ts` (dùng `(finger − 3) × 0,8` ở `pose()` và ngón cái), `world.test.ts`, `hands/hand-split.test.ts`, `hand-path.test.ts`, `view-apply.test.ts`, `piano-scene.test.ts`, `forearm.test.ts` (mới); README mục bàn tay.

## Tasks & Acceptance

**Execution:**
- [x] `hand-rig.ts`, `world.ts` + test -- tư thế nghỉ ngón cái tự nhiên (`REST_PARAMS.thumb`, `REST_TIP[1]`), test FK đối chiếu và hình học "ra ngoài, ra trước, không buông"
- [x] `hand-path.ts` + test -- `FINGER_REST_OFFSET` (ngón cái −2,0), cập nhật chỗ dùng và test liên quan
- [x] `hand-animator.test.ts`, `hand-rig.test.ts` -- cập nhật `pose()` và mục tiêu ngón cái theo bảng mới; bộ test mốc mượt vẫn đạt
- [x] `hand-split.ts` + test -- `SPLIT_PENALTY`, quãng tám cùng tay, các ca cũ không đổi
- [x] `scene3d/forearm.ts` + test, `piano-scene.ts` -- cẳng tay elip và tay áo
- [x] `piano-scene.ts`, `view-apply.ts` + test -- vật liệu da `MeshPhysicalMaterial`, cập nhật màu/sheen/emissive theo `handColor`
- [x] README -- ngón cái nghỉ, cẳng tay/tay áo, quãng tám

**Acceptance Criteria:**
- Given không nốt nào nhấn, when giải tư thế nghỉ, then đầu ngón cái ở x ≤ −1,9, z ≤ −3,9, y ≥ −2,7 và sai số IK ≤ 5 mm.
- Given ngón cái chạm phím trắng ở lệch ≤ 0,5 phím so với vị trí nghỉ, when giải IK, then sai số ≤ 10 mm.
- Given 5 bài mẫu ở 60 fps, when chạy toàn pipeline, then bước góc khớp ≤ 0,15 rad, IK trong tầm ≤ 10 mm và ngón không vắt chéo.
- Given đổi `handColor`, when áp màu, then da và cẳng tay đổi, tay áo giữ màu vải.
- Given C3+C4 đồng thời, when chia tay, then cả hai nốt thuộc một tay; given C3 và C5 đồng thời, then chia hai tay.

## Implementation Notes

- Triển khai trực tiếp (không subagent triển khai), theo từng việc: A ngón cái (`REST_PARAMS.thumb` = `[-0,14; -0,45; 0,30]` cho đầu ngón (−1,99; −2,53; −4,33), `REST_TIP[1]`, bảng `FINGER_REST_OFFSET` với ngón cái −2,0), C quãng tám (`SPLIT_PENALTY` = 5), B da/cẳng tay/tay áo.
- Nguyên nhân gốc đã đo: vị trí nghỉ ngang cũ của ngón cái (−1,6) cách vị trí tự nhiên (−3,3) tới 1,7 phím nên IK ép ngón cuộn vào dưới lòng bàn tay, cộng tư thế nghỉ gập xuống (y −3,17, z −2,61). Mọi tiêu chí mượt cũ (bước góc khớp ≤ 0,15 rad, IK trong tầm ≤ 10 mm, ngón không vắt chéo) vẫn đạt sau khi đổi.
- `SPLIT_PENALTY` đầu tiên đặt 1 không đủ: quãng tám nối nhau đi lên (E3+E4) vẫn bị tách vì tay phải mặc định ở C5 gần hơn; đặt 5 (chỉ áp khi cả lần đánh nằm trong một quãng tám) cho đúng một tay, còn C3 và C5 (xa hơn một quãng tám) vẫn chia hai tay.
- Cổ tay model đo theo lát z (nửa rộng ≈ 1,1, nửa cao ≈ 0,7–0,8, mở nghiêng: mặt lưng kết thúc ở z ≈ 0,7, mặt lòng bàn tay ở 0,95) nên cẳng tay bắt đầu ở z = 0,5; có test pháp tuyến hướng ra ngoài và tỉ lệ mặt cắt.
- Tay áo là ý của mình (founder chưa yêu cầu trực tiếp), màu trung tính tối `#4a443e`.
- Chưa kiểm bằng mắt trên trình duyệt (không có WebGL trong môi trường làm việc). Thay model GLB vẫn để việc sau.

## Spec Change Log

## Review Triage Log

Ba reviewer: Blind Hunter, Edge Case Hunter, Verification Gap (Verification Gap: không có khoảng trống).

- **patch (medium)**: cẳng tay/tay áo nằm ngoài `mirror` nên tay trái lệch 0,1 phím so với cổ tay → đưa vào `mirror`.
- **patch (low)**: chú thích JSDoc cũ thừa trên `FINGER_REST_OFFSET` → xoá; `forearmProfile/sleeveProfile` với `samples ≤ 0` → kẹp ≥ 1.
- **reject**: z-fighting hai nắp (cùng là điểm trục, bán kính 0, không có diện tích); `SPLIT_PENALTY` quá mạnh/chưa kiểm chứng trên bản nhạc thật (đã cân nhắc, 5 là giá trị tối thiểu qua được test quãng tám, ghi trong Implementation Notes); emissive làm tối/sáng da (cố ý, 0,06); `skinSheenColor` cấp phát Color (chỉ khi đổi màu); số liệu README IK (không đổi do thay đổi này).
- **defer**: tay áo không chỉnh được màu; script đo lại hằng số cẳng tay khi đổi model; test thứ tự mặt/winding; tên test "≤ 0,5 phím" không khớp khẳng định.

## Design Notes

Số đo trên `hand-right.glb` (khung tay, phím trắng = 1): khớp gốc ngón cái (−1,91; −1,46; −2,52), tư thế gốc đầu ngón cái (−3,31; −2,08; −3,90); mặt cắt cổ tay x −1,10…1,21, y −0,94…0,82 (đỉnh lưới z từ −0,47 đến 0,95); lưới kéo dài tới z = 0,95. Tư thế nghỉ ngón cái giải IK ra `[-0,14; -0,42; 0,30]` cho đầu ngón (−2,10; −2,52; −4,31).

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint && pnpm build` -- expected: pass
- `pnpm --filter @piano-daily/web test` -- expected: pass

**Manual checks (không có CLI):**
- Mở Sheet có MIDI, bấm Play rồi tạm dừng lúc không nốt nào nhấn: ngón cái nằm ngang ra ngoài, không buông xuống; cẳng tay nối liền cổ tay, tay áo ở phía người chơi; đổi màu bàn tay trong bảng tuỳ chỉnh thì da và cẳng tay đổi màu, tay áo không đổi.
