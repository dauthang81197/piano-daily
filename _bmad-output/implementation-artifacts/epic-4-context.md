# Epic 4 Context: Founder vận hành kinh doanh

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Founder quản lý đơn hàng (xem, gửi lại email, gia hạn token, hoàn tiền), cấu hình site, quản lý quảng cáo và theo dõi doanh thu cùng lượt dùng qua dashboard, tất cả mà không cần đụng code hay truy vấn DB.

## Stories

- Story 4.1: Danh sách và chi tiết đơn hàng
- Story 4.2: Gửi lại email và gia hạn token
- Story 4.3: Hoàn tiền từ admin
- Story 4.4: Cài đặt site
- Story 4.5: Quản lý vị trí quảng cáo
- Story 4.6: Hiển thị quảng cáo trên site công khai
- Story 4.7: Dashboard doanh thu và lượt dùng

## Requirements & Constraints

- Admin xem/lọc đơn (trạng thái, khoảng ngày, email một phần), xem chi tiết kèm lịch sử tải; đơn `review_required` phải nổi bật và có bộ lọc riêng.
- Founder có thể hoàn tiền, gửi lại email link tải, gia hạn token cho đơn PAID; đơn không PAID thì từ chối rõ ràng.
- Cài đặt site: tên, logo, SEO mặc định, link YouTube, bật/tắt thanh toán, mặc định hạn/lượt token. Giá trị không hợp lệ (<= 0, không phải số) bị từ chối.
- Quảng cáo bật/tắt theo vị trí không cần deploy; vị trí tắt không chiếm layout.
- Dashboard: số Sheet, lượt xem, lượt tải (free + paid) theo Level; doanh thu theo ngày/tháng; số đơn; top Sheet bán chạy/xem nhiều; Sheet cập nhật gần đây.
- Doanh thu = tổng `amount_cents` theo `paid_at`, trừ Order có `refunded_at`; ngày tính theo `REPORT_TZ=Asia/Ho_Chi_Minh`; cần test với dữ liệu mẫu. Tiền hiển thị USD từ cents, không sai số làm tròn.

## Technical Decisions

- Mỗi bảng có đúng một module chủ; module khác chỉ gọi service public. Ngoại lệ: `analytics` chỉ đọc, không sở hữu bảng. Module liên quan: `commerce` (Order, token, refund), `ads` (AdSlot), `settings` (SiteSetting), `notify` (EmailPort), `media` (logo upload vùng public).
- Chỉ `commerce.OrderService` đổi `Order.status` theo bảng chuyển trạng thái trong shared. Refund (admin hoặc webhook) đi qua `PaymentProvider.refund()` có điều kiện: set REFUNDED + `refunded_at` + vô hiệu token. Admin và webhook `PAYMENT.CAPTURE.REFUNDED` phải idempotent (chuyển một lần, không trừ doanh thu hai lần). PayPal từ chối thì Order giữ PAID.
- Gia hạn/vô hiệu token chỉ qua `commerce.TokenService`; hạn/lượt được chụp vào token lúc phát, nên đổi mặc định chỉ áp cho token mới.
- Email gửi qua `notify.EmailPort`, best-effort sau commit; thành công thì cập nhật `email_sent_at`, lỗi hiện `form-error` với lý do.
- `payments_enabled=false` chỉ chặn `create-order` (`PAYMENTS_DISABLED`) và đưa nút tải Sheet trả phí về trạng thái không khả dụng; token đã phát vẫn tải được.
- Tiền là Int cents USD ở DB/API/shared. DTO, enum, mã lỗi, cache tag lấy từ `packages/shared` (zod). Response list: `{items, page, pageSize, total}`; lỗi: `{error:{code,message,details?}}`.
- Cache: sau khi sửa ads/settings, API revalidate tag `ads`/`settings` (tên tag chỉ sinh bằng hàm trong shared); header, footer, meta mặc định cập nhật ngay.
- `AdSlot(id, position HEADER|SIDEBAR_LEFT|SIDEBAR_RIGHT|IN_LIST|STICKY_BOTTOM|IN_CONTENT, html_code | image + link, is_active)`; `GET /ads` là `@Public` và chỉ trả slot active. Chỉ SUPER_ADMIN được nhập `html_code`. Route admin mặc định deny-by-default (JWT guard global); admin app chỉ fetch client-side.
- `html_code` chỉ render trong `<iframe sandbox="allow-scripts allow-popups" srcdoc>`, không `allow-same-origin`, không bao giờ chèn thẳng vào DOM; script quảng cáo không được truy cập document chứa PayPal SDK. Form AdSlot có preview trong iframe sandbox.
- Lượt tải tính từ `DownloadLog` (không có cột `download_count`). Thời gian lưu UTC `timestamptz`, hiển thị admin theo `REPORT_TZ`.
- Order code dạng `PD-` + 6 ký tự base32.

## UX & Interaction Patterns

- Bảng admin: tìm kiếm và bộ lọc cố định, phân trang, click hàng mở chi tiết.
- Nút Hoàn tiền và Gia hạn token dùng màu brass; hoàn tiền xác nhận ngay trong trang; lỗi dùng `form-error` (override shadcn/ui).
- `ad-slot`: nền trung tính, viền dashed, không dùng màu thương hiệu; `IN_LIST` đặt ở vị trí cố định ngoài lưới Sheet (ví dụ dưới lưới, trên phân trang), không chèn giữa các thẻ.

## Cross-Story Dependencies

- 4.2 và 4.3 dựa trên trang chi tiết đơn của 4.1; 4.3 cùng chia sẻ logic refund với webhook PayPal (Epic 3).
- 4.5 tạo AdSlot và `GET /ads`, 4.6 tiêu thụ chúng ở web công khai.
- 4.7 phụ thuộc số liệu hoàn tiền (4.3) và DownloadLog (Epic 3).
- Dựa trên Epic 3: Order/DownloadToken/DownloadLog, `TokenService`, webhook, `PaymentProvider`; `settings` đã seed token mặc định và `payments_enabled`, Epic 4 chỉ thêm UI chỉnh sửa (4.4). Logo upload dùng `media` từ Epic 1.
