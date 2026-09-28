---
title: Piano Daily - Experience
status: final
created: 2026-09-27
updated: 2026-09-27
name: Piano Daily
sources:
  - ../../briefs/brief-Piano-Daily-2026-09-27/brief.md
  - ../../briefs/brief-Piano-Daily-2026-09-27/addendum.md
  - ../../prds/prd-Piano-Daily-2026-09-27/prd.md
---

# Piano Daily — Experience Spine

> Cặp với `DESIGN.md` ("Ivory & Walnut"). UJ-1/UJ-2/UJ-3 mirror trực tiếp từ `prd.md` §2.3 (Lan, Minh, Founder) — không đổi tên/ID, chỉ bổ sung chi tiết cấp UI/component.

## Foundation

Web responsive duy nhất (không có app native — xem PRD §5 Non-Goals), gồm hai bề mặt tách biệt: **Frontend User** (công khai, tối ưu cho mọi thiết bị, mọi độ tuổi/kỹ năng công nghệ) và **Frontend Admin** (chỉ founder dùng, tối ưu cho desktop, không cần chăm chút responsive kỹ như phần công khai). Chưa chọn UI kit cụ thể cho Admin (Architecture sẽ quyết định shadcn/ui hay Ant Design — xem `addendum.md` §2); dù kit nào được chọn, các quy tắc hành vi trong tài liệu này áp dụng như lớp override, không đổi. `DESIGN.md` là nguồn tham chiếu hình ảnh; tài liệu này quy định cách nó vận hành.

## Information Architecture

| Bề mặt | Vào từ | Mục đích |
|---|---|---|
| Trang theo Level (`/level/[level]`) | Menu chính, trang chủ = Level mặc định | Điểm vào chính để duyệt thư viện theo cấp độ |
| Tìm kiếm (`/search`) | Ô search trên header/hero | Tìm theo tên bài/Composer/lyrics/ID + lọc |
| Trang Composer (`/composer/[slug]`) | Click tên Composer bất kỳ đâu | Toàn bộ Sheet của một tác giả |
| Trang Genre (`/genre/[slug]`) | Click tag Genre | Toàn bộ Sheet cùng thể loại |
| Chi tiết Sheet (`/sheet/[slug]`) | Click thẻ Sheet từ bất kỳ lưới nào | Xem/nghe thử + điểm quyết định tải/mua |
| Thanh toán thành công | Sau khi PayPal capture thành công | Tải file đã mua + xác nhận email đã gửi |
| Admin: Đăng nhập | `/admin` chưa có phiên | Cổng vào duy nhất của Admin |
| Admin: Dashboard | Sau đăng nhập | Tổng quan lượt xem/tải/doanh thu |
| Admin: Quản lý Sheet | Sidebar Admin | CRUD Sheet, upload file, đặt giá (UJ-3) |
| Admin: Composer/Genre/Series | Sidebar Admin | CRUD phân loại |
| Admin: Quảng cáo | Sidebar Admin | Bật/tắt AdSlot theo vị trí |
| Admin: Đơn hàng | Sidebar Admin | Danh sách Order, hoàn tiền, gia hạn token |
| Admin: Cài đặt | Sidebar Admin | Site settings, bật/tắt thanh toán, mặc định token |

Modal chỉ lồng một cấp: modal thanh toán không bao giờ mở modal khác bên trong nó (kể cả popup PayPal — popup PayPal thay thế modal thanh toán tạm thời, không chồng lên).

→ Tham chiếu bố cục: [`mockups/level-page.html`](mockups/level-page.html) (Trang theo Level), [`mockups/sheet-detail.html`](mockups/sheet-detail.html) (Chi tiết Sheet). Các bề mặt còn lại (Tìm kiếm, Composer, Genre, Thanh toán thành công, toàn bộ Admin) là spine-only theo quyết định của founder — dựng trực tiếp từ các bảng trong tài liệu này, không có mock riêng. Spine luôn thắng khi xung đột với mock.

## Voice and Tone

