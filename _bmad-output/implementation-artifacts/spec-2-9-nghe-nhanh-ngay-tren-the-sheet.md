---
title: 'Story 2.9 — Nghe nhanh ngay trên thẻ Sheet'
type: 'feature'
created: '2026-10-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '0f783e40640494d5f003b708475c32fc9b422272'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-2-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người dùng đang duyệt lưới phải mở từng trang chi tiết mới nghe được bài; thẻ Sheet chưa có cách nghe thử nhanh, và dữ liệu thẻ cũng chưa có URL note-JSON để phát.

**Approach:** Thêm `noteJsonUrl` (URL public của note-JSON hiện hành, hoặc `null`) vào thẻ Sheet của API công khai, và một nút play mini trên thumbnail của `SheetCard` (khi có note-JSON) phát khoảng 12 giây đầu của bản nhạc rồi tự dừng, dùng lại lõi phát và bộ tổng hợp của Story 2.8. Một bộ điều phối dùng chung đảm bảo tại mỗi thời điểm chỉ một preview phát; click nút không điều hướng sang trang chi tiết.

## Boundaries & Constraints

**Always:**
- **API/hợp đồng:** `publicSheetItemSchema` (packages/shared) thêm `noteJsonUrl: string | null`. `PUBLIC_SELECT` (module `catalog`) lấy thêm file `MIDI_JSON` hiện hành (`supersededAt = null`) cùng `THUMBNAIL`; `toItem` suy ra `thumbnailUrl` và `noteJsonUrl` từ đúng loại file, chỉ dùng `storage.publicUrl` (key public). Áp cho mọi nơi dùng `toItem` (`GET /sheets`, tìm kiếm, `seriesSheets`, `related`). Không trả `storageKey`, không lộ file private/`.mid` gốc. Sheet không có MIDI hoặc chưa có note-JSON thì `noteJsonUrl = null`.
- **Nút play trên thẻ:** chỉ hiện khi `sheet.noteJsonUrl` khác `null`; nằm trên thumbnail (góc dưới), là `<button>` anh em của link thẻ (không lồng trong `<a>`), có `z-10` để bấm không kích hoạt link phủ; `aria-label` ghi rõ bài ("Nghe thử {tên bài}" / "Dừng nghe thử {tên bài}"), `aria-busy` khi đang tải; vùng bấm tối thiểu 44×44 px; focus ring brass 2px. **Thiết bị có hover:** nút ẩn mờ và hiện khi hover thẻ hoặc khi nút có focus bàn phím; **thiết bị cảm ứng (không hover):** luôn hiện; trong lúc tải hoặc phát thì luôn hiện ở mọi thiết bị. Bấm nút **không** điều hướng.
- **Phát:** bấm nút → tải lazy lõi preview và Tone.js, tải note-JSON, phát khoảng 12 giây (hằng `PREVIEW_SECONDS = 12`, trong khoảng 10–15) tính từ nốt đầu tiên (bỏ khoảng lặng đầu bài), rồi tự dừng; bài ngắn hơn thì phát hết. Bấm lại đúng nút đó khi đang tải hoặc đang phát thì dừng. Không bao giờ tự phát khi tải lưới; không tải Tone.js hay note-JSON trước lần bấm đầu tiên (mã tải sẵn của thẻ không chứa `zod`, `tone` hay `note-json`; có test duyệt đồ thị import như Story 2.8).
- **Một preview tại một thời điểm:** bộ điều phối dùng chung (module cấp trang, `useSyncExternalStore`): bắt đầu preview mới thì dừng và giải phóng preview đang phát/đang tải trước (kể cả khi phiên cũ đang tải dở: kết quả đến muộn bị huỷ và giải phóng, không phát). Trạng thái từng nút (`idle` | `loading` | `playing` | `error`) lấy từ bộ điều phối.
- **Âm thanh:** mỗi preview mở khoá AudioContext **đồng bộ trong cú bấm** (như 2.8), dùng `PlayerCore` + adapter Tone (`createToneAudio`) và **giải phóng khi dừng** (`dispose` cũng `close()` AudioContext do ta tạo, để không rò rỉ context khi duyệt nhiều thẻ; áp dụng luôn cho `MidiPlayer`). Ghi chú "bản mô phỏng" không cần hiện trên thẻ (đã có ở player trang chi tiết).
- **Lỗi và dọn dẹp:** lỗi tải/không hỗ trợ Web Audio/timeout (15 giây) đưa nút về trạng thái `error` (nhãn "Không phát được bản nghe thử", bấm lại để thử), không ném lỗi ra ngoài; thiếu Web Audio thì ẩn nút. Gỡ thẻ khỏi trang (đổi trang, điều hướng) khi preview của nó đang phát thì dừng. Nút không đổi `view_count`, không gửi beacon.
- **i18n/UX:** chuỗi mới trong `messages/{vi,en}.json` (namespace `Card`), giọng trang trọng, không emoji; icon lucide import theo tên (`Play`, `Square`, `LoaderCircle`); không animation bounce hay màu neon; skeleton thẻ giữ nguyên kích thước.
- **Test:** unit (bộ điều phối: một phiên tại một thời điểm, huỷ phiên đến muộn, toggle, lỗi; điểm bắt đầu và độ dài preview), integration API (`noteJsonUrl` có/null, bỏ file superseded, không lộ key private), component `SheetCard`/nút (hiện/ẩn, không điều hướng, nhãn, trạng thái), test duyệt đồ thị import của nút, CSP/CORS dùng lại từ 2.8, cập nhật mọi fixture thẻ.

