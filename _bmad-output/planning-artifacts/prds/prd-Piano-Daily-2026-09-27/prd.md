---
title: Piano Daily
created: 2026-09-27
updated: 2026-09-27
status: final
---

# PRD: Piano Daily
*Working title — confirm.*

## 0. Mục đích tài liệu

Tài liệu này dành cho chính founder (vừa là PM, vừa là người code) và cho các bước tiếp theo trong quy trình BMad (`bmad-architecture`, `bmad-create-epics-and-stories`). PRD được xây trên nền `brief.md` (mục tiêu, vấn đề, người dùng, khác biệt cạnh tranh) — không lặp lại nội dung đó, chỉ tham chiếu. Toàn bộ đặc tả kỹ thuật chi tiết (tech stack, schema database, danh sách API, layout từng trang) đã được chốt sẵn và nằm trong `../../briefs/brief-Piano-Daily-2026-09-27/addendum.md` — PRD này diễn giải nó thành yêu cầu chức năng (capability), không lặp lại phần "làm bằng gì/làm thế nào". Thuật ngữ dùng xuyên suốt tài liệu theo đúng mục 3. Glossary; giả định được đánh dấu `[ASSUMPTION]` inline và tổng hợp lại ở mục 9.

## 1. Tầm nhìn

Piano Daily là thư viện sheet nhạc piano trực tuyến nơi người học ở mọi trình độ — người mới bắt đầu, giáo viên, phụ huynh, người chơi lâu năm — có thể tìm đúng bài theo cấp độ, nghe thử ngay trên trình duyệt qua MIDI player mô phỏng phím đàn, xem video hướng dẫn, rồi tải bản PDF/MIDI/MP3 để luyện tập hoặc dạy học. Khác với các thư viện sheet miễn phí sống bằng quảng cáo dày đặc, nội dung ở đây do founder tự biên soạn lại (không copy nguyên gốc), và một phần doanh thu đến trực tiếp từ người dùng qua các file tải trả phí — cho phép đầu tư lâu dài vào chất lượng biên soạn thay vì chạy đua số lượng.

v1 là một sản phẩm hoàn chỉnh, có thể vận hành kinh doanh thật ngay khi ra mắt: xem/nghe miễn phí luôn có, tải file có thể miễn phí hoặc trả phí qua PayPal tuỳ từng bài, và founder tự quản trị toàn bộ nội dung/giá/đơn hàng qua một trang admin riêng.

## 2. Người dùng mục tiêu

### 2.1 Jobs To Be Done

- **Người mới học piano**: "Tìm một bài dễ, nghe thử trước để biết mình chơi đúng nhịp/nốt chưa, rồi tải về tập."
- **Giáo viên piano**: "Tìm nhanh tài liệu phân loại đúng cấp độ để giao bài cho từng học trò, có thể cần tải nhiều bài cùng lúc."
- **Phụ huynh**: "Tìm bài phù hợp cho con, không rành nhạc lý, cần nghe thử trước khi quyết định tải/mua."
- **Người chơi lâu năm**: "Tìm bản khó hơn (Advanced/Expert), sẵn sàng trả phí nếu bản biên soạn chất lượng."
- **Founder (admin)**: "Đăng bài mới, đặt giá, theo dõi doanh thu và xử lý đơn hàng mà không cần đụng code."

### 2.2 Non-Users (v1)

- Người cần thanh toán bằng phương thức nội địa Việt Nam (Momo, VNPay, chuyển khoản) — v1 chỉ có PayPal/USD.
- Người muốn có tài khoản cá nhân với lịch sử mua hàng lâu dài — v1 dùng guest checkout theo email, không có đăng nhập cho người dùng thường.
- Người dùng app di động native — v1 chỉ có web responsive.

### 2.3 Key User Journeys

