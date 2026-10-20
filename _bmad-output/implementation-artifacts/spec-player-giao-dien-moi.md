---
title: 'Giao diện player mới: thanh công cụ (BPM, Transpose, Loop, Mixer), chế độ khuông nhạc / phím đàn + bàn tay, toàn màn hình'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: '449e0d0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-chuyen-pdf-sang-midi.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Player hiện tại (`MidiPlayer`) là một khối trong trang: nút Chơi thử, ô chọn tốc độ (0.5×–2×), vài nút bật/tắt, thanh tua; khuông nhạc và phím đàn nằm cạnh nhau. Không có BPM, dịch giọng, lặp, chỉnh âm lượng từng tay, đổi chế độ xem, phóng to khuông nhạc hay toàn màn hình. Founder muốn trải nghiệm kiểu ứng dụng chơi nhạc (ảnh mẫu): một thanh công cụ ở trên, thanh tiến trình, rồi khu vực hiển thị là khuông nhạc đầy chiều ngang (ô nhịp đang chơi được tô) hoặc cảnh phím đàn có nốt rơi, kèm bàn tay như hiện nay.

**Approach (đã chốt với founder):** Thay giao diện của `MidiPlayer` dùng chung, nên áp dụng đồng thời cho trang Sheet, bài học và kết quả `/convert`. Hiển thị là thanh công cụ ngay trong trang kèm nút phóng to toàn màn hình (giống ảnh mẫu khi phóng to), không ép mở toàn màn hình. Thanh công cụ: về đầu, phát/tạm dừng, lặp, thời gian | Mixer, Transpose, BPM | chế độ tối, chuyển khuông nhạc / phím đàn, zoom khuông nhạc, toàn màn hình; thanh tiến trình mảnh phía dưới. Hai chế độ xem loại trừ nhau: **Khuông nhạc** (nếu bản nhạc dựng được khuông) và **Phím đàn** (cảnh 3D nốt rơi + phím + bàn tay như cũ, bàn tay vẫn bật/tắt được). Giao hai giai đoạn, mỗi giai đoạn một nhánh và PR: **P1** vỏ giao diện (thanh công cụ, BPM, chế độ, toàn màn hình, chế độ tối, zoom); **P2** lõi phát nhạc (Transpose, Loop, Mixer).

## Boundaries & Constraints

**Always:**
- Giữ nguyên hành vi hiện có: Tone.js và note-JSON chỉ tải ở lần bấm Phát đầu tiên (cử chỉ người dùng mở `AudioContext`, không tự phát); `claimAudio` (một nguồn âm thanh tại một thời điểm); thời gian chờ tải 15 giây và các trạng thái lỗi; cảnh 3D chỉ khi `canShowHands()` (WebGL, không giảm chuyển động) và rơi về phím 2D khi không dùng được; bàn tay + góc nhìn 3D (`ViewSettingsPanel`) còn dùng được ở chế độ Phím đàn; ghi nhớ lựa chọn trong `localStorage` bọc try/catch; heading "Nghe thử" (`aria-labelledby`) cho từng khối.
- Điều khiển cho bàn phím và trình đọc màn hình: mọi nút có tên truy cập, `aria-pressed` cho nút bật/tắt, BPM/Transpose là cặp nút −/+ kèm giá trị đọc được (`aria-live="polite"` nhẹ nhàng, không đọc mỗi khung hình), vùng chạm ≥ 44px, focus ring, Space bật/tắt phát khi focus nằm trong player (không bắt Space khi đang ở ô nhập/nút khác), thanh tiến trình là `input[type=range]` có `aria-valuetext`; Esc thoát toàn màn hình.
- Phản hồi: trên mobile (390px) thanh công cụ xuống nhiều hàng, nhóm phụ (Mixer, Transpose, BPM, Zoom) không làm tràn ngang; không tràn ngang ở 390/768/1280px.
- BPM lấy từ tempo ĐẦU TIÊN của note-JSON (`header.tempos[0].bpm`, mặc định 120 khi thiếu); BPM hiển thị = `round(BPM gốc × tốc độ)`; bấm −/+ đổi 1 BPM, tốc độ giới hạn 0.25×–2× (không ra ngoài khoảng này). File MIDI nhiều tempo: dùng tempo đầu làm mốc hiển thị, mọi tempo đều được nhân cùng hệ số.
- Chế độ tối chỉ áp cho riêng player (palette cục bộ qua lớp CSS có phạm vi, không đổi token có sẵn, không bật dark mode toàn site); mặc định sáng, nhớ lựa chọn.
- Tương phản AA trong cả hai chế độ sáng/tối (chữ nhỏ ≥ 4.5:1; chữ brass dùng `secondary-strong` trên nền sáng); `prefers-reduced-motion` tôn trọng (không hiệu ứng thêm, cảnh 3D theo quy tắc có sẵn).
- Mọi chuỗi mới vào `messages/{vi,en}.json`.