**Never:**
- Không tải file `.mid` gốc hay URL private; không tự phát; không preview cho thẻ không có note-JSON.
- Không làm hiển thị phím đàn/thanh tua trên thẻ, không phát MP3, không đếm lượt xem từ preview, không nút Download.
- Không đổi hành vi `/admin/*`; không thêm dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Thẻ có note-JSON | `noteJsonUrl` khác null | Có nút play trên thumbnail | N/A |
| Thẻ không MIDI/không note-JSON | `noteJsonUrl = null` | Không có nút | N/A |
| Tải lưới | Không bấm gì | Không request note-JSON/Tone, không âm thanh | N/A |
| Bấm play | click nút | Tải lazy rồi phát ~12 giây từ nốt đầu, tự dừng; **không** điều hướng | Lỗi → `error`, bấm lại thử |
| Bấm khi đang phát/tải | cùng nút | Dừng ngay, về `idle` | N/A |
| Bấm thẻ khác | preview A đang phát, bấm B | A dừng và giải phóng; chỉ B phát | N/A |
| Phiên cũ đang tải | bấm A rồi bấm B ngay | Kết quả của A đến muộn bị huỷ, không phát | N/A |
| Bài ngắn hơn 12 giây | thời lượng < 12 | Phát hết rồi dừng | N/A |
| Mở đầu có khoảng lặng | nốt đầu ở giây 5 | Preview bắt đầu từ nốt đầu, đủ ~12 giây nhạc | N/A |
| Hover/cảm ứng | thiết bị có hover vs không | Có hover: hiện khi hover/focus; cảm ứng: luôn hiện; đang tải/phát: luôn hiện | N/A |
| Bàn phím | Tab tới nút | Nút nhận focus (ring brass), hiện rõ, Enter/Space kích hoạt | N/A |
| Thiếu Web Audio | không `AudioContext` | Ẩn nút | N/A |
| Lỗi mạng / note-JSON sai / treo | tải thất bại hoặc quá 15 giây | Nút `error` với nhãn rõ, thử lại được | Nuốt lỗi, không ném |
| Gỡ thẻ khi đang phát | đổi trang/điều hướng | Preview của thẻ đó dừng, context đóng | N/A |
| Rò rỉ context | mở nhiều preview liên tiếp | Mỗi preview dừng đều `close()` AudioContext của nó | N/A |
| API | `GET /sheets` | Mỗi item có `noteJsonUrl` (URL public hoặc null), `thumbnailUrl` vẫn đúng | N/A |
| File superseded | note-JSON/thumbnail cũ | Không xuất hiện | N/A |
| Riêng tư | mọi response | Không `storageKey`, không `private/`, không `.mid` | N/A |
| Related/Series | `GET /sheets/:slug` | `seriesSheets`/`related` cũng có `noteJsonUrl` | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/sheet.ts` (+ spec) -- `publicSheetItemSchema` thêm `noteJsonUrl`; mọi fixture thẻ (`sheet.spec.ts`, test web) phải thêm trường.
- `apps/api/src/modules/catalog/public-sheets.service.ts` -- `PUBLIC_SELECT`/`toItem`: hiện chỉ lấy THUMBNAIL (`take: 1`); đổi sang `type in [THUMBNAIL, MIDI_JSON]` rồi `find` theo loại; mẫu dựng URL ở `detailBySlug` (`MIDI_JSON` → `publicUrl`).
- `apps/api/test/integration/public-sheets.spec.ts` -- mẫu `addFile`/`addSheet`; thêm ca `noteJsonUrl`.
- `apps/web/src/components/catalog/sheet-card.tsx` (+ `catalog.test.tsx`) -- thẻ hiện là server component với stretched link, `group`, thumbnail `relative`; thêm nút play (client) ở góc dưới thumbnail.
- `apps/web/src/components/catalog/card-preview-button.tsx` (mới, client) -- nút, dùng bộ điều phối qua `useSyncExternalStore`, `import()` động lõi preview khi bấm.
- `apps/web/src/lib/midi/preview-controller.ts` (mới) -- bộ điều phối một-phiên-một-lúc (thuần, test được); `apps/web/src/lib/midi/card-preview.ts` (mới) -- lõi preview production: `unlockAudioContext` đồng bộ, tải Tone + note-JSON song song có timeout, `PlayerCore` từ nốt đầu trong `PREVIEW_SECONDS`.
- `apps/web/src/lib/midi/{player-core,tone-audio,fetch-note-json,note-json}.ts` -- tái dùng từ Story 2.8; `createToneAudio` cần `dispose` đóng AudioContext đã tạo; `components/sheet/midi-player-bundle.test.ts` -- mẫu test đồ thị import.
- `apps/web/src/components/sheet/sheet-detail.tsx` (`SheetLinks`) -- hiển thị liên quan không dùng thẻ; không đổi.
- `apps/web/src/messages/{vi,en}.json` -- namespace `Card`; `README.md` -- ghi `noteJsonUrl` và preview.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/sheet.ts` (+spec) và `apps/api/src/modules/catalog/public-sheets.service.ts` -- `noteJsonUrl` trên thẻ -- hợp đồng
- [x] `apps/api/test/integration/public-sheets.spec.ts` -- phủ `noteJsonUrl`, superseded, riêng tư, series/related -- AC
- [x] `apps/web/src/lib/midi/{preview-controller,card-preview}.ts` (+test) và `tone-audio.ts` (`dispose` đóng context) -- điều phối và lõi preview -- FR5, UX-DR6
- [x] `apps/web/src/components/catalog/{card-preview-button,sheet-card}.tsx` (+test) + `messages/{vi,en}.json` -- nút trên thẻ, hiện/ẩn theo thiết bị -- UX-DR6, UX-DR16
- [x] `apps/web/src/components/sheet/midi-player-bundle.test.ts` (hoặc test mới) -- nút không kéo `zod`/`tone`/`note-json` vào bundle ban đầu -- NFR6
- [ ] mọi fixture thẻ (`apps/web/src/**/*.test.*`) -- thêm `noteJsonUrl` -- hợp đồng
- [x] `README.md` -- ghi trường mới và hành vi preview -- tài liệu