- **UJ-1. Lan (phụ huynh) tìm bài cho con và mua bản trọn gói.**
  - **Persona + context:** Lan không rành nhạc lý, muốn tìm bài Beginner cho con tập cuối tuần này.
  - **Entry state:** Chưa đăng nhập (guest), vào thẳng từ Google search hoặc trang chủ.
  - **Path:** Vào `/level/beginner` → gõ tên bài vào ô tìm kiếm hoặc lọc theo thể loại → mở trang chi tiết một sheet → bấm "Play & Practice" để nghe thử MIDI, xem sheet từng trang → ưng ý, bấm "Download PDF" → modal thanh toán hiện ra, chọn mua bundle (PDF+MIDI+MP3), nhập email → bấm nút PayPal, thanh toán trên popup PayPal.
  - **Climax:** Trang "Thanh toán thành công" hiện ra với 3 nút tải file ngay; đồng thời Lan nhận được email chứa link tải lại.
  - **Resolution:** Lan tải PDF ngay, lưu email để tải MIDI/MP3 sau cho máy tính ở nhà.
  - **Edge case:** Nếu Lan quay lại trang này sau (cùng email) và bấm Download lại trong vòng 7 ngày / còn lượt tải, hệ thống tải luôn, không bắt trả tiền lần hai. Realizes FR-9.

- **UJ-2. Minh (người chơi lâu năm) nghe thử một bài Expert miễn phí trước khi quyết định mua bài khác.**
  - **Persona + context:** Minh duyệt nhiều bài trong một buổi, chỉ mua khi thực sự ưng.
  - **Entry state:** Guest, vào từ `/level/expert`.
  - **Path:** Xem lưới sheet → mở vài trang chi tiết → nghe MIDI player, xem video YouTube, đọc lyrics & chords — tất cả miễn phí, không bị chặn bởi modal thanh toán.
  - **Climax:** Ở một bài ưng ý, Minh mới bấm Download và mới gặp modal thanh toán.
  - **Resolution:** Minh mua lẻ một file (chỉ PDF), không mua bundle.
  - *(Chứng minh: xem/nghe không bao giờ bị chặn bởi thanh toán — chỉ hành động tải mới yêu cầu trả phí trừ khi sheet được đánh dấu FREE.)*

- **UJ-3. Founder đăng một sheet mới và đặt giá.**
  - **Persona + context:** Founder vừa biên soạn xong một bản piano mới, cần đăng lên trong vài phút.
  - **Entry state:** Đã đăng nhập admin (SUPER_ADMIN).
  - **Path:** Vào trang Quản lý Sheet → "Tạo mới" → điền tiêu đề, chọn tác giả/series/thể loại/cấp độ, viết mô tả và lyrics & chords → kéo-thả upload PDF (hệ thống tự đếm trang, tạo thumbnail + ảnh từng trang), upload MIDI và MP3, dán link YouTube (xem preview ngay trong form) → điền giá từng loại file + giá bundle, hoặc tick "Miễn phí" → lưu ở trạng thái Draft, xem trước, rồi chuyển Published.
  - **Climax:** Sheet xuất hiện công khai trên trang level tương ứng, có thể mua/tải ngay.
  - **Resolution:** Founder có thể quay lại sau để sửa giá hoặc đánh dấu HOT.
  - **Edge case:** Nếu upload PDF thất bại hoặc quá dung lượng (>20MB), form báo lỗi rõ ràng và không cho lưu ở trạng thái Published thiếu file bắt buộc. Realizes FR-13.

*(Founder cũng là admin duy nhất ở v1 — không có journey riêng cho EDITOR, xem §2.2/§6.2.)*

## 3. Glossary

- **Sheet** — Một bản nhạc piano trong thư viện: có tiêu đề, tác giả, cấp độ, và (tối đa) 3 file tải (PDF/MIDI/MP3) cộng ảnh xem trước từng trang. Đơn vị nội dung trung tâm của toàn bộ hệ thống.
- **Level** — Cấp độ khó của một Sheet: BEGINNER, INTERMEDIATE, ADVANCED, hoặc EXPERT. Mỗi Sheet có đúng một Level.
- **Composer** — Tác giả/nhà soạn nhạc gốc của một Sheet (ví dụ: Carl Czerny). Một Composer có nhiều Sheet.
- **Series** — Một bộ sưu tập các Sheet cùng nguồn (ví dụ: "Practical Method for Beginners, Op. 599"), thuộc về một Composer.
- **Genre** — Thẻ thể loại/chủ đề gắn với Sheet (ví dụ: Classical, Piano for Kids), quan hệ nhiều-nhiều với Sheet.
- **SheetFile** — Một file vật lý gắn với Sheet: loại PDF, MIDI, MP3, THUMBNAIL, hoặc PAGE_IMAGE.
- **Bundle** — Gói mua trọn 3 định dạng (PDF+MIDI+MP3) của một Sheet với giá ưu đãi hơn tổng giá mua lẻ.
- **FREE Sheet** — Sheet có `is_free = true`; nút Download tải ngay, không qua luồng thanh toán.
- **Guest Checkout** — Luồng mua hàng chỉ cần nhập email, không cần tạo tài khoản người dùng.
- **Order** — Một giao dịch mua (lẻ hoặc bundle) gắn với một email, một Sheet, trạng thái PENDING/PAID/FAILED/REFUNDED/CANCELLED.
- **DownloadToken** — Mã truy cập được cấp sau khi Order chuyển PAID (hoặc với FREE Sheet), cho phép tải file trong một thời hạn và số lượt giới hạn.
- **AdSlot** — Một vị trí hiển thị quảng cáo trên site (HEADER, SIDEBAR_LEFT, SIDEBAR_RIGHT, IN_LIST, STICKY_BOTTOM, IN_CONTENT), bật/tắt độc lập.
- **Admin** — Người dùng có quyền vào trang quản trị; vai trò SUPER_ADMIN (toàn quyền) hoặc EDITOR (nội dung, chưa có ở v1 — xem §6.2).
- **Locale** — Ngôn ngữ hiển thị giao diện, `vi` hoặc `en`.

