---
title: 'Khoá học piano C1b: khuông nhạc chạy nốt đồng bộ với player (khuông trái, bàn tay/phím phải)'
type: 'feature'
created: '2026-10-15'
status: 'in-review'
baseline_commit: '42303f2'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{implementation_artifacts}/spec-khoa-hoc-noi-dung.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trang bài học đã có player với phím 3D và bàn tay mô phỏng, nhưng người học chưa thấy **khuông nhạc**. Founder muốn lúc Play thì thấy nốt chạy trên khuông nhạc (bên trái) cùng lúc bàn tay đánh phím (bên phải).

**Approach:** Dựng khuông nhạc **hai khuông (khoá Sol + khoá Fa)** từ chính note-JSON của bài (`midi.toJSON()` đã có `ticks`, `durationTicks`, nhịp, tempo), bằng thư viện **VexFlow** nạp động. Mỗi ô nhịp được lượng tử về lưới 1/16, nốt đang phát được tô màu, có vạch phát (playhead) và khuông tự cuộn theo vị trí; bấm vào một ô nhịp thì tua tới đó. Khuông chỉ bật cho **trang bài học** (tuỳ chọn `notation` của `MidiPlayer`), không đổi trang sheet. Trình gõ nốt (C1c) và các giai đoạn C2–C5 làm sau.

## Boundaries & Constraints

**Always:**
- `MidiPlayer` nhận prop tuỳ chọn `notation` (mặc định tắt). Bật thì bố cục thành hai cột từ màn hình rộng (≥ `lg`): **khuông nhạc bên trái, cảnh bàn tay/phím bên phải**; màn nhỏ xếp dọc (khuông trên, phím dưới). Không bật thì giao diện và hành vi hiện tại giữ nguyên (trang sheet không đổi).
- Dữ liệu: mở rộng phân tích note-JSON để giữ thêm `ticks`, `durationTicks` của từng nốt và phần đầu `ppq`, `tempos`, `timeSignatures`; các trường mới tuỳ chọn nên player và test hiện có không đổi. Note-JSON thiếu tick (hoặc hỏng) thì bỏ khuông, player vẫn chạy.
- Chia hai khuông: dùng lại bộ chia tay hiện có (`hands/hand-split`) — tay phải → khoá Sol, tay trái → khoá Fa. Ô nhịp theo ô nhịp đầu tiên của bài (mặc định 4/4 nếu thiếu); đổi nhịp giữa bài được hỗ trợ theo `timeSignatures`.
- Lượng tử: lưới 1/16 theo `ppq`; nốt cùng thời điểm thành hợp âm; độ dài hiển thị = độ dài thật làm tròn lưới, nhưng không chồng lên nốt kế tiếp của cùng khuông (cắt tại nốt kế); nốt vắt qua vạch nhịp được tách và nối bằng dấu luyến; khoảng trống thành dấu lặng. Đây là **bản hiển thị gần đúng để học**, không phải bản dàn trang chuẩn; không hỗ trợ nốt chùm ba/tuplet (gần đúng về 1/16), không chiết âm theo giọng (nốt hoá hiển thị bằng dấu thăng).
- Đồng bộ: dùng đúng đồng hồ của `PlayerCore` (`position()` qua `requestAnimationFrame`, ≤ 30 khung/giây như phần phím). Nốt đang vang được tô màu; vạch phát chạy theo vị trí; khuông cuộn để ô nhịp hiện tại luôn trong tầm nhìn (không cuộn mượt khi người dùng bật giảm chuyển động). Tua thanh trượt hoặc bấm ô nhịp đều đồng bộ lại ngay.
- Hiệu năng: VexFlow nạp động (cùng lúc với Tone/note-JSON ở lần bấm Play đầu tiên, tách khỏi bundle ban đầu). Chỉ dựng SVG cho dòng ô nhịp đang xem ± 1 dòng; tối đa `MAX_NOTATION_MEASURES = 120` ô nhịp đầu (quá thì hiện ghi chú "chỉ hiển thị phần đầu"); nốt tô màu cập nhật bằng cách đổi lớp CSS, không dựng lại SVG mỗi khung.
- Trước khi bấm Play hiện khung chờ ngắn (không tải VexFlow); lỗi dựng khuông thì ẩn khuông, báo ngắn, phím/bàn tay vẫn hoạt động. Nút bật/tắt "Khuông nhạc" nhớ lựa chọn (localStorage có try/catch).
- Truy cập: khối khuông có `role="img"` + nhãn tên bài (nội dung SVG `aria-hidden`), nút tắt/bật là `button` có `aria-pressed`; màu nốt đang chơi đạt tương phản và kèm đường viền/vạch phát (không chỉ dựa vào màu). Chuỗi giao diện song ngữ vi/en.
- Thêm phụ thuộc `vexflow` (MIT) vào `apps/web`; kiểm tra CSP (SVG nội tuyến, không cần nguồn mới); test `midi-player-bundle` mở rộng để chứng minh VexFlow không nằm trong bundle ban đầu.

