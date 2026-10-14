# Thanh toán gói bằng VietQR qua SePay

Gói thuê bao cho khách trong nước trả bằng chuyển khoản VietQR. [SePay](https://sepay.vn) theo dõi tài khoản ngân hàng của bạn và gọi webhook về API khi có tiền vào; API tự kích hoạt gói. Toàn bộ cấu hình là biến môi trường **tuỳ chọn**: chưa cấu hình thì VietQR tự ẩn trên web (PayPal vẫn dùng được).

## 1. Chuẩn bị tài khoản (làm một lần, bạn tự làm)

1. Đăng ký tài khoản tại sepay.vn và **liên kết tài khoản ngân hàng nhận tiền** (làm theo hướng dẫn của SePay trong mục Ngân hàng).
2. Ghi lại: số tài khoản, **mã ngắn của ngân hàng** theo SePay/VietQR (ví dụ `Vietcombank`, `MBBank`, `ACB`; danh sách: https://vietqr.app/banks.json).
3. Trong SePay → **Cấu hình công ty / Cấu hình chung → Cấu trúc mã thanh toán**, đặt **tiền tố `PS`** (hoặc để SePay nhận dạng mã trong nội dung). Hệ thống dùng nội dung chuyển khoản dạng `PSABC234` (6 ký tự chữ/số sau `PS`); khi đối soát nó tự chuẩn hoá nội dung (chữ hoa, bỏ ký tự đặc biệt) nên không phụ thuộc cách ngân hàng định dạng.

## 2. Tạo webhook trên SePay

1. SePay → **Tích hợp WebHooks → Thêm webhooks**.
2. URL: `https://api.<domain-của-bạn>/webhooks/sepay` (ví dụ `https://api.sheetpiano.online/webhooks/sepay`).
3. Kiểu chứng thực: **API Key**. Đặt một khoá ngẫu nhiên dài (ví dụ `openssl rand -hex 32`); SePay sẽ gửi header `Authorization: Apikey <khoá>`.
4. Sự kiện: chỉ cần giao dịch **có tiền vào**. Đừng bật tuỳ chọn "chỉ gửi khi nhận dạng được mã thanh toán" (nếu có): hệ thống tự dò mã trong nội dung nên vẫn nhận được khi SePay không nhận dạng mã.
5. Lưu ý SePay yêu cầu phản hồi trong 30 giây với `{"success": true}`; API đã trả đúng như vậy cho cả giao dịch không liên quan. Lỗi hệ thống trả 5xx để SePay gửi lại (tối đa 7 lần trong 5 giờ).

## 3. Biến môi trường (API, file `.env` trên VPS)

| Biến | Ý nghĩa |
|---|---|
| `SEPAY_API_KEY` | Khoá bạn đặt ở bước 2 (cùng giá trị với webhook) |
| `SEPAY_BANK_ACCOUNT` | Số tài khoản nhận tiền |
| `SEPAY_BANK_NAME` | Mã ngắn ngân hàng (xem bước 1) |
| `SEPAY_ACCOUNT_HOLDER` | (tuỳ chọn) Tên chủ tài khoản hiển thị cho khách |

Sau khi đặt đủ ba biến đầu, khởi động lại API. `GET /plans` trả `vietqrEnabled=true` và modal mua gói của khách tiếng Việt có lựa chọn VietQR (web cache trang giá tối đa 10 phút, sửa gói/cài đặt trong admin sẽ làm mới ngay).

## 4. Cách hệ thống đối soát

- Khách chọn gói → API tạo `subscription_payments` (VIETQR, VND, mã `PS-XXXXXX`) và trả QR với nội dung `PSXXXXXX`. Mở lại trong 24 giờ thì dùng lại đúng mã.
- Webhook về: dò mã `PS` + 6 ký tự trong `code` rồi `content`.
  - **Đủ tiền**: kích hoạt gói. **Thừa tiền**: kích hoạt và gửi cảnh báo để bạn hoàn phần thừa. **Thiếu tiền**: không kích hoạt, đánh dấu "Cần xem xét" ở admin và gửi cảnh báo.
  - Không thấy mã / giao dịch ra / mã không thuộc gói: bỏ qua.
  - Cùng một giao dịch SePay gửi lại chỉ kích hoạt một lần.
- Khách ghi sai nội dung: vào admin → **Gói thuê bao → Thanh toán gói gần đây**, kiểm tra sao kê rồi bấm **Xác nhận đã nhận tiền** ở dòng VietQR đang chờ.
- Hoàn tiền VietQR làm thủ công (chuyển khoản trả khách). Việc thu hồi gói sau hoàn tiền chưa tự động.

## 5. Thử nghiệm

- Không cần tài khoản SePay để chạy test: `apps/api/test/integration/vietqr-payments.spec.ts` gửi webhook giả.
- Khi đã có tài khoản: chuyển thật một số tiền nhỏ với nội dung `PSXXXXXX` của một thanh toán thử (gói giá thấp), kiểm tra gói được kích hoạt, rồi tắt/xoá gói thử. SePay cũng có chức năng gửi thử webhook trong trang cấu hình.
- Ảnh QR dựng từ `https://qr.sepay.vn/img?acc=…&bank=…&amount=…&des=…`; địa chỉ nằm ở hằng số `SEPAY_QR_BASE` (`apps/api/src/modules/billing/sepay.ts`) để đổi một chỗ nếu SePay đổi. Hãy mở thử ảnh QR thật và quét bằng app ngân hàng.