## 4. Tính năng

### 4.1 Duyệt & Tìm kiếm nội dung

**Mô tả:** Người dùng khám phá thư viện theo Level, Composer, hoặc Genre, hoặc tìm trực tiếp theo từ khoá. Đây là điểm vào chính cho mọi Journey (realizes UJ-1, UJ-2).

**Yêu cầu chức năng:**

#### FR-1: Duyệt theo Level
Người dùng (guest) xem được danh sách Sheet đã Published thuộc một Level, dạng lưới thẻ (thumbnail, tiêu đề, Composer, lượt xem, định dạng có sẵn, số trang), có phân trang hoặc infinite scroll, sắp xếp theo mới nhất hoặc xem nhiều nhất.

**Hệ quả kiểm chứng được:**
- Trang `/level/{level}` chỉ hiển thị Sheet có `status = PUBLISHED` và đúng Level được chọn.
- Mỗi thẻ hiển thị đúng các định dạng Sheet thực sự có (`has_sheet/has_chords/has_midi/has_mp3/has_video`).

#### FR-2: Tìm kiếm toàn văn
Người dùng tìm Sheet theo tên bài, tên Composer, lời bài hát, hoặc ID; có thể lọc thêm theo Level, Genre, Composer, định dạng có sẵn.

**Hệ quả kiểm chứng được:**
- Tìm một từ khoá trùng tiêu đề, tên Composer, hoặc nội dung lyrics đều trả về kết quả liên quan.
- Kết hợp từ khoá + bộ lọc Level thu hẹp đúng tập kết quả (giao, không phải hợp).

#### FR-3: Trang Composer và Genre
Người dùng xem thông tin một Composer hoặc Genre kèm danh sách Sheet liên quan, cùng dạng lưới thẻ như FR-1.

**Hệ quả kiểm chứng được:**
- `/composer/{slug}` chỉ liệt kê Sheet của đúng Composer đó; tương tự cho `/genre/{slug}`.

**NFR riêng của tính năng:**
- Trang Level/Search phải render được phía server (SSR/SSG) để phục vụ SEO — xem §Cross-Cutting NFRs.

### 4.2 Trang chi tiết Sheet & Trải nghiệm nghe thử

**Mô tả:** Nơi người dùng ra quyết định tải/mua. Xem sheet, nghe thử, xem video đều miễn phí không điều kiện (realizes UJ-2); đây là bước ngay trước luồng thanh toán (§4.3).

**Yêu cầu chức năng:**

#### FR-4: Xem chi tiết Sheet
Người dùng xem trang chi tiết một Sheet: tiêu đề, Composer, Level, điểm/ghi chú độ khó (ví dụ "15/100 — cả hai tay ở vị trí thoải mái"), số trang, lượt xem, ngày cập nhật, ảnh từng trang của bản nhạc, danh sách Sheet cùng Series, và (nếu có) mục Lyrics & Chords. Sheet được đánh dấu HOT hiển thị badge riêng trên cả thẻ lưới (FR-1) và trang chi tiết.

**Hệ quả kiểm chứng được:**
- Mỗi lượt xem trang chi tiết tăng `view_count` đúng một lần cho mỗi IP/phiên trong một khoảng thời gian (chống đếm trùng do refresh).