Microcopy. Giọng thương hiệu và định hướng thẩm mỹ nằm ở `DESIGN.md.Brand & Style`.

| Nên | Không nên |
|---|---|
| "Bấm để nghe thử trước khi tải." | "Thử ngay đi! 🎹✨" |
| "Bản biên soạn của Piano Daily." | "Sheet chuẩn 100% chính xác!" (tuyên bố quá đà) |
| "Thanh toán thành công. File của bạn đã sẵn sàng." | "Thanh toán thành công! 🎉🎉🎉" |
| "Link tải còn hiệu lực 5 ngày, 3 lượt." | "Ôi không, link sắp hết hạn rồi!" |
| Với người mới: cùng một giọng như với người chơi lâu năm — không "dạy đời", không đơn giản hoá quá mức. | Giọng khác nhau theo trình độ — Piano Daily nói chuyện với mọi trình độ như nhau, tôn trọng người mới. |
| Lỗi thanh toán: nói rõ chuyện gì xảy ra + việc cần làm tiếp. | Thông báo lỗi chung chung ("Có lỗi xảy ra"). |

## Component Patterns

Hành vi. Đặc tả hình ảnh nằm ở `DESIGN.md.Components`.

| Component | Dùng ở | Quy tắc hành vi |
|---|---|---|
| Thẻ Sheet (`card-sheet`) | Mọi lưới (Level/Search/Composer/Genre) | Click bất kỳ đâu trên thẻ → trang chi tiết Sheet. Badge Level + HOT (nếu có) luôn hiện, không cần hover. Icon play nhỏ trên thumbnail cho phép nghe thử nhanh 10-15 giây ngay tại lưới mà không rời trang (mini-preview, khác với MIDI player đầy đủ ở trang chi tiết). |
| Lưới Sheet | Level/Search/Composer/Genre | **Phân trang theo số trang, không dùng infinite scroll** — quyết định để phục vụ SEO/sitemap (mỗi trang có URL riêng crawl được, khớp yêu cầu SSR ở PRD FR-20); infinite scroll làm nội dung sau trang 1 khó được index. |
| MIDI player | Chi tiết Sheet | Play/Pause, thanh tua kéo được, dropdown tốc độ (0.5x–2x), phím đàn ảo highlight nốt đang phát bằng `{colors.secondary}`. Không tự động phát khi vào trang (tôn trọng người dùng, tránh giật mình). |
| Modal thanh toán (`payment-modal`) | Bấm Download trên Sheet không FREE | Mở với animation mờ-dần nhẹ (không trượt/nảy). Luôn hiện rõ: tên bài, loại file/bundle đã chọn, giá, ô email. Nút PayPal render bởi SDK, không custom style (xem DESIGN.md). Đóng modal (X hoặc click nền) không huỷ Order đã tạo ở trạng thái PENDING — Order tự hết hạn sau một khoảng thời gian nếu không hoàn tất (tránh rác dữ liệu). Xem [`mockups/payment-modal.html`](mockups/payment-modal.html) (trạng thái bình thường + lỗi thanh toán). |
| Nhóm nút Download | Chi tiết Sheet | 3 nút riêng biệt (PDF/.mp3/.mid) dùng `button-download` — bấm nút nào chỉ mua/tải đúng định dạng đó trừ khi người dùng chủ động chọn Bundle trong modal. |
| Tag Genre (`tag-genre`) | Trang Level, tag cloud + bộ lọc Search | Click một tag → lọc lưới ngay tại chỗ (không chuyển trang riêng); tag đang chọn đổi sang nền `{colors.secondary}` (xem DESIGN.md). |
| Bộ lọc tìm kiếm | `/search` | Level/Genre/Composer/định dạng là các control độc lập, kết hợp kiểu AND (khớp PRD FR-2: giao, không phải hợp). Genre dùng lại `tag-genre`; Level/Composer/định dạng dùng control chuẩn của UI kit Admin không áp dụng ở đây — Frontend User luôn dùng token DESIGN.md riêng, không kế thừa UI kit Admin. |
| Uploader file (Admin) | Form Sheet | Kéo-thả hoặc click chọn file, thanh tiến trình theo %, xem trước ngay khi xong (thumbnail PDF, sóng âm hoặc player MIDI/MP3 nhỏ). Lỗi định dạng/dung lượng dùng `form-error`, hiện ngay dưới ô, không chờ submit form mới báo. Chrome còn lại kế thừa UI kit Admin (xem DESIGN.md.Components → Admin). |
| Bảng dữ liệu Admin (Sheet/Order/...) | Trang danh sách Admin | Có ô tìm kiếm + bộ lọc cố định trên đầu bảng, phân trang, click hàng mở chi tiết/sửa. Chrome kế thừa UI kit Admin, chỉ nút hành động liên quan tiền (hoàn tiền, gia hạn token) đổi màu theo override thương hiệu (xem DESIGN.md.Components → Admin). |

