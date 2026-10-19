---
title: 'UI/UX frontend user: lộ trình nâng cấp giao diện U1–U5'
type: 'feature'
created: '2026-10-19'
status: 'ready-for-dev'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/EXPERIENCE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Giao diện user (`apps/web`) đúng token nhưng còn thô: trang chủ chỉ có tiêu đề và 4 nút Level trong cột 768px, header nhồi 7 link + ô tìm 256px + ngôn ngữ + đăng nhập trên một hàng, thẻ/khoá học/trang bài phẳng, gần như không có chuyển động. Các UI khoá học C1c–C5 mới chỉ kiểm bằng jsdom, chưa ai nhìn trên trình duyệt thật.

**Approach:** Giữ nguyên "Ivory & Walnut" (màu, font, token dùng chung với admin), nâng độ tinh tế qua chiều sâu, nhịp khoảng cách, ảnh và chuyển động nhẹ. Làm tuần tự 5 giai đoạn, mỗi giai đoạn một nhánh + spec + PR riêng như C1–C5. Mỗi giai đoạn được chụp ảnh Playwright ở 3 cỡ màn hình (390 / 768 / 1280) trước và sau để founder duyệt.

## Boundaries & Constraints

**Always:** Chỉ dùng token trong `packages/tokens/theme.css`; không đổi màu/font. Giữ SSR + cache tag, SEO (metadata, JSON-LD), i18n vi/en, focus ring brass, mục chạm ≥ 44px, `prefers-reduced-motion`, tương phản AA. Mọi chuỗi mới vào `messages/{vi,en}.json`. Không đổi API/DB. Test hiện có vẫn xanh; thêm test cho hành vi mới (không test class CSS).

**Never:** Đổi bảng màu, font hay thêm thư viện UI/animation nặng. Infinite scroll (EXPERIENCE: phân trang số). Tự động phát nhạc. Chế độ tối (ngoài phạm vi). Đụng admin. Gộp nhiều giai đoạn vào một PR.

## Giai đoạn

| # | Tên | Nội dung chính |
|---|-----|----------------|
| U0 | Nền tảng | Dựng API + dữ liệu mẫu cục bộ, script Playwright chụp 3 cỡ màn hình, lưu ảnh "trước" vào scratchpad. Chuẩn hoá bộ thành phần dùng chung: `Button` (thêm cỡ `sm/lg`, variant `ghost`), `Card`, `Badge`, `Section`/`PageHeader`, thang bóng + radius, `Skeleton`. |
| U1 | Khung + Trang chủ | Header: sticky, trạng thái link đang chọn, gom Level vào menu, ô tìm thu gọn (icon mở rộng) để không chật ở 768–1100px. Footer: bố cục 4 cột, link khoá học/bảng giá. Trang chủ: hero (tiêu đề serif lớn, ô tìm, CTA), dải Level dạng thẻ có màu cấp độ, lưới "Bài mới/Nổi bật" theo mockup `level-page.html`, khối giới thiệu khoá học + bảng giá. |
| U2 | Catalog | `SheetCard`: ảnh có hiệu ứng nhẹ, placeholder thumbnail đẹp, huy hiệu gọn, hàng định dạng bằng icon; lưới đều nhịp; thanh lọc/sắp xếp dính trên mobile; skeleton đúng hình thẻ; trạng thái rỗng có hình + gợi ý; phân trang rõ trạng thái. Áp cho Level/Search/Composer/Genre. |
| U3 | Chi tiết Sheet | Bố cục 2 cột desktop (xem trước/ player | thông tin + tải), thanh player gọn, phím đàn và khuông nhạc có khung/độ sâu, nhóm nút tải theo `button-download`, modal thanh toán cùng ngôn ngữ thị giác, breadcrumb và bài liên quan. |
| U4 | Khoá học, bảng giá, đăng nhập | Trang `/courses` có hero và thẻ track có biểu tượng/tiến độ rõ; cây bài học dạng accordion theo level/section; trang bài học 2 cột (video/nhạc + mục lục bên); khối bài nộp/bình luận gọn; bảng giá so sánh gói; modal đăng nhập; trạng thái khoá có thẻ mời đăng ký đẹp. |
| U5 | Chuyển động + a11y + hoàn thiện | Bộ chuyển động chung (fade/translate ≤ 200ms, tắt khi reduced-motion), hover/active/pressed thống nhất, trang 404/lỗi/loading đồng bộ, rà tương phản, thứ tự tab, skip link, đo CLS/LCP; sửa lỗi tìm thấy qua ảnh chụp. |

