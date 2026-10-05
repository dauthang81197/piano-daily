---
title: 'Story 2.8 — MIDI player với phím đàn ảo'
type: 'feature'
created: '2026-10-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '28d2f37b96df253dde1e613583b45820228924c2'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trang chi tiết Sheet chưa cho nghe thử: `PlayerSlot` đang trống, nên người học không biết bài có vừa tay không và không luyện được đúng nốt.

**Approach:** Thay `PlayerSlot` bằng một client component `MidiPlayer`: chỉ khi người dùng bấm "Play & Practice this piece" mới tải lazy Tone.js và note-JSON công khai (`midi.noteJsonUrl`, không bao giờ file `.mid` gốc), rồi phát bằng bộ tổng hợp trình duyệt với Play/Pause, thanh tua, tốc độ 0.5x–2x và phím đàn ảo hiện nốt rơi cùng nốt đang phát kèm tên nốt dạng chữ.

## Boundaries & Constraints

**Always:**
- **Không tự phát, không tải sớm:** vào trang chỉ hiện khối player tĩnh (nút, ghi chú, phím đàn ở trạng thái nghỉ). Tone.js (`import('tone')`) và note-JSON chỉ được tải trong handler của lần bấm đầu tiên; không `AudioContext` nào được tạo trước đó. Mã player không chặn SSR của trang (component client, phần nặng tải lazy). Bấm lần đầu cũng là cử chỉ người dùng mở `AudioContext` (`Tone.start()`).
- **Nguồn dữ liệu duy nhất:** `PlayerSlot` (server) nhận `midi` của `PublicSheetDetail` và render `MidiPlayer` khi `midi` khác `null`, ngược lại trả `null` (không hiện khối). Player chỉ `fetch(midi.noteJsonUrl)`; không có đường nào tới file `.mid` hay file private. Thêm origin media vào CSP `connect-src` trong `next.config.ts` (bucket public phải cho CORS GET từ origin web; SeaweedFS local đã cho, production R2 cần cấu hình tương ứng, ghi vào README).
- **Phân tích note-JSON** là hàm thuần có test, kiểm tra bằng zod trên dạng `midi.toJSON()` của `@tonejs/midi` (`tracks[].notes[]` có `midi` 0–127, `name`, `time` giây ≥ 0, `duration` > 0, `velocity` 0–1; `tracks[].instrument.percussion`): gộp mọi track, **bỏ track trống nhạc cụ gõ**, bỏ nốt không hợp lệ, sắp theo `time`; trần 20.000 nốt và 3.600 giây (vượt thì cắt); không còn nốt nào → lỗi "không có nốt để phát". Dữ liệu sai dạng → trạng thái lỗi, không ném ra ngoài component.
- **Lõi phát (`PlayerCore`)** tách khỏi UI và khỏi Tone.js, nhận giao diện âm thanh tiêm vào (`now()`, `triggerAttackRelease(name, duration, time, velocity)`, `releaseAll()`, `dispose()`) và bộ lập lịch tiêm vào để test bằng đồng hồ giả: `play`, `pause`, `seek(t)`, `setRate(r)` (0.5, 0.75, 1, 1.25, 1.5, 2), `position()`, `onEnd`. Lên lịch cuốn chiếu theo cửa sổ ngắn (không đẩy cả bài một lần); đổi tốc độ hoặc tua khi đang phát thì dừng âm, tính lại vị trí và lập lịch tiếp từ vị trí đó; hết bài thì tự dừng và về 0; `pause` giữ nguyên vị trí và tắt mọi nốt đang ngân. Thời lượng nốt khi phát chia cho tốc độ.
- **Adapter Tone:** `PolySynth` (bộ tổng hợp, không tải mẫu âm thanh) nối `toDestination`, tạo lúc bấm lần đầu; `dispose` khi gỡ component. Không dùng `Tone.Transport`.
- **Phím đàn ảo** là SVG: dải phím suy ra từ nốt trong khoảng 21–108, mở rộng ra trọn quãng tám và tối thiểu 3 quãng tám; phím trắng `surface-bright`, phím đen `on-surface`; nốt đang phát tô brass (`secondary`) trên phím kèm **tên nốt bằng chữ** (ví dụ `C4`) vẽ ngay trên phím và liệt kê ở dòng "Đang phát: …"; các nốt sắp tới rơi xuống phím trong cửa sổ nhìn trước 2 giây (tối đa 64 hình chữ nhật mỗi khung hình, nhãn tên nốt trên mỗi nốt đủ rộng). Không có animation bounce hay màu neon; không dựa riêng vào màu để truyền thông tin. Cập nhật hình bằng `requestAnimationFrame` chỉ khi đang phát (giới hạn ~30 khung/giây), dừng hẳn khi pause/kết thúc.
- **Điều khiển:** nút Play/Pause (đổi nhãn và `aria-pressed`), thanh tua `input[type=range]` kéo được (có `aria-label`, hiện thời gian `mm:ss / mm:ss`), dropdown tốc độ có nhãn gắn với input; mọi phần tử bấm được có viền focus brass 2px. Nút đầu tiên ghi đúng "Play & Practice this piece" (en) / bản dịch trang trọng (vi); trong khi tải hiện trạng thái "Đang tải" và vô hiệu nút.
- **Ghi chú bắt buộc** trong khu vực player: "bản mô phỏng, chỉ để tham khảo" (vi) / "simulated playback, for reference only" (en).
- **Không hỗ trợ Web Audio:** nếu thiếu `AudioContext`/`webkitAudioContext` thì thay cả player bằng thông báo (không có nút phát). Lỗi tải note-JSON hoặc Tone.js hiện thông báo lỗi có thể thử lại bằng cách bấm nút lần nữa; không ném lỗi ra ngoài.
- **i18n:** chuỗi mới nằm trong `messages/{vi,en}.json` (namespace `Player`), giọng trang trọng, không emoji; thêm dependency `tone` đúng phiên bản `15.1.22` (khớp bảng Stack), import động.
- **Test:** unit (phân tích note-JSON, bố cục phím, nốt đang phát/đang rơi, `PlayerCore` với đồng hồ và âm thanh giả), component `MidiPlayer` với engine và `fetch` giả (không tự phát/tải khi mount, bấm thì tải một lần, Play/Pause/tua/tốc độ, tên nốt dạng chữ, ghi chú mô phỏng, không có Web Audio, lỗi tải), `PlayerSlot` (có/không MIDI), CSP.