## State Patterns

| Trạng thái | Bề mặt | Xử lý |
|---|---|---|
| Đang tải danh sách Sheet | Level/Search/Composer/Genre | Skeleton card (khung xám nhạt theo hình dạng thẻ Sheet), giữ đúng layout lưới để tránh giật trang khi data về. |
| Tìm kiếm không có kết quả | `/search` | `headline-sm`: "Không tìm thấy bài nào khớp." Gợi ý bỏ bớt bộ lọc hoặc xem theo Level. |
| Sheet thiếu một số định dạng | Chi tiết Sheet | Chỉ hiện nút Download cho định dạng thực sự có (`has_midi`/`has_mp3` false → ẩn nút đó hoàn toàn, không hiện nút mờ/disable). |
| Đang xử lý thanh toán | Modal → PayPal popup | Nút PayPal disable + spinner nhỏ sau khi người dùng bấm capture, tới khi backend xác nhận PAID hoặc trả lỗi — không cho bấm lại gây tạo trùng Order. |
| Thanh toán thất bại | Modal | Thông báo cụ thể theo lý do trả về (thẻ bị từ chối / phiên PayPal hết hạn / lỗi mạng), giữ nguyên lựa chọn file/bundle đã chọn, cho thử lại ngay không cần mở lại modal từ đầu. |
| Token tải hết hạn/hết lượt | Click link trong email hoặc nút tải cũ | Trang báo rõ "Link tải đã hết hiệu lực" + nút liên hệ lại (không phải mua lại tự động — tránh cảm giác bị ép mua lần hai oan uổng khi có thể là lỗi hệ thống). |
| Sheet Draft | Mọi trang công khai | Không tồn tại đối với người dùng công khai — 404 nếu truy cập trực tiếp URL, không lộ trạng thái Draft. |
| Upload file thất bại (Admin) | Form Sheet | Thông báo lý do cụ thể (sai định dạng / vượt dung lượng / lỗi mạng) ngay tại ô upload, không mất dữ liệu các trường khác đã nhập. |
| AdSlot tắt | Mọi vị trí quảng cáo | Vị trí đó không chiếm không gian (không phải ẩn bằng `display:none` còn giữ khoảng trắng) — layout co lại tự nhiên. |

## Interaction Primitives

**Chuột/chạm là chính** — đối tượng chính (phụ huynh, người mới) không phải power user; không có phím tắt bắt buộc để dùng được site.

- Click/tap để điều hướng và hành động — không có thao tác kéo-thả ở Frontend User.
- Kéo-thả chỉ xuất hiện ở Admin (upload file) — có fallback click-để-chọn-file cho người không quen kéo-thả.
- Hover chỉ dùng để *tăng cường* (nâng nhẹ thẻ Sheet, hiện icon play) — không phải điều kiện duy nhất để thấy thông tin (mọi thông tin quan trọng hiện sẵn không cần hover, quan trọng cho người dùng cảm ứng trên mobile).
- MIDI player: thao tác chuẩn media player (play/pause/seek/tốc độ), không cần học cách dùng mới.
- Cấm: infinite scroll (đã quyết định dùng phân trang — xem Component Patterns), tự động phát âm thanh khi tải trang, đóng modal thanh toán bằng cách bấm ra ngoài nếu popup PayPal đang mở (tránh mất tiến trình thanh toán giữa chừng).