#### FR-5: Nghe thử qua MIDI player
Người dùng phát bản mô phỏng MIDI của Sheet ngay trên trang, có phím đàn ảo hiển thị nốt đang phát, tua thời gian, chỉnh tốc độ phát (0.5x–2x). Có ghi chú rõ đây là bản mô phỏng, chỉ để tham khảo.

**Hệ quả kiểm chứng được:**
- Phát/tạm dừng/tua đều hoạt động không cần tải file MIDI về máy hay đăng nhập.

#### FR-6: Xem video hướng dẫn YouTube
Nếu Sheet có `youtube_url`, người dùng xem video nhúng ngay trong trang (lazy-load), kèm ghi chú nguồn bên thứ ba.

**Hệ quả kiểm chứng được:**
- Sheet không có `youtube_url` thì không hiển thị khối video (không hiện khung trống).

**NFR riêng của tính năng:**
- MIDI player và video nhúng không được nằm phía sau bất kỳ bước xác thực hay thanh toán nào.

### 4.3 Thanh toán & Tải file

**Mô tả:** Chuyển đổi từ "muốn tải" thành doanh thu, hoặc tải ngay nếu Sheet miễn phí. Đây là tính năng có rủi ro cao nhất (tiền thật, gian lận, chống chia sẻ link) nên các hệ quả kiểm chứng được ở đây cụ thể hơn các tính năng khác (realizes UJ-1).

**Yêu cầu chức năng:**

#### FR-7: Mở luồng thanh toán khi bấm Download
Với Sheet không phải FREE, bấm bất kỳ nút Download (PDF/MIDI/MP3) mở modal thanh toán thay vì tải ngay: hiển thị tên bài, loại file, giá; cho chọn mua lẻ file đó hoặc mua Bundle; yêu cầu nhập email (Guest Checkout).

**Hệ quả kiểm chứng được:**
- Với Sheet `is_free = true`, bấm Download tải ngay, không hiện modal.
- Giá hiển thị trong modal luôn khớp với giá cấu hình trên Sheet tại thời điểm hiện tại (không cache giá cũ).

#### FR-8: Thanh toán qua PayPal
Người dùng hoàn tất thanh toán qua PayPal Smart Payment Buttons (hỗ trợ thẻ Visa/Mastercard qua PayPal) ngay trong modal.

**Hệ quả kiểm chứng được:**
- Giá gửi lên PayPal luôn được backend tính lại từ dữ liệu Sheet — không bao giờ nhận giá do client gửi lên làm giá cuối (xem NFR bảo mật).
- Sau khi PayPal xác nhận `COMPLETED`, Order nội bộ chuyển trạng thái PAID chỉ khi số tiền và loại tiền tệ khớp với Order đã tạo.

#### FR-9: Nhận và dùng lại link tải
Sau khi Order chuyển PAID, hệ thống sinh một DownloadToken (mặc định hiệu lực 7 ngày / tối đa 5 lượt tải, admin chỉnh được — `[ASSUMPTION: giá trị mặc định 7 ngày/5 lượt, admin có thể đổi trong Cài đặt]`), hiển thị ngay các nút tải trên trang "Thanh toán thành công", và gửi email chứa link tải lại. Dùng lại cùng email/token còn hiệu lực thì tải luôn, không phải trả tiền lại.

**Hệ quả kiểm chứng được:**
- Token hết hạn hoặc hết lượt tải trả lỗi rõ ràng cho người dùng (không tải được file, không lộ lỗi hệ thống).
- Mỗi lượt tải qua token được ghi log (IP, user agent, thời điểm).

#### FR-10: Xử lý webhook PayPal
Hệ thống nhận và xử lý webhook PayPal cho `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.DENIED`, có xác minh chữ ký.

**Hệ quả kiểm chứng được:**
- Nhận cùng một webhook event hai lần không tạo hai lần hiệu ứng (không cấp hai DownloadToken, không cộng trùng doanh thu) — idempotent theo `provider_event_id`.
- Webhook `REFUNDED` chuyển Order sang REFUNDED và vô hiệu hoá DownloadToken liên quan.

**NFR riêng của tính năng:**
- File gốc không bao giờ có URL public trực tiếp; chỉ phục vụ qua signed URL ngắn hạn sinh từ token hợp lệ.
- Tiền tệ: chỉ USD (PayPal không hỗ trợ VND) — xem Non-Goals.

