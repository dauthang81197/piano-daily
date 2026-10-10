---
title: 'Story 4.2 — Gửi lại email và gia hạn token'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '18ab78a3c41af11b56d43dd2daa4f0c38fd72948'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-1-danh-sach-va-chi-tiet-don-hang.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người mua mất email hoặc hết hạn/lượt tải phải liên hệ founder, nhưng admin chưa có thao tác gửi lại link hay gia hạn, nên founder chỉ còn cách sửa DB.

**Approach:** Thêm hai thao tác trên chi tiết đơn ở admin: "Gửi lại email" (qua `notify.EmailPort`, báo lý do lỗi cụ thể) và "Gia hạn" token (thêm ngày và/hoặc lượt tải qua `TokenService` mới của `commerce`), chỉ cho đơn PAID.

## Boundaries & Constraints

**Always:** Hai route admin trong `commerce`: `POST admin/orders/:id/resend-email` và `POST admin/orders/:id/extend-token` (body `{ addDays?, addDownloads? }`, số nguyên dương, ít nhất một trường, `addDays` ≤ 3650, `addDownloads` ≤ 1000; giá trị cuối vẫn trong giới hạn INT4 và ngày hợp lệ), cả hai trả chi tiết đơn đã làm mới (cùng dạng `GET admin/orders/:id`). Đơn không PAID (REFUNDED, PENDING...) -> 409 mã `ORDER_NOT_PAID` kèm thông điệp tiếng Việt rõ ràng (thêm mã vào `ErrorCode` và bảng `DEFAULT_MESSAGE` của `http-exception.filter.ts`); đơn không tồn tại -> 404; token đã `revokedAt` -> từ chối, không bao giờ bỏ vô hiệu hoá. Gia hạn chỉ đi qua `TokenService` (mới, đăng ký trong `commerce.module.ts`) và cập nhật nguyên tử bằng một UPDATE có điều kiện đơn PAID và `revoked_at IS NULL`: `expires_at = greatest(now(), expires_at) + addDays` (khi có `addDays`), `max_downloads = max_downloads + addDownloads` (khi có `addDownloads`); không đổi `used_downloads`. Gửi lại email: lấy token hiện có, dựng link và email bằng đúng logic của `OrderService` (tách/ dùng chung `deliverDownloadEmail`/`buildDownloadEmail`, không sao chép), gửi qua `EMAIL_PORT`; thành công thì ghi đè `email_sent_at` bằng thời điểm hiện tại (thêm hàm repository ghi vô điều kiện, không đổi `setEmailSentAt` cũ); lỗi hoặc adapter chưa cấu hình -> 502/503 với thông điệp lý do cụ thể, `email_sent_at` giữ nguyên. Thao tác admin không bị giới hạn 3 lần/giờ của người mua. Log chỉ mã đơn và tên lỗi, không email, không token. UI: hai nút trong chi tiết đơn; "Gia hạn" dùng màu brass (`variant="secondary"`, token `--secondary`), có ô nhập số ngày và số lượt; lỗi hiện qua `FormError`; thành công cập nhật ngay `emailSentAt` và thẻ token; đơn không PAID thì ẩn hoặc vô hiệu hoá hai nút kèm lý do.

**Never:** Không sửa `consume`, `fulfil`, `revokeByOrder`; không ghi `download_tokens` ngoài `TokenService`/`DownloadTokenRepository`; không trả token bí mật trong response admin; không hoàn tiền (Story 4.3); không đổi trạng thái đơn.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gửi lại email | PAID, token còn | Email gửi; `email_sent_at` cập nhật; trả chi tiết | N/A |
| Email lỗi | `send` ném hoặc trả false | `email_sent_at` giữ nguyên | 502/503 kèm lý do; UI hiện qua `FormError` |
| Gia hạn token hết hạn | PAID, hết hạn, `addDays=7` | Hạn mới = now + 7 ngày; người mua tải được ngay | N/A |
| Gia hạn token hết lượt | PAID, used=max, `addDownloads=3` | `max` tăng 3, `used` giữ nguyên | N/A |
| Gia hạn cả hai | `addDays=5, addDownloads=2` | Cả hai thay đổi trong một UPDATE | N/A |
| Không có gì để thêm | Body rỗng/0/âm/quá cận | Không ghi | 400 |
| Đơn REFUNDED / PENDING | Bất kỳ thao tác | Không gửi, không ghi | 409 `ORDER_NOT_PAID` |
| Token đã vô hiệu | PAID nhưng `revokedAt` có | Không ghi | 409 thông điệp rõ |
| Đơn lạ / chưa đăng nhập | id không có / không bearer | N/A | 404 / 401 |

</frozen-after-approval>

## Code Map