## Accessibility Floor

Hành vi. Độ tương phản màu nằm ở `DESIGN.md` (palette Ivory & Walnut cần kiểm tra tỷ lệ tương phản WCAG AA cho text trên `{colors.surface}` khi lên mock thật — `[NOTE FOR UX]` chưa đo formal, cần kiểm khi có mock).

- Ảnh thumbnail Sheet và ảnh trang nhạc đều cần `alt text` mô tả (tối thiểu: tên bài + "trang N") — quan trọng vì đây là nội dung chính, không phải trang trí.
- MIDI player không phải kênh thông tin duy nhất: nốt đang phát hiển thị cả bằng chữ (không chỉ màu) trên phím đàn ảo, để không phụ thuộc hoàn toàn vào phân biệt màu sắc.
- Video YouTube nhúng giữ nguyên caption/phụ đề gốc của YouTube (không tự thêm) — `[ASSUMPTION]` không cam kết phụ đề tiếng Việt cho video bên thứ ba, ngoài tầm kiểm soát của Piano Daily.
- Mọi form (checkout email, form Admin) có label rõ ràng gắn với input, thông báo lỗi đọc được bằng screen reader (không chỉ đổi màu viền).
- Focus ring dùng viền `{colors.secondary}` 2px, đủ tương phản trên nền `{colors.surface}` — áp dụng cho mọi phần tử bấm được kể cả badge/tag lọc được.

## Responsive & Platform

| Breakpoint | Hành vi |
|---|---|
| `≥ lg` (1024px+) | Lưới Sheet 3 cột. Trang chi tiết Sheet: nội dung chính + sidebar liên quan 2 cột. |
| `md` (768–1023px) | Lưới Sheet 2 cột. Sidebar liên quan chuyển xuống dưới nội dung chính (1 cột dọc). |
| `< md` (`sm`) | Lưới Sheet 1 cột. Modal thanh toán chiếm toàn màn hình thay vì nổi giữa. Menu chính thu vào hamburger. |

Admin tối ưu chính cho desktop (founder thao tác từ máy tính khi biên soạn/upload nội dung) — vẫn dùng được trên tablet/mobile ở mức xem/duyệt cơ bản nhưng không phải trọng tâm tối ưu, hợp lý cho phạm vi hobby/solo (PRD §Reviewer Gate đã xác nhận hướng này không phải theater, mà là quyết định phạm vi có chủ đích).

## Inspiration & Anti-patterns

*4 ảnh tham khảo PianoSnap ở `imports/` minh hoạ các điểm bên dưới: [`imports/pianosnap-level-page.png`](imports/pianosnap-level-page.png) (lưới thẻ + tag cloud), [`imports/pianosnap-sheet-detail.png`](imports/pianosnap-sheet-detail.png) (bố cục trang chi tiết + nút tải), [`imports/pianosnap-practice-player.png`](imports/pianosnap-practice-player.png) (MIDI player + phím đàn ảo), [`imports/pianosnap-download-video-blocks.png`](imports/pianosnap-download-video-blocks.png) (khối tải riêng theo định dạng + video nhúng — cũng minh hoạ vấn đề "quảng cáo chen giữa nội dung" bị từ chối bên dưới). Spine thắng khi xung đột với ảnh tham khảo.*