**Ghi chú:** `[NOTE FOR PM]` Founder cần rà lại danh sách Sheet dự kiến đăng trước khi bật thanh toán thật (`PAYPAL_MODE=live`) để tránh bán nội dung có rủi ro bản quyền — xem §8 Open Questions.

### 4.4 Quản trị nội dung

**Mô tả:** Công cụ duy nhất của founder để đưa Sheet mới lên site mà không cần code (realizes UJ-3).

**Yêu cầu chức năng:**

#### FR-11: Đăng nhập admin
Admin đăng nhập bằng email + mật khẩu, có đăng xuất và đổi mật khẩu; mọi route admin đều yêu cầu phiên hợp lệ.

**Hệ quả kiểm chứng được:**
- Truy cập route admin khi chưa đăng nhập chuyển hướng về trang đăng nhập, không lộ dữ liệu.

#### FR-12: CRUD Sheet, Composer, Genre, Series
Admin tạo/sửa/xoá Sheet (kèm chuyển Draft/Published, đánh dấu HOT), Composer, Genre, Series qua form có tìm kiếm/lọc/phân trang.

**Hệ quả kiểm chứng được:**
- Sheet ở trạng thái Draft không xuất hiện trên bất kỳ trang công khai nào (Level, Search, Composer, Genre).

#### FR-13: Upload file & tự động xử lý PDF
Admin upload PDF/MIDI/MP3 cho một Sheet (kéo-thả, có thanh tiến trình); upload PDF tự động đếm số trang, tạo thumbnail trang đầu và ảnh từng trang.

**Hệ quả kiểm chứng được:**
- Upload file sai định dạng hoặc vượt giới hạn dung lượng (PDF/MP3 ≤ 20MB, MIDI ≤ 2MB) bị từ chối với thông báo rõ ràng, Sheet không bị lưu ở trạng thái thiếu file.

#### FR-14: Đặt giá Sheet
Admin đặt giá riêng cho PDF/MIDI/MP3 và giá Bundle cho một Sheet, hoặc đánh dấu Miễn phí; có công cụ đặt giá hàng loạt theo Level/Composer/Genre.

**Hệ quả kiểm chứng được:**
- Đánh dấu một Sheet Miễn phí thì các giá riêng lẻ không còn ảnh hưởng đến luồng Download (FR-7 bỏ qua modal thanh toán).

### 4.5 Quản trị đơn hàng, quảng cáo & doanh thu

**Mô tả:** Vận hành phần kinh doanh sau khi nội dung đã có: theo dõi tiền vào, xử lý khiếu nại, và quảng cáo bổ sung doanh thu.

**Yêu cầu chức năng:**

#### FR-15: Quản lý đơn hàng
Admin xem danh sách Order (lọc theo trạng thái/ngày/email), xem chi tiết, lịch sử tải, gửi lại email link tải, gia hạn DownloadToken, hoàn tiền (gọi PayPal Refund API).

**Hệ quả kiểm chứng được:**
- Hoàn tiền từ trang admin cập nhật đúng trạng thái Order và vô hiệu hoá DownloadToken tương ứng (đồng bộ với FR-10).

#### FR-16: Quản lý quảng cáo
Admin tạo/sửa/xoá AdSlot theo vị trí, bật/tắt độc lập từng vị trí.

**Hệ quả kiểm chứng được:**
- Tắt một AdSlot khiến vị trí đó không render trên frontend công khai ngay (không cần deploy lại).

#### FR-17: Dashboard doanh thu & lượt dùng
Admin xem tổng lượt xem/tải theo Level, doanh thu theo ngày/tháng, số đơn hàng, top Sheet bán chạy/xem nhiều.

**Hệ quả kiểm chứng được:**
- Số liệu doanh thu trên dashboard khớp với tổng các Order ở trạng thái PAID trừ đi REFUNDED trong cùng khoảng thời gian.

#### FR-18: Cài đặt site
Admin cấu hình tên site, logo, SEO mặc định, link kênh YouTube, bật/tắt toàn bộ hệ thống thanh toán, hạn dùng và số lượt tải mặc định của DownloadToken mới.

### 4.6 Song ngữ & SEO

**Mô tả:** Site phục vụ cả người dùng Việt Nam và quốc tế; SEO là kênh thu hút người dùng chính (không có ngân sách quảng cáo/marketing ban đầu — `[ASSUMPTION]`).

**Yêu cầu chức năng:**

