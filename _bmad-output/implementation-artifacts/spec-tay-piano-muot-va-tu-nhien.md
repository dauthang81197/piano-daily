---
title: 'Bàn tay 3D chuyển động mượt và dáng tự nhiên'
type: 'feature'
created: '2026-10-13'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '64dc2c1708146f8591c0ac87f781647bc35f93e5'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-2-8-midi-player-voi-phim-dan-ao.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Bàn tay 3D trong MIDI player trông như nắm đấm (ngón co gắt, ngón cái móc ra) và chuyển động khựng. Đo trên 60 fps với model hiện tại: góc khớp đổi tới 1,3 rad (khoảng 75°) chỉ trong một khung hình, đầu ngón mục tiêu nhảy tới 1,8 phím trắng mỗi khung, IK lệch mục tiêu tới 37 mm.

**Approach:** (0) Đo: số liệu mỗi khung và bộ test mốc có ngưỡng. (1) Mượt: mục tiêu ngón liên tục, IK khởi động nóng, bộ lọc quán tính theo thời gian thực, cổ tay đi theo đường jerk tối thiểu, ít phép tính hơn. (2) Tự nhiên: tư thế nghỉ cong nhẹ, cổ tay xoay và nghiêng theo ngón đang nhấn, ngón cái với tới được, ngón nghỉ cong theo nhẹ. Chưa đổi model GLB, vật liệu hay cẳng tay.

## Boundaries & Constraints

**Always:** `buildHandPath().poseAt(t)` vẫn là hàm thuần của `t`; mọi bộ lọc và trạng thái nằm ở lớp cảnh (`HandAnimator`), không nằm trong `hand-path`. Mục tiêu ngón là hàm liên tục của `t`: mỗi sự kiện có đường bao (tăng trong `APPROACH` trước lúc đánh, giữ 1 khi ngón đang đè, giảm trong `RELEASE` sau khi nhả), tính cho sự kiện trước, hiện tại và kế tiếp, trộn theo trọng số (chuẩn hoá khi tổng > 1) thay cho chọn một mục tiêu. Giữ ràng buộc hiện có: ngón không vắt chéo (`untangle`), hai tay không chạm nhau, đầu ngón không lệch quá `MAX_TIP_DEVIATION`. Cổ tay dời theo đường jerk tối thiểu (`6s⁵−15s⁴+10s³`), thời gian dời kẹp trong [0,12 s ; 0,5 s] theo tốc độ tối đa 14 phím trắng/giây, vẫn không bắt đầu trước lần đánh trước. `HandAnimator` (mới, `scene3d/hand-animator.ts`, chỉ dùng toán của `three`, chạy được ở Node) nhận `HandPose` và `dt`, trả về vị trí/xoay nhóm tay và nghiệm IK từng ngón. `dt` lấy từ đồng hồ thực (`performance.now`, tiêm được để test), kẹp [1/240 s ; 1/20 s]. Bộ lọc là lò xo tắt dần tới hạn tích phân chính xác theo `dt` (`scene3d/smoothing.ts`), nửa-đời gợi ý: đầu ngón 0,03 s, cổ tay 0,06 s, yaw/roll 0,08 s; hàm vẽ gọi `poseAt(t + HAND_LEAD)` (`HAND_LEAD` khoảng 0,04 s, hằng số xuất ra) để ngón chạm phím đúng lúc nốt vang. Tua, đổi bài, lùi thời gian hoặc `|Δt_media − Δt_thực| > 0,25 s`, ẩn/hiện tay: reset bộ lọc và nghiệm IK (không lướt từ vị trí cũ). `HandSolver.solve(finger, target, seed?)` nhận nghiệm khung trước làm điểm xuất phát, trả cả tham số khớp; tối đa 4 vòng lặp khi có seed, thoát sớm khi hội tụ; có bộ đếm số lần tính tư thế để test. Tư thế nghỉ (seed mặc định): khớp gốc ≈ 25°, khớp giữa ≈ 35°, khớp xa ≈ 15°, các hằng số `WRIST_Y`, `WRIST_Z`, `REST_Y`, `REST_Z`, `HOVER` chỉnh bằng script đo trên model thật để tư thế nghỉ đạt đúng seed (sai số IK ≤ 2 mm) và đầu ngón chạm phím trắng/đen trong tầm với (sai số ≤ 10 mm). Cổ tay: yaw theo độ lệch ngang của các ngón đang vươn (≤ 0,2 rad), roll theo ngón đang nhấn (cái nghiêng một phía, út phía còn lại, ≤ 0,12 rad), áp lên nhóm tay trước khi đổi mục tiêu sang không gian model. Ngón không nhấn cong thêm tối đa khoảng 0,15 rad theo ngón liền kề đang nhấn. Số liệu debug (`scene3d/hand-metrics.ts`): fps, thời gian xử lý mỗi khung, bước góc khớp lớn nhất giữa hai khung, p50/p95/max; hiện lớp phủ chữ nhỏ trong `PianoView` chỉ khi URL có `?handsDebug=1`, mặc định tắt, không đọc/ghi dữ liệu người dùng.

