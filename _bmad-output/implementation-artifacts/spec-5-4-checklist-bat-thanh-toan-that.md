---
title: 'Story 5.4 — Checklist bật thanh toán thật'
type: 'chore'
created: '2026-10-10'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
baseline_commit: '45b7a9055c6a3f9e8c40bf849969984ca6cd44ce'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chuyển PayPal từ sandbox sang live là bước dễ sai và khó hoàn tác (đơn thật, tiền thật), chưa có quy trình rõ ràng.

**Approach:** Thêm mục "Checklist bật thanh toán thật" vào README: rà soát bản quyền, app PayPal live, webhook live 3 event, `PAYPAL_MODE=live`, xác minh domain Resend, bài mua thử có hoàn tiền, và phương án rollback bằng cờ "Bật thanh toán".

</frozen-after-approval>

## Implementation Notes

- Chỉ sửa `README.md` (mục mới trước "Quy ước chính"); không đổi code hay cấu hình, không bật `PAYPAL_MODE=live` ở bất kỳ nơi nào.
- Ba event webhook lấy từ `webhook.service.ts`: `PAYMENT.CAPTURE.COMPLETED`, `PAYMENT.CAPTURE.REFUNDED`, `PAYMENT.CAPTURE.DENIED`; URL `https://api.<ROOT_DOMAIN>/webhooks/paypal`.
- Các ô checklist để trống cho founder tự đánh dấu; phần mua thật cần PayPal live nên không thử được trong phiên này.

## Review Triage Log

Bỏ qua review nhiều lớp vì thay đổi chỉ là tài liệu (một mục README), không có mã chạy.