**Acceptance Criteria:**
- Given lưới có thẻ có MIDI, when bấm icon play trên thumbnail, then nghe khoảng 12 giây đầu rồi tự dừng và trang không chuyển sang chi tiết; bấm lại khi đang phát thì dừng.
- Given một preview đang phát, when bấm play ở thẻ khác, then preview cũ dừng và chỉ preview mới phát, kể cả khi bấm liên tiếp nhanh.
- Given thiết bị cảm ứng, when xem lưới, then icon play luôn hiển thị; thiết bị có hover thì hiện khi hover hoặc focus bàn phím.
- Given vào trang lưới, when chưa bấm gì, then không có request note-JSON hay Tone.js và không có âm thanh.
- Given `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test`, then tất cả xanh (build không đặt `NODE_ENV=development`).

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Evidence |
|---|---|---|---|
| Rò rỉ AudioContext khi Tone lỗi/timeout (context mở khoá ở cú bấm không được đóng); cả `MidiPlayer` lẫn preview | high | patch | Cả 3 reviewer cùng thấy. Catch giờ đóng `unlocked` khi chưa có audio (`closeAudioContext`); test cho preview và player |
| Audio đến muộn sau timeout không bao giờ được dispose | medium | patch | `withTimeoutDispose` dispose tài nguyên đến muộn; dùng ở preview và player; test đồng hồ giả |
| `Tone.setContext` toàn cục: preview trên thẻ liên quan làm đổi đồng hồ `Tone.now()` của player chính cùng trang | high | patch | Adapter giữ `context` riêng (`context.now()`); test chứng minh `now()` không đổi khi context toàn cục bị thay |
| Context toàn cục của Tone đã bị lần nghe thử trước đóng nhưng lần sau không có `unlocked` | medium | patch | Dựng `Tone.Context` mới khi trạng thái `closed`; test |
| Preview và player chính phát chồng lên nhau (trang chi tiết có cả hai) | medium | patch | `audio-exclusive`: bên nhận quyền sau thì dừng bên trước, ở cả hai chiều và ngay từ lúc bấm; test bộ điều phối và player |
| `noteJsonUrl` bắt buộc làm hỏng parse với phản hồi cache/cũ khi triển khai cuốn chiếu | medium | patch | Schema `nullable().default(null)`; test phản hồi thiếu trường |
| Chọn file khi có nhiều bản hiện hành không xác định (bỏ `take: 1`) | low | patch | `orderBy: { createdAt: 'desc' }` |
| Test `related` có `noteJsonUrl` rỗng tuếch (vacuous) | medium | patch | Thêm Sheet cùng Composer khác Series có note-JSON và khẳng định URL thật |
| `end <= start` khi `duration` mâu thuẫn với nốt | false | - | `duration = max(time + duration)` của chính các nốt nên luôn lớn hơn `start` |
| `PlayerCore` ném sau khi tạo audio để lại lịch chạy | false | - | `startFrom` gọi `tick()` trước `setInterval`; lỗi ném ra trước khi có bộ hẹn giờ; catch đã `audio.dispose()` |
| `unlockAudioContext` trả `undefined` thì chạy trên context chưa mở khoá | low | - | `createToneAudio` kiểm `state === 'running'` và ném, nên hiện thành lỗi chứ không im lặng |
| Lỗi không tự xoá; nút hiện thoáng qua rồi biến mất ở trình duyệt thiếu Web Audio; thiếu `aria-live`/phím Escape | low | - | Lỗi cố ý ở lại tới khi bấm thử lại; trình duyệt thiếu Web Audio hiếm; nhãn nút đã nêu rõ trạng thái bằng chữ; ngoài phạm vi spec |
| Cắt đột ngột cuối preview (không fade) | low | - | Đoạn nghe thử 12 giây chỉ để tham khảo; thêm fade là tính năng riêng |
| Test gắn với chuỗi class Tailwind; không có test hành vi hover/cảm ứng | low | - | jsdom không dựng layout/media query; spec đã ghi bước kiểm tra tay (hover/cảm ứng) |

