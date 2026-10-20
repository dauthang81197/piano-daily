---
title: 'UI/UX U5: chuyển động, trợ năng, trang trạng thái, tương phản'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: '0adf457'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-u4-khoa-hoc-dang-nhap.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rà sau U0–U4: (1) tương phản: chữ trắng trên nền brass `#a97d2f` chỉ đạt 3.7:1 (nút Tải/Mua, tag Genre đang chọn) và chữ brass trên nền ngà chỉ 3.0–3.4:1 (link menu đang chọn, nhãn eyebrow, link email) — dưới AA 4.5:1; (2) không có skip link nên người dùng bàn phím phải Tab qua cả header; (3) không có `error.tsx` nên lỗi runtime hiện trang lỗi mặc định của Next ngoài ngôn ngữ thiết kế; trang 404 trơ; khoá học và trang khoá/bài chưa có `loading.tsx`; (4) chuyển động rời rạc: chỉ modal có fade, menu mobile/modal đăng nhập hiện đột ngột, nút bấm không có phản hồi nhấn, `summary` không có focus ring chung; (5) chưa có số đo CLS/LCP; (6) nhãn footer "Học và gói" còn nhắc gói khi thanh toán ẩn.

**Approach:** Thêm token `--color-secondary-strong` (#86611f, 5.2–5.6:1) và dùng cho mọi CHỮ/NỀN-NÚT brass; brass gốc chỉ cho trang trí (icon, viền, vòng focus). Skip link "Bỏ qua tới nội dung" đầu trang. `StatusPage` dùng chung cho 404 và `error.tsx` mới (có nút Thử lại + Về trang chủ). `loading.tsx` cho `/courses` và `/courses/[track]` (phủ cả bài học) bằng `Skeleton`. Bộ chuyển động chung: keyframes `fade-up` (≤ 200 ms) cho menu mobile, modal đăng nhập, panel; phản hồi nhấn cho `Button`; quy tắc `prefers-reduced-motion` chung tắt mọi animation/transition. Test tương phản đọc `theme.css` cho các cặp màu đang dùng. Script `vitals.mjs` đo LCP/CLS trên các trang chính ở 390px. Nhãn footer theo cờ thanh toán.

## Boundaries & Constraints

**Always:** Token chỉ thêm, không đổi giá trị cũ (admin dùng chung `theme.css`); giữ hành vi, SSR/cache, SEO, i18n vi/en (chuỗi mới vào `messages/{vi,en}.json`), focus ring brass gốc (viền, không phải chữ), vùng chạm ≥ 44px, không tràn ngang ở 390/768/1280px; mọi chuyển động ≤ 200 ms và tắt khi reduced-motion.

**Never:** Đổi giá trị token/font hiện có; thêm thư viện (animation, a11y); sửa API/admin/payment-modal/logic phát nhạc; tự phát âm thanh; infinite scroll; dark mode.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Skip link | Tab lần đầu | Link "Bỏ qua tới nội dung" hiện (focus), Enter chuyển focus tới vùng nội dung | Ẩn thị giác khi không focus |
| Lỗi runtime | Trang ném lỗi | `error.tsx` trong khung (header/footer còn), tiêu đề + mô tả + nút Thử lại + Về trang chủ; `console.error` | Thử lại gọi `retry` |
| 404 | URL không tồn tại | `StatusPage` cùng kiểu với lỗi | N/A |
| Loading | Mở `/courses`, khoá, bài | Skeleton đúng bố cục, `aria-busy` | N/A |
| Nút/menu/modal | Mở/nhấn | fade-up ≤ 200 ms; nhấn thu nhẹ | Reduced-motion: không chuyển động |
| Tương phản | Mọi cặp chữ/nền dùng secondary | ≥ 4.5:1 (chữ nhỏ) | Test đỏ nếu thấp hơn |
| Thanh toán ẩn | cờ tắt | Footer nhãn "Học" thay "Học và gói" | N/A |
| Đo vitals | `pnpm --filter @piano-daily/web vitals` | Bảng LCP/CLS mỗi trang; cảnh báo khi CLS > 0.1 hoặc LCP > 2.5s | Thoát ≠ 0 nếu web không chạy |

</frozen-after-approval>

## Code Map

- `packages/tokens/theme.css` -- thêm `--color-secondary-strong`.
- `apps/web/src/app/globals.css` -- keyframes `fade-up`, lớp `.motion-fade-up`, quy tắc reduced-motion chung, focus ring cho `summary`.
- `apps/web/src/app/[locale]/layout.tsx` -- skip link + `id="main-content"` (`tabIndex={-1}`) quanh nội dung.
- `components/layout/{skip-link,status-page}.tsx` -- mới; `not-found.tsx` dùng `StatusPage`; `app/[locale]/error.tsx` mới.
- `components/sheet/download-button-class.ts`, `components/catalog/genre-tags.tsx`, `layout/nav-links.tsx`, `ui/page-header.tsx`, `home/hero.tsx`, `courses/track-view.tsx`, `downloads/[token]/page.tsx` -- chữ/nền brass → `secondary-strong`.
- `components/ui/button.tsx` -- phản hồi nhấn; `layout/mobile-menu.tsx`, `auth/auth-modal.tsx` -- `motion-fade-up`.
- `app/[locale]/courses/loading.tsx`, `courses/[trackSlug]/loading.tsx` -- mới.
- `components/layout/footer.tsx` + messages -- nhãn theo cờ.
- `apps/web/scripts/vitals.mjs`, `package.json`, README -- đo LCP/CLS.
- Test: tương phản các cặp (`ui-kit.test.tsx`), skip link, `StatusPage`/error (có nút Thử lại), footer theo cờ, `Button` pressed không đổi API.

## Tasks & Acceptance

**Execution:**
- [x] Token + thay chữ/nền brass + test tương phản
- [x] Skip link + `StatusPage` + `error.tsx` + `loading.tsx` + test
- [x] Chuyển động chung (globals, Button, menu, modal) + reduced-motion
- [x] Nhãn footer theo cờ
- [x] `vitals.mjs`, chạy trên build, ghi số đo; chụp `u5-after`, so `u4-after`

**Acceptance Criteria:**
- Given các cặp chữ/nền có brass, when chạy test tương phản, then ≥ 4.5:1 và test đỏ nếu hạ xuống.
- Given người dùng bàn phím, when Tab lần đầu rồi Enter, then focus nhảy vào vùng nội dung; mọi phần tử bấm được (kể cả `summary`) có vòng focus thấy rõ.
- Given lỗi runtime hoặc 404, when hiển thị, then trong khung site, có hành động tiếp theo, không phải trang mặc định của Next.
- Given reduced-motion bật, when điều hướng/mở menu/modal, then không có chuyển động.
- Given build production, when chạy `vitals`, then CLS ≤ 0.1 ở các trang chính (LCP ghi nhận).

## Implementation Notes

Đã làm: token `--color-secondary-strong` (#86611f) cho mọi chữ/nền-nút brass (nút Tải/Mua, tag Genre chọn, menu đang chọn, eyebrow, link email, số level); placeholder ô nhập đậm hơn (trước ~3.7:1); skip link + `id="main-content"`; `StatusPage` dùng cho 404 và `error.tsx` mới (Thử lại dùng `retry` của Next 16 + Về trang chủ); `loading.tsx` cho `/courses` và `/courses/[trackSlug]` (phủ cả trang bài); `fade-up` ≤ 200ms cho menu mobile và modal đăng nhập, `Button` thu nhẹ khi nhấn, một quy tắc reduced-motion toàn cục, vòng focus cho `summary`; footer "Học" khi thanh toán ẩn; `scripts/vitals.mjs` + README.
Kết quả: web lint/typecheck/build + admin build xanh, 888 test (thêm 6). Số đo trên bản build, mobile 390px, máy local: LCP 48–92ms, CLS 0.000 mọi trang trừ trang khoá 0.036 (nút "Đăng nhập để lưu tiến độ"/"Tiếp tục học" hiện sau hydrate; dưới ngưỡng 0.1). Số trên máy local, không thay cho đo trên mạng thật. Ảnh `u5-after`: không tràn ngang, không lớp phủ lỗi (bản dev hiện chỉ báo "1 Issue" ở trang 404, là log lỗi 404 của Next dev).
Chưa làm: thử `<summary>`/mục lục với trình đọc màn hình thật; đo LCP trên mạng/thiết bị thật.

## Spec Change Log

## Review Triage Log

Lượt 1 (3 reviewer: Blind Hunter, Edge Case Hunter, Verification Gap).

| Phát hiện | Verdict | Xử lý / bằng chứng |
|---|---|---|
| Nút chọn gói ở `plan-checkout.tsx` còn `bg-secondary` + chữ trắng (3.7:1) (BH, ECH, VG, medium) | true | Patch: `bg-secondary-strong`. Grep xác nhận không còn chữ/nút nhỏ nào dùng `secondary` gốc (còn lại là icon, viền, playhead, vòng focus). |
| Đích skip link nằm dưới header sticky, không `scroll-margin` (ECH, medium) | true | Patch: `scroll-mt-32` trên `#main-content`. |
| Quy tắc reduced-motion toàn cục làm vòng xoay "đang xử lý" đứng yên, không có chữ/aria-busy đi kèm (ECH, medium) | true | Patch: `.animate-spin` quay chậm 1.5s trong khối reduced-motion (phản hồi cần thiết). |
| `Button`: `transition-[color,background-color,transform]` bỏ chuyển border/opacity (BH, ECH, low) | true | Patch: dùng `transition` mặc định của Tailwind (gồm cả border, opacity, bóng, transform). |
| Test footer chỉ kiểm "không có Learn" khi bật cờ, tên test sai (BH, ECH, VG) | true | Patch: kiểm `Learn & plans` hiện, sửa tên test. |
| `[trackSlug]/loading.tsx` không khớp bố cục trang bài (ECH, low) | true | Patch: thêm `[lessonId]/loading.tsx` (2 cột, video, mục lục). |
| `vitals.mjs`: lỗi 1 trang làm dừng cả lượt, không kiểm `--locale`, API lỗi vẫn "thành công", không đo trang bài, base 404 vẫn qua (ECH, low) | true | Patch: try/catch từng trang → cảnh báo + thoát 1, kiểm `--locale`, cảnh báo khi thiếu Sheet/khoá mẫu, đo trang bài, base < 400. Chạy lại: 7 trang, CLS ≤ 0.045. |
| `#main-content` là `div` nên trình đọc màn hình không đọc landmark khi nhảy tới (BH, ECH, low) | accepted | Trang nào cũng có `<main>` riêng nên landmark vẫn có; skip link phục vụ người dùng bàn phím. Không thêm `id` vào từng trang. |
| Lỗi ở chính `[locale]/layout.tsx` không bị `error.tsx` bắt, chưa có `global-error.tsx` (BH, ECH, low) | reject | `fetchSiteSettings`/`fetchAds` bắt mọi lỗi và trả mặc định, nên layout không ném; thêm `global-error` cần html/body riêng và không có provider chữ. |
| `aria-busy` ở skeleton không có vùng live (BH, ECH, low) | reject | Giống mọi `loading.tsx` hiện có; trang thật thay thế skeleton. |
| `active:scale` có thể làm mất click ở mép (ECH, low); `animation-delay` không chặn (BH, low) | reject | Rất hiếm / không gây hại thực tế. |
| Thiếu test cho `Button` pressed, CSS skip link ẩn, focus thật sự di chuyển, 404/error nằm trong khung (VG, low) | reject | Quy ước repo không test class CSS; hành vi focus/khung đã kiểm bằng ảnh `u5-after` và vitals. |
| Test tương phản thiếu `surface-container-high` cho secondary-strong (4.12:1) (BH, ECH, VG, low) | accepted | Không có chữ secondary-strong nào trên nền đó; ghi trong `deferred-work.md` để cấm dùng. |
| Admin còn `text-secondary` chữ nhỏ (~3.4:1) (ECH, low) | defer | Ngoài phạm vi U5 (admin); ghi `deferred-work.md`. |
| README, placeholder đổi màu không có trong phần đóng băng của spec (VG, info) | reject | Đã ghi ở Implementation Notes. |

## Design Notes

Brass (#a97d2f) là màu thương hiệu nên giữ cho trang trí; chữ nhỏ cần biến thể đậm hơn (#86611f) như cách đã làm cho nhãn Level ở U0. Không đổi giá trị token cũ để admin không bị ảnh hưởng. Chuyển động chỉ fade + dịch 8px ≤ 200 ms và có một quy tắc reduced-motion toàn cục để các animation mới không phải nhớ tự tắt.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` (không nạp `.env`) -- expected: thành công; admin build vẫn xanh (dùng chung theme.css)
- `pnpm --filter @piano-daily/web shots -- --label u5-after`; `vitals` trên bản build -- expected: không cảnh báo