**Never:**
- Không đổi mã bàn tay/cảnh 3D, `PlayerCore`, âm thanh; không đụng trang sheet, thuê bao, API/DB (C1b chỉ ở web + shared nếu cần).
- Không soạn/sửa nốt (C1c), không xuất PDF/in, không đánh dấu ngón tay, không tuplet/giọng/ghi chú diễn tấu.
- Không tự động phát khi tải trang; không tải VexFlow trước lần bấm Play đầu tiên.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bài có nhạc | Bấm Play lần đầu | Khuông hai khoá hiện bên trái, phím/tay bên phải; nốt đang vang được tô; vạch phát chạy; khuông cuộn theo | N/A |
| Hợp âm / hai tay | Nốt cùng lúc | Hợp âm trên cùng khuông; tay phải ở khoá Sol, tay trái ở khoá Fa | N/A |
| Khoảng lặng | Khuông không có nốt trong một đoạn | Dấu lặng đúng độ dài | N/A |
| Nốt vắt qua vạch nhịp | Nốt dài hơn phần còn lại của ô | Tách hai nốt, nối dấu luyến | N/A |
| Tua | Kéo thanh tua / bấm một ô nhịp | Vạch phát và nốt tô nhảy tới đó, âm theo vị trí mới | N/A |
| Đổi tốc độ | 0,5×–2× | Khuông vẫn khớp (dùng vị trí của lõi) | N/A |
| Bài rất dài | > 120 ô nhịp | Hiện 120 ô đầu + ghi chú; player phát đủ cả bài | N/A |
| Note-JSON không có tick / lỗi dựng | JSON cũ hoặc VexFlow ném lỗi | Ẩn khuông, hiện ghi chú ngắn; phím/tay vẫn chạy | Không làm hỏng player |
| Giảm chuyển động | `prefers-reduced-motion` | Cuộn tức thì, không hiệu ứng | N/A |
| Trang sheet | Không truyền `notation` | Không đổi gì, không tải VexFlow | N/A |
| Tắt khuông | Bấm "Khuông nhạc" | Ẩn khuông, giữ lựa chọn lần sau | localStorage lỗi thì dùng mặc định bật |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/midi/note-json.ts` -- giữ thêm `ticks/durationTicks` + `header` (ppq, tempos, timeSignatures) trong `ParsedNotes`; giữ tương thích.
- `apps/web/src/lib/midi/notation/` (mới) -- `quantize.ts` (nốt → ô nhịp/lượng tử/hợp âm/lặng/luyến, thuần tính toán, dễ test), `layout.ts` (ô nhịp → dòng, ánh xạ thời gian ↔ ô nhịp/nốt), `render.ts` (VexFlow, nạp động), `active.ts` (nốt đang vang theo vị trí).
- `apps/web/src/components/sheet/notation-view.tsx` (mới, client, nạp động) -- dựng SVG theo dòng, tô nốt, vạch phát, cuộn, bấm ô nhịp tua; `midi-player.tsx` -- prop `notation`, bố cục hai cột, nút bật/tắt, cấp `position`/`seek` cho khuông; mẫu: `piano-view.tsx`, `view-settings-panel.tsx`.
- `apps/web/src/components/courses/lesson-view.tsx` -- bật `notation` cho bài có nhạc.
- `apps/web/src/messages/{vi,en}.json` -- `Player.notation*`.
- `apps/web/package.json`, `pnpm-lock.yaml` -- `vexflow`.
- `midi-player-bundle.test.ts`, test mới cho `quantize/layout/active`, `notation-view`, `midi-player` (bố cục, bật/tắt).
- `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] `note-json.ts` -- giữ tick + header (tương thích)
- [x] `lib/midi/notation/{quantize,layout,active}.ts` + test -- lượng tử, ô nhịp, hợp âm, lặng, luyến, vắt vạch nhịp, đổi nhịp, nốt đang vang
- [x] `lib/midi/notation/render.ts` + `components/sheet/notation-view.tsx` -- VexFlow nạp động, dòng lười, tô nốt, vạch phát, cuộn, bấm ô nhịp
- [x] `midi-player.tsx`, `lesson-view.tsx`, messages -- prop `notation`, hai cột, bật/tắt
- [x] `package.json` -- `vexflow`; mở rộng `midi-player-bundle.test.ts`
- [ ] Test component (khuông hiện sau Play, lỗi dựng → ẩn, tắt/bật nhớ lựa chọn, không `notation` thì không đổi) và `README.md`, `deferred-work.md`

**Acceptance Criteria:**
- Given bài học có nhạc, when bấm Play, then khuông nhạc hiện bên trái, nốt đang vang được tô và vạch phát chạy đồng bộ với bàn tay/phím bên phải.
- Given tua hoặc đổi tốc độ, then khuông luôn khớp vị trí của player.
- Given trang sheet, then giao diện và bundle ban đầu không đổi; VexFlow chỉ nạp sau lần Play đầu tiên của bài có `notation`.
- Given lỗi dựng khuông, then player vẫn chạy bình thường.
- Test hiện có, lint, typecheck, build xanh.


## Implementation Notes

- Dùng `vexflow/core` (không nhúng font) + font Bravura copy vào `apps/web/public/fonts` (OFL) để giữ CSP `font-src 'self'`; không đổi CSP. VexFlow 5 vẽ ký hiệu bằng font nên font bắt buộc.
- `parseNoteJson` giữ thêm `ticks/durationTicks` và `header` (tuỳ chọn, tương thích).
- Vạch phát/điểm neo lấy từ x của từng sự kiện sau khi VexFlow format; hợp âm đang vang tô bằng `data-notation-active` (CSS trong `globals.css`).
- Đã kiểm tra bằng ảnh chụp Chrome headless: hai khuông, dấu ngoặc, hợp âm, dấu luyến, dấu thăng, dấu lặng, tô màu hợp âm.
- Kiểm chứng: lint, typecheck, build xanh; web 784 test xanh (có test mới: quantize/layout/active, NotationView, tích hợp MidiPlayer, bundle).

## Review Triage Log