#### FR-19: Tự động chọn ngôn ngữ theo IP
Site tự chọn Locale hiển thị theo IP: IP trong khu vực Việt Nam → `vi`, ngoài Việt Nam → `en` mặc định; người dùng đổi tay được, lựa chọn được nhớ lại cho lần sau. Phạm vi của Locale chỉ là khung giao diện hệ thống (menu, nút, nhãn, thông báo) — nội dung tự thân của từng Sheet (tiêu đề, mô tả, Lyrics & Chords) do founder tự biên soạn và nhập một phiên bản duy nhất, không đổi theo Locale.

**Hệ quả kiểm chứng được:**
- Đổi Locale thủ công không bị ghi đè lại bởi kết quả IP ở lần tải trang tiếp theo trong cùng phiên.

#### FR-20: SEO cho trang công khai
Mọi trang công khai (Level, Search, Composer, Genre, chi tiết Sheet) render phía server, có meta title/description theo Locale, Open Graph, JSON-LD (MusicComposition) cho trang chi tiết Sheet, và sitemap.xml cập nhật khi có Sheet Published mới.

**Hệ quả kiểm chứng được:**
- View-source một trang chi tiết Sheet đã published thấy đầy đủ nội dung chính (không rỗng chờ JS) và đúng thẻ JSON-LD.

## 5. Non-Goals (Rõ ràng không làm ở v1)

- Không hỗ trợ phương thức thanh toán nội địa Việt Nam (Momo, VNPay, chuyển khoản, ví điện tử khác) — chỉ PayPal/USD.
- Không có tài khoản/đăng nhập cho người dùng thường — chỉ Guest Checkout theo email.
- Không có app di động native (iOS/Android) — chỉ web responsive.
- Không xây quy trình EDITOR (nhân sự phụ quản lý nội dung) — chỉ một SUPER_ADMIN.
- Không tự động hoá việc biên soạn/chuyển đổi sheet nhạc (OCR, AI arrangement) — mọi Sheet do founder biên soạn thủ công rồi upload.
- Không xây hệ thống gợi ý (recommendation engine) cá nhân hoá — "Sheet liên quan" chỉ dựa trên Series/Composer/Level cố định.

## 6. Phạm vi MVP

### 6.1 Trong phạm vi
- Toàn bộ FR-1 đến FR-20 ở §4.
- Ba phần hệ thống: Frontend User, Frontend Admin, Backend API (kiến trúc/tech stack cụ thể → `addendum.md`, quyết định chi tiết ở `bmad-architecture`).
- Song ngữ VI/EN theo IP, SEO cơ bản cho toàn bộ trang công khai.
- Thanh toán PayPal + tải file có ngay từ bản đầu tiên (không tách phase).

### 6.2 Ngoài phạm vi MVP
- EDITOR role — data model có sẵn (`addendum.md`) nhưng chưa cần UI/flow riêng; chỉ dùng khi có nhân sự thứ hai.
- Phương thức thanh toán nội địa VN — cân nhắc thêm nếu tỷ lệ chuyển đổi từ IP Việt Nam thấp do rào cản PayPal/USD.
- Đa ngôn ngữ ngoài VI/EN.
- `[NOTE FOR PM]` Quy trình rà soát bản quyền/rủi ro pháp lý cho từng Sheet trước khi publish — chưa có form/checklist chính thức ở v1, founder tự kiểm tra thủ công. Nên xem lại nếu thư viện mở rộng nhanh.

## 7. Tiêu chí thành công

**Chính**
- **SM-1**: Có ít nhất một Order chuyển trạng thái PAID thành công ngoài môi trường sandbox trong tháng đầu vận hành thật. Validates FR-7, FR-8, FR-9.
- **SM-2**: Founder tạo/sửa/xoá và publish được một Sheet hoàn chỉnh (đủ PDF+MIDI+MP3+giá) từ trang admin mà không cần sửa code hay truy vấn database thủ công. Validates FR-12, FR-13, FR-14.

**Phụ**
- **SM-3**: MIDI player và trang chi tiết Sheet tải và phát được mượt trên một kết nối di động thông thường, không cần người dùng chờ lâu trước khi nghe thử. Validates FR-4, FR-5.

**Chỉ số đối trọng (không tối ưu hoá quá mức)**
- **SM-C1**: Tỷ lệ Sheet bị ẩn sau thanh toán không được tăng đến mức khiến trải nghiệm xem/nghe thử miễn phí (UJ-2) bị cảm giác là "mồi nhử" — nghe/xem/video luôn phải miễn phí không điều kiện, chỉ tải mới thu phí. Counterbalances SM-1.