- `apps/api/src/modules/commerce/download-token.repository.ts` -- chỉ writer của `download_tokens`; thêm `extend(orderId, {addDays, addDownloads})` bằng UPDATE có điều kiện (SQL thô cho `greatest(now(), expires_at)`); không đổi `consume`/`revokeByOrder`; `tokenStatus()` (~L38) tái dùng.
- `apps/api/src/modules/commerce/token.service.ts` (mới) -- `TokenService.extend(orderId, body)`; đăng ký trong `commerce.module.ts`.
- `apps/api/src/modules/commerce/order.service.ts` -- `deliverDownloadEmail` (private) dựng link `${SITE_URL ?? CORS_WEB_ORIGIN}/${locale}/downloads/${token}` và gọi `EMAIL_PORT`; tách thành phương thức dùng lại được cho `resend` nhưng nuốt lỗi chỉ ở luồng mua cũ; throttle 3/giờ của người mua (`consumeResendQuota`) giữ nguyên, admin không đi qua.
- `apps/api/src/modules/commerce/order.repository.ts` -- `setEmailSentAt` (L87) chỉ ghi khi null; thêm hàm ghi đè; `toLocale`.
- `apps/api/src/modules/commerce/admin-orders.service.ts`, `admin-orders.controller.ts` -- thêm `resendEmail`, `extendToken`, trả `get(id)`; mẫu `@Body({ schema })` ở `catalog/sheets.controller.ts`.
- `packages/shared/src/order.ts`, `errors.ts` -- `extendTokenBodySchema`, mã `ORDER_NOT_PAID`; `apps/api/src/common/http-exception.filter.ts` -- thông điệp mặc định (bảng exhaustive).
- `apps/admin/src/components/orders/order-detail.tsx`, `apps/admin/src/lib/api/orders.ts` -- nút, form gia hạn, `resendEmail`/`extendToken` (mẫu `sheets.ts` L26-31); `ui/button.tsx` variant `secondary` đã là brass; `FormError`.
- Test: unit service/token, integration (Postgres: gia hạn cập nhật ngay trang tải qua `paid-downloads`, REFUNDED bị từ chối, email lỗi giữ `email_sent_at`), admin `orders.test.tsx`, shared `order.spec.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared` + `errors.ts` + filter -- schema gia hạn, mã `ORDER_NOT_PAID`, test
- [x] `download-token.repository.ts`, `token.service.ts`, `commerce.module.ts` -- gia hạn nguyên tử qua `TokenService`
- [x] `order.service.ts`, `order.repository.ts`, `admin-orders.*` -- gửi lại email lộ lý do lỗi, ghi đè `email_sent_at`, hai route
- [x] `apps/admin` -- nút Gửi lại email, form Gia hạn (brass), `FormError`, cập nhật ngay
- [x] Test đơn vị, integration, admin theo ma trận

**Acceptance Criteria:**
- Given Order PAID, when bấm "Gửi lại email", then email gửi qua `EmailPort`, `email_sent_at` cập nhật; lỗi thì `FormError` nêu lý do cụ thể.
- Given Order PAID có token hết hạn hoặc hết lượt, when gia hạn, then thay đổi chỉ qua `TokenService` và trang tải của người mua phản ánh ngay hạn/lượt mới; nút gia hạn màu brass.
- Given Order không PAID, when thử gửi lại hoặc gia hạn, then bị từ chối với thông báo rõ ràng.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| Finding | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Ghi `email_sent_at` lỗi sau khi email đã gửi làm admin thấy lỗi, dễ gửi trùng | medium | patch (đã sửa) | `resendDownloadEmail` bọc ghi trong try/catch, chỉ log mã đơn và tên lỗi |
| Gửi lại email cho token hết hạn/hết lượt gửi link chết, UI vẫn báo thành công | low | defer | Spec không yêu cầu cảnh báo; admin có thể gia hạn rồi gửi lại |
| Không có test cho biên năm 9999 và không có assertion nội dung log | low | defer | Khó xảy ra; rủi ro chỉ khi sửa dòng log |
| Race hoàn tiền giữa kiểm tra và gửi / ghi mốc gửi | low | reject | Story 4.3 sẽ vô hiệu token khi hoàn tiền nên link vô dụng; cửa sổ rất hẹp |
| `path: 'addDays'` khi `addDownloads` tràn; helper lỗi đặt trong token.service | low | reject | Chỉ cosmetic, UI chỉ hiện message |
| Tham số null `::int` trong Prisma.sql | false | reject | Có ép kiểu tường minh nên Postgres suy được kiểu; cùng kiểu với `consume` |
| `extend` với cả hai null trả true | false | reject | `TokenService` đã chặn trước; không có caller khác |
| Audit trail, cooldown gửi trùng, xác nhận trước khi gia hạn, preview hạn mới | low | reject | Ngoài intent của spec |
| `Number()` nhận `1e2`, thiếu vài test UI (noToken, in-flight, lỗi extend) | low | reject | Chỉ founder dùng; hành vi chính đã có test |
| Race đổi order.id khi request đang bay trong UI | low | reject | Chi tiết đơn tải lại theo id, thao tác tức thời |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test shared, admin, API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Ở admin: mở đơn PAID, gửi lại email (kiểm tra hộp thư), gia hạn token hết hạn rồi mở link tải; mở đơn REFUNDED và thấy hai nút bị chặn.
