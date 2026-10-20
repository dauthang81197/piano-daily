---
title: 'UI/UX U3: trang chi tiết Sheet + player'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: 'ce1c262beac3fff85d64d168964968df52c779b0'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ảnh `u3-before` của `/sheet/<slug>` cho thấy: phần đầu là danh sách meta trơ + nút tải rời rạc; 4 trang PDF xếp dọc mỗi trang rộng cả cột nên trang dài ~7300px ở desktop; player bị bẻ rộng bằng `w-[77vw]` + `translate` nên lệch khỏi lưới, bàn phím/khuông nhạc nằm trong ô trống không có khung; các khối tải MIDI/MP3, PDF, bài liên quan mỗi nơi một kiểu; sidebar trôi mất khi cuộn qua các trang dài.

**Approach:** Từ `lg`, phần đầu chia 2 cột: trái là breadcrumb, nhãn, tiêu đề, phụ đề, Composer và Genre; phải là thẻ thông tin (độ khó, lượt xem, số trang, cập nhật) kèm nhóm nút tải/mua. Player đặt trong `Card` rộng đúng bề ngang trang (bỏ `w-[77vw]`), thanh điều khiển chạm ≥ 44px. Ảnh trang PDF thành lưới 2 cột kiểu tờ giấy (viền, bóng). Khối MIDI/MP3 và PDF dùng chung kiểu thẻ; sidebar dính (`sticky`) từ `lg`, "bài liên quan" có ảnh bìa nhỏ. Không đổi logic mua/tải, modal thanh toán, hay dữ liệu.

## Boundaries & Constraints

**Always:** Giữ toàn bộ hành vi: Sheet free tải trực tiếp, Sheet có giá mở modal (`PurchaseProvider`), chế độ xem trước Draft ẩn nút tải và quảng cáo, các vị trí quảng cáo (`SIDEBAR_LEFT/RIGHT`, `IN_CONTENT`) và lưới 3 cột khi có quảng cáo trái; `aria-labelledby` các khối, thứ tự heading, JSON-LD/SEO; i18n vi/en; focus ring brass, chạm ≥ 44px, `prefers-reduced-motion`; không tràn ngang ở 390/768/1280px; mọi trạng thái có/không (pages, midi, video, lyrics, related, series) vẫn ổn khi vắng.

