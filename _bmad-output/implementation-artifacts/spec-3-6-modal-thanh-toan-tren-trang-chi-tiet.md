---
title: 'Story 3.6 — Modal thanh toán trên trang chi tiết'
type: 'feature'
created: '2026-10-09'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '8c5bf7c21322a320f6777c32019b1020ba91c279'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-work.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sheet không miễn phí chưa có cách mua trên web: trang chi tiết không hiện nút Download, dù API tạo đơn và capture đã sẵn (Story 3.3, 3.4) và trang tải đã có (Story 3.5).

**Approach:** Trang chi tiết Sheet không free hiện các nút Download theo `downloadTypes`; bấm nút mở modal thanh toán: lấy báo giá `no-store`, chọn file/Bundle, nhập email, trả bằng nút PayPal (`@paypal/react-paypal-js`), thành công thì chuyển tới `/[locale]/downloads/[token]`. `payments_enabled` đi kèm báo giá để tắt nút khi thanh toán đóng.

## Boundaries & Constraints

**Always:** `quoteSchema` thêm `paymentsEnabled` (`default(true)` cho phản hồi cũ), `GET /sheets/:id/quote` đọc từ `SettingsService`, vẫn `no-store`; `create-order` vẫn chặn `PAYMENTS_DISABLED` làm lớp cuối. Nút Download chỉ cho type có trong `downloadTypes` và có giá trong báo giá, ẩn hẳn type còn lại; dùng `downloadButtonClass` (brass). Trang lấy báo giá phía client khi mount để biết `paymentsEnabled`; `false` → nút không khả dụng (`aria-disabled`) kèm chú thích, không mở modal. Mở modal: fade nhẹ (không trượt/nảy), fetch lại báo giá `no-store`, hiện tên bài, file đã chọn, giá USD (`formatUsd`), lựa chọn Bundle (nếu có) kèm giá, ô email có `<label>`. Mặc định chỉ chọn file của nút vừa bấm; Bundle chỉ khi người dùng chọn; tổng hiển thị tính từ báo giá. Email hợp lệ (định dạng) mới bật nút PayPal. `createOrder` gọi `POST /payments/paypal/create-order` kèm `expectedTotalCents`; `onApprove` gọi `capture-order` rồi `router.push('/downloads/{token}')` (locale-aware). Đang xử lý: nút PayPal disable kèm spinner, không tạo trùng đơn. Lỗi hiển thị trong khối `form-error` (nền `error-container`, chữ `error`, có biểu tượng) nêu lý do và việc cần làm: `PAYMENT_DECLINED`, `PRICE_CHANGED` (cập nhật giá mới từ `details` trước khi cho thử lại), lỗi mạng, popup bị đóng/huỷ; giữ nguyên lựa chọn và email, thử lại được ngay. Overlay click không đóng modal khi popup PayPal đang mở; nút X đóng modal không huỷ Order PENDING. `< md` modal toàn màn hình; focus vào modal, trả focus về nút gọi khi đóng, Esc đóng khi không đang xử lý. `NEXT_PUBLIC_PAYPAL_CLIENT_ID` truyền qua Dockerfile/compose/CI/.env.example; CSP cho phép ảnh PayPal. Microcopy song ngữ vi/en trang trọng, không emoji.

**Never:** Không tạo tài khoản/đăng nhập, không nút PayPal tuỳ biến style, không email (Story 3.7), không webhook, không UI admin. Không tin giá client (server tính lại). Không đưa client secret PayPal vào web.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mua lẻ | Sheet không free, bấm "Download PDF", email hợp lệ | Modal chọn sẵn PDF, giá PDF; PayPal → create → capture → chuyển trang tải | N/A |
| Chọn Bundle | Có `bundle`, người dùng chọn | `bundle: true`, tổng = giá Bundle | N/A |
| Giá đổi | API 409 `PRICE_CHANGED` + quote | Cập nhật giá mới, báo lý do, giữ lựa chọn/email | `form-error` |
| Bị từ chối | `PAYMENT_DECLINED` | Báo thẻ bị từ chối + việc cần làm, thử lại ngay | `form-error` |
| Lỗi mạng / popup đóng | fetch lỗi / người mua đóng popup | Báo thử lại, không mất lựa chọn | `form-error` |
| Đang xử lý | Đã bấm PayPal | Nút disable + spinner, không đơn thứ hai | N/A |
| Tắt thanh toán | `paymentsEnabled=false` | Nút `aria-disabled` + chú thích, không mở modal | N/A |
| Click overlay | Popup PayPal đang mở | Modal không đóng | N/A |
| Sheet free / preview | `isFree` hoặc route preview | Giữ hành vi hiện có, không modal | N/A |

</frozen-after-approval>

## Code Map

