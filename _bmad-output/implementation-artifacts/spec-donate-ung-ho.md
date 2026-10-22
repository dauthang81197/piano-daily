---
title: 'Nút Ủng hộ trên header: hiện mã QR donate và danh sách người ủng hộ (admin nhập tay)'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_commit: '8e017ed'
route: 'dispatch'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-admin-import-sheet-hang-loat.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Site chưa có chỗ để người dùng ủng hộ dự án, và chưa có nơi ghi nhận những người đã ủng hộ.

**Approach:** Thêm nút **Ủng hộ** trên header (desktop và menu mobile). Bấm vào mở một hộp thoại (dialog) có: ảnh **mã QR** chuyển khoản/donate, lời kêu gọi ngắn, và **danh sách người ủng hộ**. Danh sách do admin nhập tay ở trang admin mới **Người ủng hộ** (thêm / sửa / ẩn / xoá). Ảnh QR là file tĩnh do chủ dự án gửi, đặt vào `apps/web/public/` (chưa có ảnh thì làm placeholder và báo lại để thay).

## Boundaries & Constraints

**Always:**
- Bảng mới `donors`: `id`, `name` (bắt buộc, ≤ 80), `amount` (số nguyên VND, tuỳ chọn, null = không công khai số tiền), `message` (≤ 200, tuỳ chọn), `donatedAt` (ngày ủng hộ, mặc định hôm nay), `isVisible` (mặc định true), `createdAt`. Migration viết tay, kiểm bằng `migrate diff --exit-code`.
- API công khai `GET /donors` (không cần đăng nhập, chỉ trả bản ghi `isVisible`, sắp xếp mới nhất trước, tối đa 200; chỉ trả `name`, `amount`, `message`, `donatedAt`). Admin CRUD dưới `/admin/donors*` (guard JWT global) với zod schema trong `packages/shared`. Không log nội dung tên/lời nhắn.
- Web: nút "Ủng hộ" (biểu tượng trái tim) trong header, cùng cụm với ngôn ngữ/đăng nhập, và có trong menu mobile. Dialog dùng thẻ `<dialog>`/focus trap sẵn có của dự án nếu có, nếu không thì `<dialog>` native: Esc đóng, trả focus về nút, `aria-labelledby`, không cuộn nền. Danh sách tải khi mở dialog (không chặn render header), có trạng thái đang tải / lỗi / trống. Chữ vi + en (`messages/{vi,en}.json`), dùng token Tailwind sẵn có, không tràn ngang ở 390px, độ tương phản AA. Tên/lời nhắn render dạng text (không HTML).
- Admin: mục "Người ủng hộ" trong sidebar, trang danh sách + form thêm/sửa, nút ẩn/hiện và xoá có xác nhận. Chữ tiếng Việt.
- Số tiền hiển thị theo định dạng VND (`1.000.000 ₫`) theo locale.

**Never:** Xử lý thanh toán hay xác nhận giao dịch tự động; lưu thông tin ngân hàng/thẻ trong DB; thêm thư viện mới; đổi hợp đồng API hiện có.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Mở dialog | Bấm "Ủng hộ" | Thấy QR + lời kêu gọi + danh sách (mới nhất trước) | — |
| Danh sách trống | Chưa nhập ai | Hiện lời cảm ơn thay cho danh sách | — |
| API lỗi | `/donors` 5xx | QR vẫn hiện; khu danh sách báo lỗi, có nút thử lại | — |
| Ẩn một người | Admin tắt hiển thị | Biến mất khỏi danh sách công khai, vẫn còn trong admin | — |
| Không nhập số tiền | `amount` null | Chỉ hiện tên (và lời nhắn nếu có) | — |
| Dữ liệu sai | Tên rỗng / số tiền âm | 400 `VALIDATION_FAILED` kèm chi tiết trường | Form báo lỗi từng trường |
| Đóng dialog | Esc / bấm nền / nút Đóng | Đóng, focus về nút Ủng hộ | — |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration `donors`.
- `packages/shared/src/donor.ts` (+spec): schema tạo/sửa, DTO công khai và admin.
- `apps/api/src/modules/donors/*`: service, controller công khai + admin, module đăng ký trong `AppModule`.
- `apps/web/src/components/layout/donate-button.tsx` + dialog, gắn vào `header.tsx` và `mobile-menu.tsx`; `apps/web/public/donate-qr.*`.
- `apps/admin/src/app/(admin)/donors/*`, `components/donors/*`, sidebar.
- Test: unit shared, integration API (công khai chỉ trả bản ghi hiện, CRUD admin, 401 khi chưa đăng nhập), component web (mở/đóng, focus, trống/lỗi), component admin.

## Verification

**Commands:** `pnpm lint && pnpm typecheck`; test api (unit + integration), web, admin, shared; `prisma migrate diff --exit-code`; Playwright chụp dialog ở 1280px và 390px.

**Manual checks:** thay ảnh QR thật khi chủ dự án gửi; quét thử QR bằng app ngân hàng.

## Ghi chú triển khai

- Ảnh QR hiện là placeholder `apps/web/public/donate-qr.svg`; thay bằng ảnh thật khi nhận (đổi hằng `DONATE_QR_SRC` nếu đổi tên/đuôi).
- Dữ liệu sai trả 400 `VALIDATION_FAILED` (đúng quy ước API hiện có), không phải 422.
- Menu mobile: Esc khi hộp thoại đang mở chỉ đóng hộp thoại, giữ menu.
- Kiểm chứng: shared 14 test, API integration 8 test, admin 7 test, web 6 test; migration `migrate diff` không lệch; chạy tay web + API thật ở 1280px và 390px, không tràn ngang, Esc trả focus về nút.
