# Epic 3 Context: Tải file và mua qua PayPal

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Founder đặt giá (lẻ theo PDF/MIDI/MP3, Bundle, Miễn phí, đặt hàng loạt). Người dùng tải ngay Sheet miễn phí, hoặc mua qua modal PayPal, nhận trang tải, email và link tải lại. Webhook PayPal đồng bộ trạng thái idempotent. Đây là epic rủi ro cao nhất: mọi luồng tiền phải kiểm thử bằng PayPal sandbox.

## Stories

- Story 3.1: Đặt giá Sheet và đánh dấu Miễn phí
- Story 3.2: Tải ngay Sheet miễn phí
- Story 3.3: Tạo đơn hàng PayPal phía server
- Story 3.4: Capture thanh toán và cấp DownloadToken idempotent
- Story 3.5: Tải file đã mua qua token và trang tải
- Story 3.6: Modal thanh toán trên trang chi tiết
- Story 3.7: Email link tải và mua lại cùng email
- Story 3.8: Webhook PayPal
- Story 3.9: Tự huỷ đơn PENDING quá hạn
- Story 3.10: Đặt giá hàng loạt

## Requirements & Constraints

- Giá luôn tính lại phía server từ dữ liệu Sheet hiện tại; không tin giá client. Client gửi `expectedTotalCents`, lệch thì `PRICE_CHANGED`.
- Tiền là số nguyên cents USD (`*_cents`) ở mọi lớp, không float; chỉ USD, hiển thị USD cho mọi locale.
- Order chỉ PAID khi PayPal `COMPLETED` và amount/currency khớp; lệch thì `review_required`.
- File gốc không có URL public; chỉ signed URL private TTL 5 phút. Endpoint tải có rate limit theo `getClientIp()`.
- Nghe/xem/video luôn miễn phí, không sau bất kỳ bước xác thực/thanh toán nào.
- Nút Download chỉ hiện định dạng thực sự có (ẩn hẳn, không disable). Nút Download/mua dùng brass (`button-download`).
- Email best-effort: lỗi gửi không rollback thanh toán; không log email đầy đủ, token, secret, IP thô.
- Token mặc định 7 ngày / 5 lượt (settings); số liệu tải lấy từ `DownloadLog` (free lẫn paid).

## Technical Decisions

- Định giá một nguồn: `PricingService.quote()`. Type mua được = có file hiện hành và giá > 0. BUNDLE cần ≥ 2 type mua được và gồm mọi type mua được. Sheet `is_free` trả quote "free". Publish Sheet không free phải có ≥ 1 type mua được.
- Máy trạng thái Order trong `packages/shared`; chỉ `commerce.OrderService` đổi `Order.status`. Chuyển hợp lệ: PENDING→PAID|FAILED|CANCELLED, CANCELLED|FAILED→PAID, PAID→REFUNDED. `fulfil()` idempotent bằng UPDATE có điều kiện trong cùng transaction với tạo token.
- PayPal sau port `PaymentProvider` (nơi duy nhất import SDK); `PAYPAL_MODE` chọn sandbox/live. Webhook verify bằng REST với raw body + `PAYPAL_WEBHOOK_ID`, insert `PaymentEvent` UNIQUE trước khi xử lý.
- Một đường tải: `GET /files/:sheetId/:fileType/download` (free) và `GET /downloads/:token/:fileType` (UPDATE nguyên tử `used<max`, ghi DownloadLog, 302). `payments_enabled=false` chỉ chặn `create-order`.
- Mỗi bảng có đúng một module chủ (catalog, commerce, settings, notify…); Prisma raw SQL chỉ trong repository; migration viết tay; DTO/enum/mã lỗi ở `packages/shared`, có test enum shared khớp Prisma.
- Thay đổi giá/miễn phí phải revalidate cache tag của Sheet (CacheInvalidator); giá lấy bằng fetch `no-store`.
- Email qua `notify.EmailPort` (Resend), gửi sau commit.
- Quy ước: UUIDv7, `order_code` dạng `PD-XXXXXX`, lỗi `{error:{code,message}}`, list `{items,page,pageSize,total}`.

## UX & Interaction Patterns

- `payment-modal`: nền trắng, fade, toàn màn hình `< md`; lỗi dùng `form-error` nêu lý do + việc cần làm, giữ nguyên lựa chọn; không đóng bằng click nền khi popup PayPal mở; đóng modal không huỷ Order PENDING.
- Trang `/[locale]/downloads/[token]` (`noindex`, `no-store`); token hết hiệu lực: "Link tải đã hết hiệu lực" kèm cách liên hệ.
- Microcopy song ngữ trang trọng, không emoji.

## Cross-Story Dependencies

- 3.1 (quote) là nền cho 3.3, 3.6, 3.10; 3.2 cần DownloadLog; 3.3 → 3.4 → 3.5/3.7/3.8; 3.9 và 3.8 dùng chung `fulfil()`.
- Settings (`payments_enabled`, token mặc định) được seed; UI chỉnh thuộc Epic 4.
- Story 1.8 (publish/GC) và Story 2.3 (revalidate) có hook được nối thêm ở epic này.