**Never:**
- Không tải hay lộ file `.mid` gốc, không dùng URL private; không tự phát; không `AudioContext` trước cử chỉ người dùng; không mẫu âm thanh piano lớn.
- Không làm mini-preview trên thẻ Sheet (2.9), MP3 player, nút Download, thu âm hay chấm điểm luyện tập, đổi hợp đồng API (`midi` đã đủ).
- Không đổi hành vi `/admin/*`; không thêm dependency nào ngoài `tone`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vào trang | Sheet có MIDI | Khối player tĩnh; **không** fetch note-JSON, **không** tải Tone, **không** phát | N/A |
| Bấm lần đầu | Click "Play & Practice this piece" | Tải lazy Tone + note-JSON (một lần), bắt đầu phát, nút thành Pause | Lỗi → thông báo, bấm lại để thử |
| Pause/Play | đang phát → Pause → Play | Dừng tại vị trí, tắt nốt ngân; Play tiếp từ đúng vị trí | N/A |
| Tua | kéo thanh tua | Vị trí đổi; đang phát thì phát tiếp từ đó, đang dừng thì giữ dừng | Vị trí kẹp trong 0–thời lượng |
| Tốc độ | chọn 0.5x…2x | Thời gian nốt và vị trí theo tốc độ mới, liền mạch | N/A |
| Hết bài | tới cuối | Tự dừng, về 0, nút về Play | N/A |
| Phím và tên nốt | nốt C4 đang phát | Phím C4 tô brass, nhãn `C4` trên phím và trong "Đang phát: …" | N/A |
| Nốt rơi | nốt trong 2 giây tới | Hiện nốt rơi tới phím, tối đa 64 hình mỗi khung | N/A |
| Track gõ | `instrument.percussion` | Bị bỏ, không phát/không hiện | N/A |
| JSON sai dạng/rỗng | note-JSON hỏng hoặc không có nốt | Thông báo lỗi, không ném | Component bắt lỗi |
| Quá lớn | > 20.000 nốt hoặc > 3.600 giây | Cắt tại trần, vẫn phát | N/A |
| Không Web Audio | thiếu `AudioContext` | Thay player bằng thông báo, không có nút | N/A |
| Sheet không MIDI | `midi: null` | Không có khối player | N/A |
| Gỡ trang | unmount khi đang phát | Dừng âm, huỷ lịch/rAF, `dispose` | N/A |
| Ghi chú | luôn | Có "bản mô phỏng, chỉ để tham khảo" | N/A |
| Riêng tư | mọi trường hợp | Chỉ `fetch` tới `midi.noteJsonUrl`; không URL `.mid`/private | N/A |
| CSP | production | `connect-src` có origin media | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/sheet/player-slot.tsx` (+ test trong `sheet-detail.test.tsx`) -- hiện trả `null`; đổi thành render `MidiPlayer` khi có `midi`. `sheet-detail.tsx` đã đặt `<PlayerSlot midi=…/>` đúng vị trí (giữa meta và ảnh trang); không đổi thứ tự.
- `apps/web/src/components/sheet/` (mới) -- `midi-player.tsx` (client), `piano-keyboard.tsx` (SVG), `player-controls.tsx` nếu cần tách; `apps/web/src/lib/midi/` (mới) -- `note-json.ts` (zod + gộp/lọc), `keyboard-layout.ts`, `player-core.ts`, `tone-audio.ts` (adapter, import động).
- `apps/web/src/lib/public-env.ts` / `components/sheet/view-beacon.tsx` -- mẫu client component và đọc env; `packages/shared/src/sheet.ts` (`publicSheetDetailSchema.midi`) -- hợp đồng đã đủ, không đổi.
- `apps/api/src/modules/media/sheet-media.service.ts` -- nơi sinh note-JSON bằng `midi.toJSON()` (dạng dữ liệu player đọc); chỉ tham chiếu.
- `apps/web/next.config.ts` -- thêm `media` vào `connect-src` (đã có biến `media`); `apps/web/package.json` -- thêm `tone`.
- `packages/tokens/theme.css` -- token `surface-bright`, `on-surface`, `secondary` (brass) cho phím và nốt.
- `apps/web/src/messages/{vi,en}.json` -- namespace `Player`; `README.md` -- ghi CORS bucket public và player.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/package.json` + `src/lib/midi/{note-json,keyboard-layout}.ts` (+test) -- phân tích note-JSON, bố cục phím, nốt đang phát/đang rơi -- logic
- [x] `src/lib/midi/{player-core,tone-audio}.ts` (+test lõi với đồng hồ/âm thanh giả) -- lõi phát và adapter Tone lazy -- FR5
- [x] `src/components/sheet/{midi-player,piano-keyboard,player-slot}.tsx` (+test) + `messages/{vi,en}.json` -- UI player, thay `PlayerSlot` -- FR5, UX-DR13, UX-DR16
- [x] `apps/web/next.config.ts` (+test CSP nếu có) -- thêm origin media vào `connect-src` -- AD-18
- [x] `README.md` -- ghi player, nguồn note-JSON, yêu cầu CORS của bucket public -- tài liệu