## Quy trình mỗi giai đoạn

1. Nhánh `feature/ui-<ux>` từ `develop` mới nhất; spec riêng (`spec-ui-u1-...md`) có Code Map, Tasks, AC Given/When/Then.
2. Chụp "trước" → thực hiện → chụp "sau"; founder duyệt ảnh trước khi sang giai đoạn kế.
3. lint, typecheck, build, test web xanh; commit; xin phép rồi chạy 3 reviewer; vá; chỉ push/PR/merge khi founder yêu cầu.

</frozen-after-approval>

## Code Map

- `packages/tokens/theme.css` -- token màu/font/radius/spacing dùng chung web + admin; chỉ thêm token bóng/chuyển động, không đổi giá trị cũ.
- `apps/web/src/app/globals.css` -- base, focus ring, keyframes (hiện chỉ `payment-fade`, `notation-*`); thêm keyframes dùng chung ở U5.
- `apps/web/src/components/ui/{button,input}.tsx` -- chỉ có 2 variant, 1 cỡ; mở rộng ở U0.
- `apps/web/src/components/layout/{header,footer,mobile-menu,search-form,language-switcher}.tsx` -- khung (U1). Header hiện `relative`, không sticky, không trạng thái active, nav 7 link `md:flex`.
- `apps/web/src/app/[locale]/page.tsx` -- trang chủ 33 dòng, `max-w-3xl`, chỉ 4 nút Level (U1).
- `apps/web/src/components/catalog/{sheet-card,sheet-grid,sheet-card-skeleton,pagination,sort-links,genre-tags,search-filters}.tsx` -- catalog (U2). `LEVEL_BADGE`/`badge` export từ `sheet-card.tsx`.
- `apps/web/src/app/[locale]/level/[level]/page.tsx`, `search/page.tsx`, `composer`, `genre` -- trang dùng lưới (U2).
- `apps/web/src/components/sheet/*` -- chi tiết Sheet, player, phím đàn, khuông nhạc (U3); test jsdom nhiều, giữ nguyên hành vi.
- `apps/web/src/components/payment/payment-modal.tsx`, `components/auth/auth-modal.tsx` -- modal (U3/U4).
- `apps/web/src/components/courses/*`, `app/[locale]/courses/**`, `components/pricing/*` -- khoá học, bảng giá (U4); `track-card.tsx`, `track-view.tsx`, `lesson-view.tsx`.
- `_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/mockups/{level-page,sheet-detail,payment-modal}.html` -- mockup gốc; spine EXPERIENCE.md thắng khi xung đột.
- Không thay đổi: `apps/api`, `apps/admin`, `packages/shared`.

## Tasks & Acceptance

**Execution:**
- [ ] U0 -- dựng môi trường chụp ảnh + thành phần dùng chung -- nền cho mọi giai đoạn sau
- [ ] U1 → U5 -- mỗi giai đoạn một spec riêng, viết khi bắt đầu giai đoạn đó

**Acceptance Criteria:**
- Given một giai đoạn hoàn tất, when xem ảnh chụp 390/768/1280px, then không có cuộn ngang, không chữ bị cắt, không chồng lấn, bố cục đúng ý spec giai đoạn.
- Given bất kỳ trang user, when điều hướng bằng bàn phím và bật reduced-motion, then focus thấy rõ, thứ tự hợp lý, không còn chuyển động.
- Given kết thúc U5, when so sánh trước/sau, then token màu/font không đổi và toàn bộ test web/lint/typecheck/build xanh.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Design Notes

Thứ tự theo tác động thị giác trên chi phí: U1 (mọi trang thấy header/footer, trang chủ là cổng vào) → U2 (lưới dùng ở 4 trang) → U3 (điểm quyết định tải/mua) → U4 (khoá học, mới và chưa từng xem trên trình duyệt thật) → U5 (đánh bóng sau cùng, khi đã thấy hết các màn hình). U0 đứng trước vì không có ảnh chụp thì "đẹp" chỉ là đoán.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web build && pnpm --filter @piano-daily/web test` -- expected: xanh (mỗi giai đoạn)

**Manual checks (if no CLI):**
- Ảnh Playwright trước/sau ở 390/768/1280px cho từng trang chạm tới; founder duyệt.