**Never:** Tự phát nhạc; đổi hợp đồng note-JSON hay API; thêm thư viện; đổi giá trị token có sẵn; làm lại khuông nhạc kiểu bản in (engraving) — khuông nhạc vẫn là bản hiển thị gần đúng do `lib/midi/notation` dựng; thêm các phần của ảnh mẫu ngoài phạm vi (Parts, Effects, Share, Send feedback, quảng cáo); phá vỡ bundle: Tone.js, VexFlow, Three.js vẫn nạp muộn như hiện nay (test `midi-player-bundle` phải xanh).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chưa bấm Phát | Vào trang | Thanh công cụ + vùng hiển thị trống/gợi ý; chưa tải Tone/JSON; BPM hiện 120 mặc định hoặc "—" tới khi có dữ liệu | N/A |
| Bấm Phát lần đầu | Có Web Audio | Như cũ (mở khoá, tải song song, phát); sau đó BPM gốc lấy từ note-JSON | Lỗi tải/rỗng: thông báo như cũ |
| Đổi BPM | −/+ khi đang phát | Tốc độ đổi ngay, không mất vị trí; BPM hiển thị cập nhật; chạm biên 0.25×/2× thì nút tương ứng bị vô hiệu | N/A |
| Chế độ xem | Có khuông nhạc / không | Hai nút chuyển khi cả hai khả dụng; chỉ có Phím đàn thì ẩn nút khuông nhạc; chọn được nhớ lại | Khuông nhạc lỗi dựng: thông báo cục bộ, vẫn chuyển sang Phím đàn được |
| Phím đàn + bàn tay | 3D khả dụng | Nốt rơi + phím + bàn tay như cũ; chip "Bàn tay", "Tuỳ chỉnh cảnh 3D" ở góc khu vực hiển thị | 3D không khả dụng: phím 2D, ẩn chip bàn tay |
| Toàn màn hình | Bấm nút / Esc | Vào/ra toàn màn hình (Fullscreen API; không có thì lớp phủ cố định toàn cửa sổ); khu vực hiển thị chiếm hết chiều cao còn lại; thoát trả focus về nút | Từ chối quyền → ở lại chế độ trong trang |
| Chế độ tối | Bật | Palette tối cho toàn player (thanh công cụ, khuông nhạc đảo màu, cảnh 3D giữ nền tối); nhớ lựa chọn | N/A |
| Zoom | Chế độ khuông nhạc | 70%–200%, bước 10%; nhớ lựa chọn; ở Phím đàn thì nút vô hiệu | N/A |
| Transpose (P2) | ±n nửa cung (−12..+12) | Âm thanh, khuông nhạc, phím và bàn tay đều theo nốt đã dịch; nốt vượt dải 0–127 bị kẹp/bỏ qua có kiểm soát | N/A |
| Loop (P2) | Bật lặp toàn bài / đặt A–B | Hết bài (hoặc tới B) tự quay về đầu (hoặc A) liền mạch; đánh dấu A/B trên thanh tiến trình | A ≥ B thì tự đảo/bỏ |
| Mixer (P2) | Giảm/tắt tay phải hoặc trái | Âm lượng nhân hệ số theo tay (chia tay bằng `assignHands` có sẵn); tắt tiếng một tay không làm mất nốt trên hình | N/A |
| Nghe thử trên thẻ khác phát | `claimAudio` | Player chính tạm dừng như cũ | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/sheet/midi-player.tsx` -- giữ vòng đời (tải lười, `PlayerCore`, `claimAudio`, thời gian chờ, tiến trình, tua). Tách phần trình bày ra các thành phần con; props `noteJsonUrl`, `title`, `notation`, `deps` giữ nguyên.
- `apps/web/src/components/player/` (mới): `player-toolbar.tsx` (hàng nút + nhóm responsive), `player-progress.tsx` (thanh tiến trình, đánh dấu A/B), `player-stage.tsx` (khu vực hiển thị theo chế độ), `bpm-control.tsx`, `transpose-control.tsx`, `mixer-popover.tsx`, `loop-popover.tsx`, `use-player-prefs.ts` (nhớ chế độ/tối/zoom/bàn tay), `use-fullscreen.ts`; icon bằng `lucide-react`.
- `apps/web/src/components/sheet/{notation-view,piano-view,piano-keyboard,view-settings-panel}.tsx` -- giữ; nhận thêm `zoom`, `transpose` (nốt đã dịch), `dark`.
- `apps/web/src/app/globals.css` -- palette tối cục bộ `.player-dark` (biến CSS có phạm vi, không đổi `theme.css`).
- `apps/web/src/lib/midi/player-core.ts` (P2) -- `setTranspose`, `setLoop(range|null)`, `setHandGain(hand, gain)`; `AudioPort`/lịch phát tính tên nốt và velocity tại thời điểm lên lịch; test.
- `apps/web/src/lib/midi/transpose.ts` (P2) -- hàm thuần dịch nốt (midi, tên) và kẹp dải; test.
- `apps/web/src/lib/midi/note-json.ts` -- chỉ đọc `header.tempos[0].bpm` (đã có `NoteHeader`), không đổi hợp đồng.
- `apps/web/src/messages/{vi,en}.json` -- `Player.*` mới.
- Test: cập nhật `midi-player*.test.tsx`, `sheet-detail.test.tsx`, `convert-view.test.tsx`, `courses` (nhãn/đối tượng đổi); thêm test cho BPM (toán tốc độ), prefs, fullscreen (giả lập), Space, a11y, transpose/loop/mixer của lõi.
- Không đổi: API, `apps/admin`, thanh toán, `services/musicscore`, các trang chỉ dùng nghe thử trên thẻ (`card-preview`).

## Tasks & Acceptance

**Execution (P1: vỏ giao diện):**
- [x] Tách `MidiPlayer` thành toolbar/progress/stage; chế độ Khuông nhạc / Phím đàn loại trừ nhau, nhớ lựa chọn
- [x] BPM −/+ (tốc độ 0.25×–2×), hiển thị BPM theo tempo đầu của note-JSON
- [x] Toàn màn hình (Fullscreen API + lớp phủ dự phòng), Space bật/tắt, Esc thoát
- [x] Chế độ tối cục bộ + Zoom khuông nhạc
- [x] Cập nhật test; chụp ảnh 390/768/1280px ở cả hai chế độ, sáng/tối, trong trang và toàn màn hình; so ảnh mẫu

**Execution (P2: lõi phát nhạc):**
- [ ] Transpose (lõi + hình ảnh), Loop (toàn bài + A–B), Mixer (tay trái/phải) kèm test lõi
- [ ] Chạy thật trên trang Sheet, bài học, `/convert`; ghi chú giới hạn

**Acceptance Criteria:**
- Given trang Sheet / bài học / kết quả `/convert`, when mở, then thấy cùng một thanh công cụ mới; chưa bấm Phát thì chưa tải Tone.js hay note-JSON.
- Given đang phát, when bấm − / + BPM, then tốc độ đổi ngay không mất vị trí, BPM hiển thị đúng `round(gốc × tốc độ)` và dừng ở biên.
- Given bản nhạc có khuông nhạc, when bấm biểu tượng phím đàn, then thấy cảnh nốt rơi + phím + bàn tay như cũ; bấm biểu tượng khuông nhạc thì quay lại khuông nhạc với ô nhịp/hợp âm đang chơi được tô.
- Given toàn màn hình, when vào/ra bằng nút hoặc Esc, then bố cục lấp đầy cửa sổ và trả focus; không có cuộn ngang ở 390/768/1280px.
- Given Transpose +2, Loop, Mixer (P2), then âm thanh và hình theo đúng; hết bài lặp liền mạch; tắt một tay làm im đúng tay đó.
- Given bàn phím và trình đọc màn hình, then mọi điều khiển có tên, trạng thái và thao tác bằng phím; Space chỉ bắt khi focus trong player.
- Given test/lint/typecheck/build của web (và `midi-player-bundle`), then xanh.

## Implementation Notes

**P1 đã làm** (P2: Transpose, Loop, Mixer chưa làm, giao ở nhánh riêng): `MidiPlayer` giữ nguyên vòng đời (tải lười, `claimAudio`, timeout, lỗi), phần trình bày tách thành `components/player/` (`PlayerToolbar`, `PlayerProgress`, `BpmControl`, `use-fullscreen`, `player-prefs`, `toolbar-styles`). Thanh công cụ: về đầu, phát/tạm dừng (nhãn dài mời bấm khi chưa phát), thời gian | BPM −/+ | chế độ tối, khuông nhạc / phím đàn, zoom, toàn màn hình; thanh tiến trình mảnh bên dưới. Hai chế độ loại trừ nhau, nhớ lựa chọn (`piano-daily:player-view`); trang Sheet (không bật `notation`) chỉ có phím đàn nên không có nút chuyển và zoom. BPM = `round(BPM gốc × tốc độ)`, gốc = tempo đầu của note-JSON (mặc định 120), bước 1 BPM, tốc độ 0.25×–2× (`lib/midi/bpm.ts`). Zoom khuông nhạc 70–200% bằng CSS `zoom` (xếp dòng theo bề rộng đã chia hệ số, toạ độ chuột chia lại). Chế độ tối: lớp `.player-dark` ghi đè biến màu cục bộ trong `globals.css` (khuông nhạc dùng `currentColor` nên theo màu chữ). Toàn màn hình: Fullscreen API, rơi về lớp phủ `fixed` khi không có/bị từ chối, Esc thoát, trả focus về nút. Space bật/tắt phát khi focus ngoài các điều khiển. `NotationView`/`PianoView` nhận `zoom`/`fill`. Bỏ ô chọn tốc độ cũ và nút "Hiện khuông nhạc" cũ (thay bằng hai nút chuyển chế độ); bàn tay và "Tuỳ chỉnh cảnh 3D" thành hai nút ở trên khu vực hiển thị khi ở chế độ phím đàn.
**Kiểm chứng:** web lint/typecheck/build xanh, 935 test (thêm test BPM, prefs, toàn màn hình, tối/zoom/chuyển chế độ, Space, về đầu, tương phản palette tối). Chạy thật với `services/musicscore` + `/convert` (desktop, tablet, mobile): khuông nhạc, zoom, tối, phím đàn 3D + bàn tay (WebGL phần mềm), toàn màn hình; không tràn ngang, không lỗi trang. **Chưa kiểm chứng:** Safari/iOS thật (toàn màn hình bằng lớp phủ), trải nghiệm nghe thật, trang Sheet và bài học bằng mắt (dùng cùng component, chưa chụp riêng).

## Spec Change Log

## Review Triage Log

## Design Notes

Hai chế độ loại trừ nhau (thay vì đặt cạnh nhau như hiện tại) để khu vực hiển thị đủ rộng như ảnh mẫu, nhất là trên mobile. BPM là tốc độ nhân hệ số chứ không sửa tempo trong file, nên mọi bản nhạc (kể cả nhiều tempo) đều chạy được và không cần đổi dữ liệu. Transpose/Loop/Mixer nằm ở `PlayerCore` (lõi đã tách khỏi giao diện và có test) để cả hình lẫn tiếng cùng dùng một nguồn nốt đã dịch. Chia P1/P2 vì P1 chỉ đổi giao diện (ít rủi ro, thấy ngay), còn P2 đổi lõi phát nhạc và cần test kỹ hơn.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` (không nạp `.env` vào shell) -- expected: thành công; `midi-player-bundle` vẫn xanh
- `pnpm --filter @piano-daily/web shots -- --label player-after` -- expected: ảnh, không cảnh báo tràn ngang hay lớp phủ lỗi Next (cần chụp thêm kịch bản phát nhạc bằng script riêng)

**Manual checks (if no CLI):**
- Nghe thử và xem trên trình duyệt thật (Chrome, Safari, iOS): Transpose, Loop A–B, Mixer, toàn màn hình, tốc độ BPM; đối chiếu với ảnh mẫu.