- `packages/shared/src/pricing.ts` -- `quoteSchema` + `paymentsEnabled`; `apps/api/src/modules/catalog/public-sheets.controller.ts` (~L95-101) và `catalog` cần đọc `SettingsService` qua cổng (tránh vòng phụ thuộc `catalog`↔`settings`); test `pricing.spec`, quote integration.
- `apps/web/src/lib/public-api.ts` (mới) -- `ApiError`/`toApiError` mô phỏng `apps/admin/src/lib/api/http.ts`, `fetchQuote`, `createPaypalOrder`, `capturePaypalOrder` (`credentials:'omit'`, `publicApiUrl()`); mẫu `components/sheet/view-beacon.tsx`.
- `apps/web/src/components/sheet/download-buttons.tsx`, `sheet-detail.tsx` -- nhánh Sheet không free: component client `PurchaseButtons`; `availableDownloads` hiện chỉ trả type cho Sheet free.
- `apps/web/src/components/payment/payment-modal.tsx` (+ `form-error.tsx`, test) -- modal `<dialog>`/role dialog, `PayPalScriptProvider`+`PayPalButtons` (`currency:'USD'`, `intent:'capture'`); `apps/web/package.json` thêm `@paypal/react-paypal-js`.
- `apps/web/src/messages/vi.json`, `en.json` -- namespace `Payment`; `lib/csp.ts` + `csp.test.ts` (`img-src` PayPal); `lib/public-env.ts` (`paypalClientId()`).
- `apps/web/Dockerfile`, `docker-compose.yml`, `.github/workflows/ci-cd.yml`, `.env.example`, `docs/cicd.md` -- `NEXT_PUBLIC_PAYPAL_CLIENT_ID`.
- Test: `sheet-detail.test.tsx` (cập nhật các test "nút tải" của Sheet không free), `payment-modal.test.tsx` (mock fetch và PayPal SDK), `public-api.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `shared` + `api` -- `paymentsEnabled` trong quote; test
- [x] `web/lib` -- `public-api.ts`, `public-env.ts`; test
- [x] `web/components` -- `PurchaseButtons`, `PaymentModal`, `FormError`; nối vào `sheet-detail.tsx`; test theo ma trận I/O
- [x] `web` -- dependency, messages vi/en, CSP, env/Dockerfile/compose/CI/docs
- [x] README mục Story 3.6

**Acceptance Criteria:**
- Given Sheet không free và thanh toán bật, when bấm Download PDF, then modal chỉ chọn PDF và hiện đúng giá từ báo giá.
- Given `PRICE_CHANGED`, when hiển thị lỗi, then giá mới được cập nhật và email/lựa chọn không đổi.
- Given popup PayPal đang mở, when click overlay, then modal vẫn mở.

## Implementation Notes

## Spec Change Log

## Review Triage Log

- **high | patch (đã sửa) — `apps/web/Dockerfile` lại có chuỗi `
` thật trong dòng `ENV` (lần này ở `NEXT_PUBLIC_PAYPAL_CLIENT_ID`), làm hỏng build ảnh web và mất client id, modal luôn báo chưa cấu hình:** thay bằng xuống dòng + tiếp dòng đúng.
- **high | patch (đã sửa) — Capture lỗi (mạng/5xx) sau khi người mua đã duyệt trên PayPal lại hiện thông điệp chung và mời thanh toán lại, có thể dẫn tới trả tiền hai lần:** lỗi capture không phải `PAYMENT_DECLINED` nay hiện thông điệp `captureUnknown` ("có thể đã ghi nhận, vui lòng không thanh toán lại, liên hệ kèm email"); test.
- **medium | patch (đã sửa) — `PRICE_CHANGED` mà `details` không parse được thì giá cũ vẫn hiển thị trong khi thông điệp nói giá mới đã hiện:** tải lại báo giá.
- **medium | patch (đã sửa) — Thiếu test: trả focus về nút gọi, ba lối vào mua (header, call-out MIDI/MP3, sidebar PDF), call-out biến mất khi không còn giá âm thanh:** thêm vào `sheet-detail.test.tsx`.
- **low | patch (đã sửa) — `NEXT_PUBLIC_CONTACT_EMAIL` thiếu trong `turbo.json`:** thêm vào cả hai danh sách env.
- **medium | defer — Chưa có thao tác "thử capture lại" cho cùng `paypalOrderId` và người mua chưa có đường lấy lại link khi capture lỗi cho tới Story 3.7 (email):** ghi vào `deferred-work.md`.
- **false — Nút PayPal vẫn bấm được bằng bàn phím khi đang xử lý:** `onClick` của PayPalButtons kiểm `lock.current` và `actions.reject()` nên lần hai bị chặn.
- **false — `router.push` lỗi làm modal kẹt:** `router.push` của Next không ném lỗi; điều hướng không chặn.
- **false — `PurchaseProvider` gọi `usePurchase()` ngoài provider:** `PurchaseButtons` trả null khi không có provider (đã kiểm).
- **low (rejected) — Bẫy focus không bắt Tab khi focus ở ngoài/iframe PayPal; Esc khi focus ở body; layout shift khi chưa có báo giá; quote trang không cập nhật sau lỗi trong modal; `onError` ghi đè `cancelled`; hai nguồn `paymentsEnabled` trong `computeQuote`; `SettingsService` đọc DB mỗi lần báo giá; import không theo thứ tự; `dialogLabel` không dùng; tiêu đề chỉ theo `initialType`:** không có tác hại cụ thể ở quy mô hiện tại hoặc cần thêm nhánh/bề mặt; PayPal SDK không đổi style theo spec.

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- `pnpm --filter @piano-daily/shared test`, `--filter @piano-daily/web test` -- expected: pass
- API unit + integration (CI chạy integration) -- expected: pass

**Manual checks:**
- Thử PayPal sandbox: tạo đơn, approve, capture, tới trang tải (cần `NEXT_PUBLIC_PAYPAL_CLIENT_ID` sandbox).