*(Dự án cá nhân, không áp KPI số cứng theo brief — tiêu chí trên mang tính xác nhận "hệ thống hoạt động đúng trong thực tế", không phải mục tiêu tăng trưởng.)*

## Cross-Cutting NFRs

- **Bảo mật thanh toán**: giá luôn tính lại phía server từ dữ liệu Sheet hiện tại, không bao giờ tin giá client gửi lên (FR-8). Webhook PayPal phải xác minh chữ ký và xử lý idempotent theo `provider_event_id` (FR-10).
- **Bảo mật file**: file gốc (PDF/MIDI/MP3) không có URL public; chỉ truy cập qua signed URL ngắn hạn sinh từ DownloadToken hợp lệ (FR-9). Endpoint tải áp dụng rate limit chống lạm dụng.
- **Xác thực admin**: JWT access + refresh token, mật khẩu hash bcrypt, rate limit trên endpoint đăng nhập (FR-11).
- **SEO/hiệu năng**: mọi trang công khai phải SSR/SSG được, không phụ thuộc hoàn toàn vào client-side rendering để có nội dung chính (FR-20).

## Monetization

- Mô hình kết hợp: quảng cáo (AdSlot, FR-16) + bán file tải trả phí (FR-7–FR-9). Không phải một trong hai — cả hai cùng tồn tại.
- Giá theo từng Sheet, phân biệt mua lẻ theo định dạng (PDF/MIDI/MP3) và mua Bundle giá ưu đãi hơn.
- Tiền tệ duy nhất: USD, qua PayPal. `[ASSUMPTION]` Không quy đổi hiển thị giá sang VND ở v1 — hiển thị giá USD cho tất cả người dùng bất kể Locale.
- Admin toàn quyền đánh dấu bất kỳ Sheet nào là Miễn phí bất kỳ lúc nào (FR-14).

## Platform

- Chỉ web, responsive (desktop + mobile), không có ứng dụng native riêng ở v1 (xem §5 Non-Goals).
- Không giới hạn trình duyệt cụ thể ngoài các trình duyệt hiện đại hỗ trợ Web Audio API (cần thiết cho MIDI player, FR-5) — `[ASSUMPTION]` không hỗ trợ trình duyệt cũ/không có Web Audio.

## Information Architecture

Các nhóm route chính (tên route cụ thể → `addendum.md`):
- Công khai: Trang chủ/theo Level, Tìm kiếm, Trang Composer, Trang Genre, Chi tiết Sheet, Trang "Thanh toán thành công".
- Admin (yêu cầu đăng nhập): Dashboard, Quản lý Sheet, Quản lý Composer/Genre/Series, Quản lý Quảng cáo, Quản lý Đơn hàng, Cài đặt, Đăng nhập.

## 8. Câu hỏi còn mở

1. Danh sách Sheet dự kiến đăng có bài nào rủi ro bản quyền cao (tác phẩm còn giữ bản quyền chặt, chưa rõ quyền phái sinh) cần rà lại trước khi bật `PAYPAL_MODE=live` không? Liên quan §4.3 Ghi chú.
2. Nếu phần lớn traffic đến từ IP Việt Nam nhưng PayPal/USD gây rào cản chuyển đổi rõ rệt, có nên ưu tiên thêm phương thức thanh toán nội địa sớm hơn dự kiến không? (Hiện để ở §6.2 Ngoài phạm vi.)
3. Giá trị mặc định DownloadToken (7 ngày/5 lượt, FR-9) có cần khác nhau giữa mua lẻ và mua Bundle không, hay dùng chung một cấu hình?

## 9. Bảng tổng hợp giả định

- §4.3 FR-9 — Mặc định DownloadToken: 7 ngày hiệu lực / 5 lượt tải, admin chỉnh được trong Cài đặt.
- §4.3 Ghi chú — Founder tự rà soát rủi ro bản quyền thủ công trước khi publish, chưa có checklist chính thức.
- §4.6 — Không có ngân sách marketing ban đầu; SEO là kênh thu hút người dùng chính.
- §Monetization — Giá hiển thị luôn bằng USD cho mọi Locale, không quy đổi VND ở v1.
- §Platform — Không hỗ trợ trình duyệt không có Web Audio API cho tính năng nghe thử MIDI.