## Design Notes

- **`noteJsonUrl` trên mọi thẻ thay vì gọi chi tiết khi bấm:** một truy vấn file thêm (cùng bảng, đã join cho thumbnail) rẻ hơn nhiều so với một request `GET /sheets/:slug` mỗi lần bấm, và cho phép bấm phát ngay.
- **Bộ điều phối module cấp trang:** các thẻ là nhiều thể hiện React độc lập nên "một lúc một preview" cần một nơi chung; `useSyncExternalStore` để mọi nút phản ánh trạng thái mà không cần Provider bọc từng trang (lưới dùng ở Level, Search, Composer, Genre, sidebar).
- **Mỗi preview một AudioContext rồi đóng:** tránh dùng chung Tone/context với `MidiPlayer` ở trang chi tiết (`Tone.setContext` là toàn cục), và tránh rò rỉ vì trình duyệt giới hạn số context.
- **Bắt đầu từ nốt đầu:** nhiều bản MIDI mở đầu bằng khoảng lặng; 12 giây phải là 12 giây nhạc.
- **Hiện/ẩn bằng `@media (hover: hover)`:** mặc định nút luôn hiện, chỉ khi thiết bị thực sự có hover mới ẩn mờ, nên cảm ứng không cần phát hiện riêng.

## Verification

**Commands:**
- `docker compose up -d --wait postgres seaweedfs && POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test && pnpm build && pnpm typecheck && pnpm lint && pnpm test` -- expected: exit 0

**Manual checks:**
- Trình duyệt (Sheet có MIDI): lưới Level — nút play hiện khi hover/focus (desktop) và luôn hiện (giả lập cảm ứng); bấm nghe ~12 giây rồi tự dừng, không chuyển trang; bấm thẻ khác thì thẻ trước dừng; xem Network không có request note-JSON/Tone khi chỉ tải trang; kiểm tra trên iPhone/Safari.