- **Lấy từ PianoSnap:** logic lưới thẻ Sheet (thumbnail + badge Level + nhãn định dạng + số trang + lượt xem), tag cloud Genre để lọc nhanh, cấu trúc trang chi tiết Sheet (breadcrumb → tiêu đề → meta → nút tải → player → sheet ảnh → liên quan) — các mẫu này đã chứng minh hiệu quả cho việc duyệt/tìm sheet nhạc, giữ lại để không bắt người dùng học lại từ đầu.
- **Từ chối — quảng cáo chen giữa nội dung dày đặc:** PianoSnap đặt quảng cáo xen kẽ trực tiếp trong luồng đọc (giữa danh sách bài, trong nội dung). Piano Daily giữ AdSlot ở các vị trí cố định, tách biệt rõ bằng viền đứt nét trung tính (xem DESIGN.md), không chèn giữa các thẻ Sheet trong lưới.
- **Từ chối — giao diện lạnh, không có bản sắc riêng:** PianoSnap trông như một site sheet nhạc chung chung. Piano Daily chủ động khác biệt bằng bảng màu/typography "Ivory & Walnut" — đây chính là một phần lý do người dùng trả tiền thay vì dùng bản miễn phí ở nơi khác (khớp Brief §Điểm khác biệt).
- **Từ chối — tự động phát âm thanh/video khi vào trang:** gây khó chịu, đặc biệt với phụ huynh mở nhiều tab cùng lúc khi tìm bài cho con.

## Key Flows

*UJ-1/UJ-2/UJ-3 mirror `prd.md` §2.3 — cùng nhân vật, cùng ID, thêm chi tiết UI/component.*

### UJ-1 — Lan tìm bài cho con và mua bản trọn gói

1. Lan vào `/level/beginner` từ kết quả Google. Hero hiện tiêu đề `display-lg` "Beginner Piano Sheet PDF" + ô tìm kiếm lớn.
2. Cô gõ tên bài, lưới Sheet lọc theo phân trang (không giật trang, skeleton card khi chờ).
3. Mở một thẻ Sheet → trang chi tiết. Bấm icon play trên phím đàn ảo (MIDI player) — không tự phát, cô chủ động bấm.
4. Ưng ý, bấm nút "Download PDF" (`button-download`, màu brass) → modal thanh toán mờ-dần hiện ra, chọn Bundle, nhập email.
5. Bấm nút PayPal (giao diện gốc PayPal) → popup thanh toán → xác nhận.
6. **Climax:** Modal đóng, trang "Thanh toán thành công" hiện 3 nút tải sẵn sàng ngay — không cần chờ tải trang mới, cảm giác tức thì.
7. Email xác nhận + link tải lại đến hộp thư gần như đồng thời.

Lỗi: PayPal từ chối thẻ → thông báo cụ thể trong modal, Lan sửa lại thông tin và thử lại ngay mà không mất lựa chọn Bundle + email đã nhập.

### UJ-2 — Minh nghe thử miễn phí trước khi mua

1. Minh vào `/level/expert`, lướt lưới 3 cột, dùng icon play mini trên vài thẻ để nghe nhanh ngay tại lưới.
2. Mở 2-3 trang chi tiết, dùng MIDI player đầy đủ + xem video YouTube — không có modal nào chặn.
3. **Climax:** Ở một bài ưng ý, bấm Download — modal thanh toán lần đầu tiên xuất hiện trong cả phiên duyệt. Minh cảm nhận rõ ràng: xem/nghe không giới hạn, chỉ tải mới trả phí.
4. Chọn mua lẻ file PDF (không cần Bundle vì chỉ cần bản in).

### UJ-3 — Founder đăng sheet mới

1. Đăng nhập Admin → sidebar → Quản lý Sheet → "Tạo mới".
2. Điền form, kéo-thả PDF vào uploader — thanh tiến trình chạy, xong tự hiện thumbnail trang đầu ngay trong form (xem trước không cần rời trang).
3. Upload MIDI/MP3 tương tự, dán link YouTube — preview video hiện ngay trong form.
4. Điền giá từng định dạng + giá Bundle, lưu Draft.
5. Xem trước bằng nút "Xem như người dùng" (mở tab mới tới trang chi tiết ở chế độ preview).
6. **Climax:** Founder chuyển trạng thái Published — không có bước xác nhận rườm rà (Piano Daily tin tưởng founder, không hỏi "bạn có chắc chắn?"), Sheet xuất hiện ngay trên trang Level tương ứng.

Lỗi: Upload PDF quá 20MB → báo lỗi ngay dưới ô upload, các trường khác (tiêu đề, giá đã nhập...) không bị mất, founder chỉ cần thử upload lại.