**Never:** Sửa `payment-modal`, `purchase-provider`, API mua/tải, logic phát nhạc (`midi-player` lõi, `piano-view`, `notation-view`) ngoài lớp trình bày của thanh điều khiển; đổi màu/font/token đã có; thêm thư viện; lightbox/zoom ảnh trang (ngoài phạm vi).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Desktop đủ dữ liệu | `lg+`, có pages/midi/video/related | Đầu trang 2 cột (thông tin + thẻ tải bên phải); player trong Card; ảnh trang 2 cột; sidebar dính | N/A |
| Mobile | `< lg` | Xếp dọc: tiêu đề, thẻ thông tin + nút tải, player, ảnh trang 1 cột, khối tải âm thanh, sidebar | Không tràn ngang |
| Sheet free | `isFree` | Nút tải trực tiếp trong thẻ thông tin; không có modal | N/A |
| Sheet có giá | `purchase` | Nút mở modal trong thẻ thông tin (nhóm), call-out MIDI/MP3 và nút PDF sidebar như cũ | N/A |
| Preview Draft | `showDownloads=false` | Không nút tải, không quảng cáo; bố cục vẫn đủ | N/A |
| Thiếu thành phần | Không có midi/pages/video/lyrics/related/series | Khối tương ứng ẩn hẳn, bố cục không để lỗ trống | N/A |
| Có quảng cáo trái | `SIDEBAR_LEFT` | Lưới 3 cột `xl` giữ nguyên; `div.grid` đầu tiên của trang vẫn là lưới nội dung | N/A |
| Related có/không ảnh | `thumbnailUrl` null | Hàng bài liên quan hiện placeholder cùng khung | N/A |
| Reduced motion | Bật | Không chuyển động mới | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/sheet/sheet-detail.tsx` -- sắp lại phần đầu (2 cột từ `lg`, thẻ thông tin), lưới ảnh trang, sidebar `sticky`; `SheetLinks` có ảnh bìa nhỏ. Giữ nguyên: `purchase`/`showPdf`/`adSlots`, `PurchaseProvider`. Bài test hiện có đòi `container.querySelector('div.grid')` đầu tiên là lưới nội dung (không chứa `12rem` khi không có quảng cáo trái): không dùng `div.grid` trong phần đầu (dùng `flex`/`dl.grid`).
- `apps/web/src/components/sheet/midi-player.tsx` -- chỉ lớp trình bày: `PLAYER_WIDTH` → rộng bằng cột, bọc Card, `control` thành `min-h-11 rounded-md px-3`, nhóm điều khiển; không đổi state/hàm. Test `midi-player*.test.tsx` kiểm hành vi, không kiểm `77vw`.
- `apps/web/src/components/sheet/player-slot.tsx` -- không đổi (chỉ chọn có/không hiện).
- `apps/web/src/components/sheet/{download-buttons,purchase-buttons}.tsx` -- khối `audio`/call-out và `pdf` dùng chung lớp thẻ (hiện lặp `rounded-md border bg-surface-container-low p-6`); xuất hằng `calloutCardClass`.
- `apps/web/src/components/sheet/{youtube-embed,lyrics}.tsx` -- khung video `rounded-xl` + bóng; lyrics trong thẻ nhẹ nếu cần.
- `apps/web/src/components/sheet/download-button-class.ts` -- giữ; không đổi API.
- `apps/web/src/app/[locale]/sheet/[slug]/loading.tsx` -- skeleton theo bố cục mới (dùng `Skeleton`).
- `apps/web/src/messages/{vi,en}.json` -- thêm khoá nhỏ nếu cần (vd. tiêu đề thẻ thông tin).
- Test: `sheet-detail.test.tsx` (cập nhật phần kiểm cấu trúc, thêm: thẻ thông tin chứa meta + nút tải; ảnh trang trong lưới; related có/không ảnh; preview ẩn nút), `midi-player.test.tsx` (điều khiển vẫn hoạt động).
- Không đổi: `apps/api`, `apps/admin`, `packages/*`, `components/payment/*`, `lib/midi/*`.

## Tasks & Acceptance

**Execution:**
- [x] `sheet-detail.tsx`, `loading.tsx` + test -- đầu trang 2 cột, lưới ảnh trang, sidebar dính, related có ảnh
- [x] `midi-player.tsx` (lớp trình bày) + test -- player trong Card, điều khiển 44px, bỏ `77vw`
- [x] `download-buttons.tsx`, `purchase-buttons.tsx`, `youtube-embed.tsx` -- kiểu thẻ chung
- [x] Chụp `u3-after` (mobile/tablet/desktop; thêm bản có player mở nếu chụp được), so `u3-before`, sửa lỗi, founder duyệt ảnh

**Acceptance Criteria:**
- Given ảnh `/sheet/<slug>` ở 3 cỡ, when kiểm tra, then không tràn ngang, trang desktop ngắn hơn rõ rệt so với `u3-before` (~7300px), player và các khối thẳng hàng với lưới trang.
- Given Sheet free / có giá / preview Draft, when render, then hành vi nút tải đúng như trước (test hiện có vẫn xanh).
- Given người dùng bàn phím, when Tab qua đầu trang và player, then thứ tự: breadcrumb, tag/link, nút tải, điều khiển player; focus luôn thấy rõ.
- Given cuộn dài ở `lg+`, when xem sidebar, then nó dính dưới header và không che nội dung.

## Implementation Notes

Đã làm: đầu trang 2 cột từ `lg` (trái: nhãn, H1, phụ đề, Composer, Genre; phải: `Card` thông tin + nút tải/mua, dùng `flex`/`dl.grid`, không `div.grid`); player dùng `calloutCardClass` (bỏ `w-[77vw]`+translate), `control` cao 44px; ảnh trang lưới 2 cột từ `sm`, kiểu tờ giấy; `calloutCardClass` (xuất từ `download-button-class.ts`) dùng cho player, call-out MIDI/MP3, PDF, liên quan/cùng Series; sidebar `lg:sticky lg:top-40`; liên quan có ảnh bìa nhỏ/placeholder; video `rounded-xl` có bóng; `loading.tsx` theo bố cục mới. Không đụng modal/purchase/API/lõi player.
Kết quả: web lint/typecheck/build xanh, 871 test (thêm 3). Ảnh `u3-after`: trang desktop ~3955px (trước ~7300px), không tràn ngang ở 3 cỡ. Chưa kiểm tay: modal thanh toán (seed không bật PayPal), sidebar dính khi có quảng cáo dài.

## Spec Change Log

## Review Triage Log

## Design Notes

Thẻ thông tin bên phải gom những gì người dùng cần để quyết định (độ khó, số trang, nút tải) cạnh tiêu đề thay vì dồn xuống dưới danh sách meta; đây cũng là chỗ dễ thấy nhất cho nút mua. Lưới 2 cột cho ảnh trang vì mục đích là xem trước (vẫn đọc được) chứ không phải đọc cả bản; bản đầy đủ là PDF. Bỏ `w-[77vw]` + `translate` vì nó phá lưới (lệch khi có thanh cuộn, đè sidebar quảng cáo) và không có lý do nào ngoài việc rộng hơn cột.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` (không nạp `.env` vào shell) -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label u3-after` -- expected: ảnh, không cảnh báo tràn ngang hay lớp phủ lỗi Next

**Manual checks (if no CLI):**
- So `u3-before` và `u3-after` ở 390/768/1280px; kiểm Sheet có giá (mở modal) bằng tay vì seed không bật PayPal.