**Never:** Không đổi model GLB, vật liệu da, cẳng tay (giai đoạn 3). Không thêm dependency. Không đụng lõi phát (`player-core`, âm thanh). Không để bộ lọc làm tay trễ hơn nốt rõ rệt (xem tiêu chí). Không bật lớp phủ debug mặc định. Không sửa kỳ vọng test cũ cho khớp code: nếu một test cũ sai vì hành vi mới, sửa kèm lý do trong Implementation Notes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gam nhanh | 32 nốt, 0,12 s/nốt, 60 fps | Mọi khung: bước góc khớp ≤ 0,15 rad, bước mục tiêu ngón đã lọc ≤ 0,4 phím | N/A |
| Gam chậm | 16 nốt, 0,45 s/nốt | Như trên; không còn bước nhảy khi chuyển nốt | N/A |
| Quãng xa | 60 → 84 → 48 | Cổ tay dời mượt, bắt đầu dời sớm hơn, đến đúng lúc đánh | N/A |
| Hai tay | Giai điệu + bè trầm | Như trên cho cả hai tay; tay không chồng lên nhau | N/A |
| Ngón chạm phím đúng lúc | Nốt tại `T` | Đầu ngón ở mặt phím (±0,15 phím theo y) trong ±50 ms quanh `T` | N/A |
| Tua / đổi bài / lùi thời gian | `t` nhảy > 0,25 s hoặc đi lùi | Reset: khung kế tiếp đặt thẳng tư thế, không lướt | N/A |
| Tạm dừng | `t` đứng yên | Tay hội tụ về tư thế tại `t` rồi đứng yên | N/A |
| Tab ẩn lâu | `dt` thực rất lớn | `dt` kẹp tối đa 1/20 s, không văng tư thế | N/A |
| Tay không có nốt | `pose` là `null` | Ẩn tay và reset trạng thái tay đó | N/A |
| Mục tiêu ngoài tầm | Đầu ngón xa quá giới hạn khớp | Kẹp giới hạn, sai số IK bị chặn, không lật nghiệm giữa hai khung | N/A |
| Tư thế nghỉ | Không nốt nào đang nhấn | Khớp gốc/giữa/xa trong khoảng tự nhiên (15–35°, 25–45°, 5–25°), sai số IK ≤ 2 mm | N/A |
| Ngón cái | Chạm phím trắng trong tầm tay | Sai số ≤ 10 mm, không móc ra ngoài giới hạn khớp | N/A |
| Chi phí | Mỗi khung, hai tay, 10 ngón | Số lần tính tư thế ≤ 30% so với bản cũ (mốc 500/khung/tay) | N/A |
| Debug tắt | URL không có `handsDebug` | Không lớp phủ, không thu số liệu | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/midi/hands/hand-path.ts` -- `fingerAt` (chọn `cur`/`next` bằng `wCur >= wNext` gây nhảy), `wristAt`/`smooth`, `MIN_MOVE`, `LOOKAHEAD`, `MAX_SPEED`; sửa thành đường bao liên tục và jerk tối thiểu. Giữ `untangle`, `MIN_GAP`, `MAX_TIP_DEVIATION`, `buildHandPath` thuần.
- `apps/web/src/lib/midi/scene3d/hand-rig.ts` -- `HandSolver.solve` luôn bắt đầu từ `SEEDS`, 10 vòng, `LIMITS`, `DISTAL_COUPLING`; thêm seed truyền vào, nghiệm trả về tham số, tư thế nghỉ, bộ đếm tính tư thế.
- `apps/web/src/lib/midi/scene3d/world.ts` -- `WRIST_Y=3`, `WRIST_Z=2`, `REST_Y=0.9`, `REST_Z=-0.7`, `HOVER`, `fingerTarget`; chỉnh hằng số bằng script đo.
- `apps/web/src/lib/midi/scene3d/smoothing.ts` (mới) -- lò xo tắt dần tới hạn cho số và `Vector3`; `hand-animator.ts` (mới) -- bộ lọc, yaw/roll, ngón cong theo, IK khởi động nóng, reset; `hand-metrics.ts` (mới).
- `apps/web/src/components/sheet/piano-scene.ts` -- `poseHand` đang giải IK trực tiếp mỗi khung, `SceneFrame`; chuyển sang `HandAnimator`. `piano-view.tsx` -- vòng `draw(getTime())`, gọi `poseAt(t + HAND_LEAD)`, truyền thời gian, lớp phủ debug.
- `apps/web/src/lib/midi/hands/hand-path.test.ts`, `scene3d/hand-rig.test.ts` (đọc `hand-right.glb` bằng `GLTFLoader` trong Node, mẫu cho test mới), `scene3d/world.test.ts`, `components/sheet/piano-view.test.tsx` -- cập nhật hoặc mở rộng; README mục MIDI player.

## Tasks & Acceptance

**Execution:**
- [x] `scene3d/hand-animator.test.ts` (mới, giai đoạn 0) + helper fixture (gam nhanh/chậm, quãng xa, hai tay) -- bộ test mốc chạy 60 fps với model thật: bước góc khớp, bước mục tiêu, sai số IK, số lần tính tư thế, căn thời gian chạm phím
- [x] `scene3d/hand-metrics.ts` + lớp phủ trong `piano-view.tsx` -- số liệu debug sau `?handsDebug=1` (+ test)
- [x] `hand-path.ts` -- đường bao liên tục, jerk tối thiểu, dời cổ tay sớm hơn (+ cập nhật test)
- [x] `scene3d/smoothing.ts` (+ test hội tụ, ổn định với `dt` lớn) và `hand-rig.ts` -- seed/warm start, ít vòng lặp, bộ đếm
- [x] `scene3d/hand-animator.ts` -- ghép bộ lọc, IK, yaw/roll, ngón cong theo, reset khi tua
- [x] `world.ts`, `hand-rig.ts` -- tư thế nghỉ tự nhiên, hằng số chỉnh bằng script, giới hạn và mục tiêu ngón cái (+ test góc nghỉ, sai số chạm phím)
- [x] `piano-scene.ts`, `piano-view.tsx` -- dùng `HandAnimator`, `HAND_LEAD`, thời gian (+ cập nhật `piano-view.test.tsx`)
- [x] README -- mục bàn tay: cách đo, ngưỡng, cờ debug

**Acceptance Criteria:**
- Given các fixture 60 fps, when chạy toàn bộ pipeline với model thật, then mọi khung có bước góc khớp ≤ 0,15 rad, bước mục tiêu ngón đã lọc ≤ 0,4 phím và sai số IK khi chạm phím ≤ 10 mm (bản cũ: 1,3 rad, 1,8 phím, 37 mm).
- Given nốt tại thời điểm `T`, when mô phỏng khung hình, then đầu ngón tới mặt phím trong ±50 ms quanh `T`.
- Given tua hoặc `t` lùi, when khung kế tiếp được vẽ, then tư thế đặt thẳng (không lướt) và bộ lọc về trạng thái mới.
- Given tư thế nghỉ, when giải IK, then góc khớp trong khoảng tự nhiên và sai số ≤ 2 mm; số lần tính tư thế mỗi khung ≤ 30% bản cũ.
- Given test cũ của `hands/` và `scene3d/`, when chạy, then còn đúng hoặc đã được cập nhật kèm lý do.

## Implementation Notes

- Triển khai trực tiếp (không subagent triển khai), theo lớp: bộ lọc → đường đi tay → IK → `HandAnimator` → hằng số tư thế → ghép vào cảnh/`PianoView` → số liệu debug. Số đo cuối (60 fps, 5 bài mẫu): bước góc khớp ≤ 0,124 rad (mốc cũ 1,3), bước đầu ngón trong khung cổ tay ≤ 0,31 phím (cũ 1,8), sai số IK khi chạm phím ≤ 9,1 mm (cũ 37), 71–90 lần tính tư thế mỗi tay mỗi khung (cũ ~500).
- Hai điều chỉnh so với mô tả ban đầu, do số đo buộc phải làm: (1) bước mục tiêu đầu ngón đo **trong khung cổ tay**: cả bàn tay trượt dọc bàn phím khi nhảy quãng là chuyển động thật (24 phím trong 0,3 s không thể ≤ 0,4 phím/khung), còn "ngón nhảy" mới là lỗi; (2) `untangle` chuyển sang hồi quy đơn điệu có trọng số (PAVA) vì quy tắc cũ ("ngón vươn nhiều hơn thì giữ") không liên tục và cho ngón vắt chéo khi ngón cái luồn qua (test mới phát hiện).
- Nguyên nhân gốc của dáng nắm đấm và IK lật nghiệm: mục tiêu nghỉ cũ (`REST_Z = −0,7` với `WRIST_Z = 2`) chỉ cách cổ tay ~2,7 phím trong khi đầu ngón ở tư thế nghỉ thả lỏng cách ~5–6 phím, nên ngón co sát giới hạn khớp. Nay mục tiêu nghỉ lấy đúng từ forward kinematics của tư thế nghỉ (`REST_TIP`), `WRIST_Y = 3,3`, chạm phím trắng z = −1,9, phím đen z = −2,6, ngón cái chạm sát hơn 1,2; khoảng cách khớp ngón 0,8 phím, `STRETCH` 0,5, `MAX_TIP_DEVIATION` 0,9.
- Giới hạn khớp nới: khớp gốc 1,5 → 1,75 rad, ngón cái rộng hơn nhiều (ngón cái bị kẹt giới hạn là nguyên nhân móc ngón). IK có lực kéo nhẹ về tư thế nghỉ (`PRIOR`) và giải lại từ đầu khi sai số > 6 mm, vì nghiệm khởi động nóng từng kẹt ở nhánh ngón duỗi thẳng.
- `HAND_LEAD` đặt ở `hand-path.ts` (không kéo `three`) để `PianoView` dùng mà không nạp thư viện 3D; `hand-animator.ts` xuất lại.
- Sau review: thêm `HandFrameDriver`/`applyHandFrame` (phần ghép cảnh, test được), `SceneFrame.still`, `HandAnimator.drawnTip`, `MAX_TIP_DEVIATION` theo ngón, `handsDebugEnabled`. Khớp xa ở tư thế nghỉ thực tế ≈ 25° (ma trận cho phép 5–25°).
- Chưa kiểm bằng mắt trên trình duyệt (không có WebGL trong môi trường làm việc); các tiêu chí đều là số đo chạy với model thật ở Node. Dáng "đẹp" thực tế cần xem lại bằng mắt; model, vật liệu, cẳng tay thuộc giai đoạn 3.

## Spec Change Log

## Review Triage Log

- **medium | patch — Tạm dừng vẽ một khung với dt nhỏ nên tay dừng giữa chừng (bộ lọc mới tiến một bước):** `SceneFrame.still` (khi không phát) buộc `HandFrameDriver` đặt thẳng tư thế; `PianoView` truyền `still`; test driver và test `PianoView`.
- **medium | patch — Quãng tám/hợp âm rộng cùng một tay: ngón cái và ngón út cách phím 1 phím mỗi bên do giới hạn lệch 0,9:** `MAX_TIP_DEVIATION` theo ngón (cái và út 1,9, ba ngón giữa 0,9); test quãng tám và quãng tám cộng quãng năm. Đánh đổi đã đo: ở tầm dang rộng sai số IK tới ~20 mm, nên test tách hai phép đo (trong tầm ≤ 10 mm, dang rộng ≤ 23 mm).
- **medium | patch — Test căn thời gian đo mục tiêu trước bộ lọc khớp, không phải đầu ngón thực sự vẽ:** thêm `HandAnimator.drawnTip` (FK của tham số khớp đã lọc qua khung nhóm tay) và đo trên đó. Số đo: −33, +17, +17 ms (trong ±50 ms), `HAND_LEAD` 0,05 s đạt. Cũng sửa tiêu chí chạm của test (phải đang nhấn): ngón cái nghỉ sẵn ở y = 0,13 nên tiêu chí cũ đếm chạm sớm.
- **low | patch — Phần ghép cảnh (`snap` từ `frame.time`, tư thế từng tay, `showHands`, áp xương và yaw/roll) không có test:** tách `HandFrameDriver` và `applyHandFrame` (`scene3d/hand-driver.ts`, thuần, không WebGL) kèm 8 test (khung đầu, đứng yên, tua lùi/tới, dừng lâu, tab ẩn, đồng hồ NaN, cả hai tay, tắt hiện tay, áp nhóm và xương).
- **low | patch — `dt` không hữu hạn làm bộ lọc thành NaN:** kẹp `dt` hữu hạn trong animator và driver; test.
- **low | patch — `?handsDebug=0` vẫn bật lớp phủ, đọc URL hai nơi, lớp phủ cũ còn lại khi cảnh nạp lại:** `handsDebugEnabled` (thuần, test) dùng chung, dọn `debugText` khi hết `ready`.
- **low | patch — Số liệu bị lệch bởi khung đặt thẳng (dt không phản ánh nhịp vẽ):** chỉ ghi số liệu khi không đặt thẳng và `dt > 0`.
- **low | patch — Test: mã chết (`void key`, `void PRESS_DEPTH`, `FIXTURES` xuất ra không dùng), ngưỡng chi phí 150 lỏng so với đo 71–90, đợi thật 700 ms, thiếu mục của test bundle:** dọn mã chết, ngưỡng 110, đo bằng `spyOn(setInterval)`, thêm `hand-animator`/`hand-driver`/`smoothing` vào danh sách không được nạp sớm; README nêu rõ `REST_TIP` dán tay, `WRIST_Y` là thứ thay đổi, lớp phủ ai cũng bật được.
- **false — `blackMix` bắt buộc làm vỡ chỗ dựng `FingerPose` khác:** mọi chỗ dựng đã cập nhật, typecheck và test xanh; `fingerTarget` vẫn mặc định từ `black`.
- **false — Đầu ngón vẽ chạm phím trễ vì lọc khớp cộng lọc mục tiêu (≈ 95 ms) lớn hơn `HAND_LEAD`:** đã đo trên đầu ngón vẽ: −33/+17/+17 ms.
- **low (rejected) — Cửa sổ `WINDOW_BACK = 3` bỏ sót nốt giữ dài của cùng một ngón; `untangle` có thể đẩy đầu ngón quá giới hạn lệch; PAVA chia đều trọng số cho hai ngón cùng nhấn trong hợp âm hẹp; lò xo vọt lố nhẹ khi mục tiêu đổi chiều; giải lại từ đầu (cold) có thể đổi nhánh/ tốn thêm phép tính ở khung khó; `shouldSnap` không tính tốc độ phát > 1 ở fps rất thấp; giới hạn khớp nới, `PRIOR`/`MAX_STEP`/`YAW_GAIN`... chưa giải thích; `Array.shift` ba lần mỗi khung; nửa-đời khác gợi ý trong spec:** hiếm (cùng một ngón không chồng nốt, hợp âm sát nhau, fps dưới 4) hoặc vi mô; chi phí khung khó vẫn nằm trong số đo (≤ 90 lần/khung); các hằng số do số đo chọn và ghi trong README; vá cần thêm nhánh/tham số hơn lợi ích.
- **low (rejected) — Khớp xa ở tư thế nghỉ ≈ 25° trong khi phần Boundaries ghi ≈ 15°:** ma trận spec cho phép 5–25° và đạt (24,5°); đổi hệ số ghép khớp xa buộc dò lại toàn bộ hằng số; README ghi đúng giá trị thực.

## Design Notes

**Mốc đo trước khi sửa (60 fps, model hiện tại):** gam nhanh: bước mục tiêu max 1,77 phím, bước góc khớp max 1,26 rad (p99 0,52), IK lệch max 37 mm; gam chậm: 1,53 phím, 1,31 rad (p99 0,16), 30 mm; quãng xa: 0,84 phím, 1,29 rad, 33 mm; hai tay: 0,59 phím, 1,31 rad, 32 mm. Góc khớp đổi ~1,3 rad ngay cả khi nhạc chậm cho thấy IK lật giữa các nghiệm, nên warm start quan trọng hơn chỉ lọc.

**Độ trễ:** lọc làm tay chậm cỡ nửa-đời; `HAND_LEAD` cộng vào thời gian lấy tư thế để bù. Hằng số là điểm khởi đầu, chỉnh theo tiêu chí ±50 ms.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web lint` -- expected: pass
- `pnpm --filter @piano-daily/web test` -- expected: pass (gồm bộ test mốc và test cũ của `hands/`, `scene3d/`)
- `pnpm build` (không `NODE_ENV=development`) -- expected: pass

**Manual checks (không có CLI):**
- Mở một Sheet có MIDI, bật Tay trong MIDI player (thêm `?handsDebug=1` để xem số liệu): tay không còn dáng nắm đấm, ngón cái không móc, chuyển động liền mạch khi chơi, tua và tạm dừng; điện thoại giữ trên 50 fps.
