---
title: Piano Daily - Product Brief
status: final
created: 2026-09-27
updated: 2026-09-27
---

# Product Brief: Piano Daily

## Tóm tắt

Piano Daily là một website thư viện sheet nhạc piano: người dùng duyệt bài theo cấp độ (Beginner/Intermediate/Advanced/Expert), tìm kiếm, xem sheet trực tuyến, nghe thử qua MIDI player có piano roll, xem video hướng dẫn YouTube, và tải về file PDF/MIDI/MP3. Điểm khác biệt cốt lõi so với các site sheet nhạc miễn phí hiện có (ví dụ pianosnap.com — nguồn tham khảo giao diện): nội dung là bản **biên soạn/biến tấu lại** của người sáng lập chứ không copy nguyên gốc, và mô hình kinh doanh kết hợp **quảng cáo + bán file tải về qua PayPal** thay vì chỉ dựa vào ads.

Đây là dự án cá nhân, tự làm (one-person, technical founder), nhưng được xây dựng với mục tiêu kinh doanh thật — có doanh thu, không phải chỉ portfolio. Việc đi chậm mà chắc được ưu tiên hơn deadline cứng.

## Vấn đề

Người học piano ở mọi trình độ — người mới bắt đầu, giáo viên tìm tài liệu cho học trò, phụ huynh tìm bài cho con tập, người chơi lâu năm tìm bản khó hơn — hiện phải lục lọi nhiều nguồn rời rạc (site sheet miễn phí đầy ads, MuseScore, YouTube, nhóm Facebook) để ghép đủ bộ: bản PDF để in, file MIDI để nghe thử, video để xem tay chơi thế nào. Không có một nơi tập trung, phân loại rõ theo cấp độ, cho trải nghiệm nghe-xem-tải liền mạch.

Các site tham khảo như PianoSnap giải quyết một phần (thư viện lớn, phân loại theo level, có MIDI player) nhưng sống bằng quảng cáo dày đặc, ảnh hưởng trải nghiệm, và không có mô hình để người làm nội dung có nguồn thu trực tiếp từ chất lượng bản biên soạn.

## Giải pháp

Một website ba phần — Frontend User (trang công khai), Frontend Admin (quản trị nội dung), Backend API. Trải nghiệm cốt lõi cho người dùng: từ lúc vào trang theo cấp độ đến lúc chọn được đúng bài, nghe thử qua MIDI player để biết bài đó "vừa tay" chưa, xem video hướng dẫn, rồi mới quyết định tải — miễn phí hoặc trả phí — không cần tạo tài khoản. Với founder, trang admin là công cụ duy nhất để vừa biên soạn nội dung mới vừa vận hành kinh doanh (giá, quảng cáo, đơn hàng) mà không cần đụng code sau khi đã dựng xong hệ thống.

Danh sách tính năng cụ thể theo từng phần nằm ở mục **Phạm vi** bên dưới; đặc tả kỹ thuật đầy đủ (tech stack, schema DB, danh sách API, UI từng trang) đã được chốt khá kỹ và lưu trong `addendum.md` — sẵn sàng làm input trực tiếp cho Architecture/PRD.

## Điểm khác biệt

- **Nội dung tự biên soạn, không copy nguyên gốc** — mỗi bản là bản biến tấu/dàn dựng lại của founder, giảm rủi ro bản quyền so với việc re-host bản gốc, đồng thời là lý do chính đáng để thu phí (giá trị gia tăng từ công sức biên soạn, không phải bán lại nội dung có sẵn).
- **Trải nghiệm sạch hơn, có lựa chọn trả phí thay ads** — vẫn giữ quảng cáo (AdSlot) nhưng thêm lựa chọn tải file chất lượng không giới hạn qua thanh toán, khác với các site chỉ sống bằng ads dày đặc.
- **[ASSUMPTION]** Founder tự kiểm soát toàn bộ chất lượng nội dung (curation thủ công), nên thư viện ban đầu sẽ nhỏ nhưng có chọn lọc, thay vì cố gắng chạy đua số lượng với các site đã có hàng trăm/nghìn bài — lợi thế cạnh tranh ban đầu nằm ở chất lượng biên soạn và trải nghiệm, không phải quy mô thư viện.

## Đối tượng phục vụ

Bốn nhóm người dùng chính, không phân biệt một persona duy nhất:
- **Người mới học piano** — cần bài dễ, có MIDI nghe mẫu để biết mình chơi đúng nhịp/nốt chưa.
- **Giáo viên piano** — cần nguồn tài liệu phân loại rõ theo cấp độ để giao bài cho học trò, có thể sẽ là nhóm mua trọn gói nhiều bài.
- **Phụ huynh** — tìm bài phù hợp cho con tập, ít rành nhạc lý, cần giao diện đơn giản và nghe thử trước khi tải/mua.
- **Người chơi lâu năm** — tìm bản khó hơn (Advanced/Expert), quan tâm chất lượng bản biên soạn hơn là giá.

## Tiêu chí thành công