**Acceptance Criteria:**
- Given Sheet có MIDI, when mở `/en/sheet/<slug>`, then thấy khối player với ghi chú mô phỏng và **không** có request tới note-JSON hay Tone.js, không có âm thanh; bấm "Play & Practice this piece" thì mới tải rồi phát.
- Given player đang phát, when Play/Pause, kéo thanh tua, đổi tốc độ 0.5x–2x, then âm thanh và phím đàn phản hồi đúng; nốt đang phát tô brass kèm tên nốt dạng chữ; không có animation bounce hay màu neon.
- Given trình duyệt không có Web Audio hoặc Sheet không có MIDI, when trang render, then hiện thông báo thay player hoặc không có khối player tương ứng.
- Given `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (build không đặt `NODE_ENV=development`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Nốt đã lập lịch ở tương lai không bị huỷ khi Pause/tua/đổi tốc độ | high | patch | Đã đọc mã Tone: `PolySynth.releaseAll` chỉ nhả giọng đang ngân. Adapter nay dựng lại synth ở `releaseAll`; thêm `tone-audio.test.ts` (mock `tone`) |
| Adapter `createToneAudio` không có test nào chạy | medium | patch | Thêm test: `Tone.start` được chờ, thứ tự tham số, `now()`, `releaseAll`, `dispose`, context không chạy thì ném |
| Nốt đang ngân bị mất sau tua/đổi tốc độ/tiếp tục (phím sáng nhưng im lặng) | medium | patch | `startFrom` phát lại phần còn lại của nốt đang ngân (`NoteIndex.sustaining`); 2 test lõi |
| Kéo thanh tua khởi động lại phát ở mỗi bước | medium | patch | Debounce 150 ms, vòng cập nhật không ghi đè khi đang kéo; test xác nhận chỉ áp một lần |
| Tua tới cuối khi đang phát: UI ghi đè vị trí 0 của lõi bằng giá trị tua | medium | patch | Sau khi áp, lấy lại vị trí và trạng thái từ lõi; test UI và test lõi (`seek` tới thời lượng) |
| `Tone.start()` chạy sau `await import('tone')`, Safari/iOS có thể không mở khoá | medium | patch | `unlockAudioContext()` tạo và `resume()` AudioContext đồng bộ trong cú bấm, truyền cho adapter (`Tone.setContext`); kiểm tra `state === 'running'`; test thứ tự đồng bộ |
| Treo mạng/Tone làm nút kẹt ở "Đang tải" mãi | medium | patch | Timeout 15 s cho cả tải Tone và note-JSON (`fetchNoteJson` thêm `AbortSignal.timeout`); test dùng đồng hồ giả |
| Tab nền làm bộ hẹn giờ bị giãn, nốt trễ phát dồn | medium | patch | Cửa sổ lập lịch tăng lên 2 s; nốt trễ quá 0,25 s bị bỏ; test mô phỏng bằng cách nhảy đồng hồ |
| Player không dựng lại khi chuyển sang Sheet khác (cùng vị trí cây) | medium | patch | `key={noteJsonUrl}` trong `PlayerSlot` |
| Nốt ngoài dải phím vẫn xuất hiện ở "Now playing"; dải phím dùng 12–119 trong khi spec nêu 21–108 | low | patch | Chỉ liệt kê nốt có phím; phạm vi suy ra từ nốt 21–108 đúng spec (phím vẫn mở trọn quãng tám); test |
| Thiếu `worker-src` blob: cho Tone (Ticker lùi về `setTimeout`, nhiễu CSP) | low | patch | Đã đọc `Ticker.js`: có lùi về timeout nên không hỏng, nhưng thêm `worker-src 'self' blob:` cho ổn định; test CSP |
| `PlayerSlot` truyền đúng `noteJsonUrl`/`title` chưa được kiểm | medium | patch | Test `SheetDetail`: nhãn phím chứa tên bài, bấm Play thì `fetch` đúng `midi.noteJsonUrl` (không phải `.mid`) |
| `defaultDeps.fetchJson` không được test | low | patch | Tách `fetchNoteJson` ra module riêng (không zod) và test `res.ok`, `credentials: 'omit'`, timeout |
| Test bảo vệ bundle chỉ quét danh sách file viết tay | medium | patch | Viết lại thành duyệt đồ thị import bắc cầu (gồm `export … from`) từ `midi-player.tsx`; kiểm chứng bộ dò bằng `note-json.ts` |
| Test `sheet-detail` nới lỏng kiểm tra nút | low | patch | Siết lại: mọi nút phải là nút của player |
| Thông báo lỗi nằm xa nút bấm | low | patch | Chuyển lên ngay dưới hàng điều khiển; test thứ tự DOM |
| `NoteIndex.window` quét lâu khi có một nốt rất dài | low | - | Tối đa 20.000 so sánh mỗi khung (~0,1 ms); không có tác hại đo được |
| Bỏ qua `prefers-reduced-motion`; "Now playing" `aria-live="off"` | low | - | Spec yêu cầu không bounce/neon và tên nốt dạng chữ (đã có); hoạt hình do vị trí phát chứ không phải hiệu ứng trang trí |
| `supported` khởi đầu `true` nên trình duyệt không hỗ trợ thấy player thoáng qua | low | - | Chỉ biết được ở trình duyệt; trình duyệt không có Web Audio hiếm |
| "0,5x" ở tiếng Việt | false | - | Dấu thập phân theo locale là đúng; test kiểm tiếng Anh |
| CORS/CSP chỉ ghi trong README, `noteJsonUrl` ở host khác | low | - | URL luôn sinh từ `S3_PUBLIC_BASE_URL` cùng origin với `NEXT_PUBLIC_MEDIA_BASE_URL`; CORS là cấu hình hạ tầng, đã ghi README |

## Design Notes

- **Bộ tổng hợp thay vì mẫu piano:** player chỉ để tham khảo, nên `PolySynth` đủ nghe nốt; mẫu piano thật nặng hàng MB, trái NFR6 (di động) và cần lưu trữ thêm.
- **Lập lịch cuốn chiếu, không `Tone.Transport`:** tua và đổi tốc độ chỉ là "dừng, tính vị trí, lập lịch tiếp từ vị trí đó"; không phải dịch chuyển cả chuỗi sự kiện đã đăng ký. Lõi nhận đồng hồ tiêm vào nên test được mà không cần âm thanh.
- **Tải trong handler bấm:** vừa đáp ứng "lazy, không chặn SSR" vừa là cử chỉ người dùng bắt buộc để mở `AudioContext`, nên không bao giờ có tự phát.
- **Đọc note-JSON thẳng từ bucket public:** đúng AD-7 (player chỉ đọc JSON public), không thêm đường proxy; đổi lại cần CORS GET trên bucket public (SeaweedFS local đã bật) và `connect-src` của CSP.
- **Bỏ track gõ:** `@tonejs/midi` đánh dấu `instrument.percussion` cho kênh 10; phát nhịp trống bằng bộ tổng hợp nốt sẽ ra tiếng sai và làm phím đàn nhiễu.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0

**Manual checks:**
- Trình duyệt (stack compose, Sheet đã upload MIDI): `/vi/sheet/<slug>` — không có request note-JSON/Tone khi vào trang; bấm Play nghe được, Pause/tua/tốc độ đúng; phím tô brass có tên nốt; nốt rơi mượt trên di động; Tab thấy viền brass; tắt Web Audio (hoặc trình duyệt cũ) thấy thông báo; xem Network chỉ có request tới `noteJsonUrl`, không `.mid`.