Vì đây là dự án cá nhân làm dần không áp lịch cứng, tiêu chí thành công ở giai đoạn đầu mang tính định tính hơn là KPI số cứng:
- Có người dùng thật ngoài founder truy cập, xem và nghe thử sheet.
- Có ít nhất một đơn hàng thanh toán thành công qua PayPal (xác nhận luồng thanh toán — modal, capture, webhook, token tải — hoạt động đúng thực tế, không chỉ trên sandbox).
- Founder có thể tự thêm/sửa/xoá nội dung qua trang admin mà không cần đụng code.
- Trải nghiệm nghe thử (MIDI player) và xem sheet mượt, không làm người dùng bỏ đi trước khi đến bước tải/mua.

**[ASSUMPTION]** Khi có traffic thật, các chỉ số theo dõi tiếp theo nên là: tỷ lệ xem→tải/mua, doanh thu theo tháng, bài bán chạy nhất — nhưng chưa cần định nghĩa con số mục tiêu ở giai đoạn brief này.

## Phạm vi

**Trong phạm vi (v1 — bao gồm thanh toán ngay từ đầu, theo quyết định của founder):**
- Frontend User: trang theo cấp độ, tìm kiếm, trang tác giả/thể loại, trang chi tiết sheet (xem ảnh từng trang, MIDI player, video YouTube, lyrics & chords), luồng mua/tải qua PayPal (mua lẻ + bundle, guest checkout qua email, download token).
- Frontend Admin: đăng nhập, CRUD sheet/tác giả/thể loại/series, upload file với auto-thumbnail, quản lý giá, quản lý quảng cáo, quản lý đơn hàng (danh sách, hoàn tiền, gia hạn token), dashboard cơ bản.
- Backend API: auth (JWT), API public + admin như mô tả, tích hợp PayPal Orders v2 + webhook, tìm kiếm full-text, seed dữ liệu mẫu.
- Hạ tầng: Docker Compose (web, admin, api, postgres, minio), sẵn sàng deploy lên S3/R2 khi lên production.
- Song ngữ Tiếng Việt + Tiếng Anh cho giao diện, tự động chọn theo IP (Việt Nam → Tiếng Việt, ngoài Việt Nam → Tiếng Anh), có thể tự đổi tay.

**Ngoài phạm vi v1 (chưa làm, không có nghĩa là không bao giờ làm):**
- Phương thức thanh toán nội địa Việt Nam (Momo, VNPay, chuyển khoản) — hiện chỉ PayPal/USD, điều này có thể là rào cản chuyển đổi nếu phần lớn người dùng ở Việt Nam. **[Cần lưu ý ở PRD/Architecture, không phải quyết định lại ở đây.]**
- Tài khoản người dùng cuối (hiện tại là guest checkout bằng email, không có đăng nhập/lịch sử mua cho user thường).
- App di động riêng — chỉ web responsive.
- Các ngôn ngữ giao diện khác ngoài Việt/Anh — v1 chỉ hỗ trợ song ngữ **Tiếng Việt + Tiếng Anh**, tự động chọn theo IP: IP trong khu vực Việt Nam → Tiếng Việt, ngoài Việt Nam → Tiếng Anh mặc định (người dùng có thể tự đổi ngôn ngữ thủ công). Điều này cũng ngụ ý đối tượng phục vụ không chỉ giới hạn ở Việt Nam mà hướng tới người dùng quốc tế ngay từ v1.

## Rủi ro & câu hỏi còn mở

- **Bản quyền**: nội dung là bản biên soạn lại chứ không copy nguyên gốc, giảm rủi ro nhưng không loại bỏ hoàn toàn — bản phối lại của một tác phẩm gốc còn bản quyền vẫn có thể cần quyền phái sinh tuỳ tác phẩm/khu vực. Nên rà lại danh sách tác phẩm dự kiến đăng trước khi launch thật.
- **PayPal-only, USD-only**: có thể gây rào cản với người dùng Việt Nam quen chuyển khoản/ví nội địa — cân nhắc bổ sung phương thức thanh toán khác ở phase sau.
- **Founder một mình vừa code vừa biên soạn nội dung** — tốc độ ra sheet mới có thể là nút thắt cổ chai hơn là kỹ thuật; đáng cân nhắc quy trình biên soạn nội dung song song với phát triển sản phẩm.

## Tầm nhìn

Nếu thành công, Piano Daily trở thành một thư viện sheet piano biên soạn riêng, có thương hiệu chất lượng (khác với các site tổng hợp/re-host), với nguồn thu ổn định từ bán file kết hợp quảng cáo, đủ để founder đầu tư thời gian biên soạn thêm nội dung, mở rộng sang các thể loại/nhạc cụ khác hoặc các thị trường/ngôn ngữ khác khi đã chứng minh được mô hình.

---
*Đặc tả kỹ thuật đầy đủ (tech stack, schema database, danh sách trang/API, chi tiết luồng thanh toán) được lưu tại `addendum.md` trong cùng thư mục — dùng làm input cho Architecture và PRD.*
