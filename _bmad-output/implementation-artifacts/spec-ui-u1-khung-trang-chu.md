---
title: 'UI/UX U1: header, footer, trang chủ'
type: 'feature'
created: '2026-10-19'
status: 'in-review'
baseline_commit: '909df0cebcd0eb84d2957bf1d7bd956d0afa3b01'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ảnh chụp `u1-before` cho thấy: header nhồi 8 link + ô tìm + Tìm + ngôn ngữ + Đăng nhập trên một hàng nên ở 768px trang tràn ngang (1110px) và chữ nav/nút bị ngắt 2 dòng ở 1280px; header không dính, không đánh dấu trang hiện tại; trang chủ chỉ có tiêu đề và 4 nút trong cột 768px lệch trái; footer 3 cột phẳng.

**Approach:** Header 2 hàng ở `md+` (hàng trên: logo, ô tìm có nút icon, ngôn ngữ, đăng nhập; hàng dưới: 4 Level, Khoá học, Bảng giá, link trang hiện tại tô brass + `aria-current`), sticky, một hàng + hamburger ở mobile. Trang chủ dựng hero căn giữa có ô tìm lớn + 2 nút CTA, 4 thẻ Level (màu cấp độ, mô tả, số bài), lưới 6 bài mới nhất, dải Khoá học + Bảng giá. Footer 4 cột + dòng bản quyền. Chỉ dùng token và thành phần U0 (`Card`, `Badge`, `Button`).

## Boundaries & Constraints

**Always:** SSR + cache tag hiện có; i18n vi/en (mọi chuỗi mới ở cả 2 file); focus ring brass, mục chạm ≥ 44px, `prefers-reduced-motion`; không tràn ngang ở 390/768/1280px; trang chủ vẫn hiện hero + Level khi API lỗi (phần phụ thuộc API tự ẩn, không làm sập trang); giữ metadata/SEO của trang chủ.

**Never:** Đổi màu/font/token; thêm thư viện; đổi API/DB; sửa trang Level/Search/Sheet (U2–U3); quảng cáo ở trang chủ; infinite scroll; menu dropdown.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Link hiện tại | Đang ở `/vi/level/beginner` (hoặc con của nó) | Link Cơ bản có `aria-current="page"` và màu brass; link khác không | N/A |
| Trang không thuộc nav | `/vi/sheet/x` | Không link nào active | N/A |
| Home đủ dữ liệu | API có sheet, Level summary, khoá học | Hero, 4 thẻ Level kèm số bài, 6 bài mới, dải khoá học + bảng giá | N/A |
| Home API lỗi | `fetch*` ném lỗi | Vẫn hiện hero + 4 thẻ Level (không số bài); ẩn lưới bài mới và dải khoá học | Bắt lỗi từng phần, không ném ra error boundary |
| Chưa có khoá học | `fetchTracks` rỗng | Ẩn thẻ khoá học, giữ thẻ bảng giá | N/A |
| Tìm ở header | Gõ chữ, bấm icon hoặc Enter | Gửi GET `/{locale}/search?q=`; nút icon có tên truy cập "Tìm" | N/A |
| Mobile | `< md` | 1 hàng logo + hamburger; menu mở có đủ link + ô tìm + ngôn ngữ + đăng nhập; Esc đóng, trả focus | N/A |
| Footer YouTube | `youtubeUrl` hợp lệ / rỗng | Có / không có link | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/layout/header.tsx` -- đổi bố cục 2 hàng, sticky (`sticky top-0 z-40`, nền `bg-surface/95` + blur); bỏ link "Trang chủ"/"Tìm kiếm" khỏi nav (logo và ô tìm thay).
- `apps/web/src/components/layout/nav-links.tsx` -- mới, client: `usePathname` từ `@/i18n/navigation`, active khi path bằng hoặc bắt đầu bằng `href + '/'`; dùng chung cho desktop và mobile.
- `apps/web/src/components/layout/mobile-menu.tsx` -- dùng `NavLinks`, icon `Menu`/`X` (lucide), mục `min-h-11`; giữ hành vi Esc/focus/`aria-expanded` (test hiện có).
- `apps/web/src/components/layout/search-form.tsx` -- thêm biến thể `compact`: ô có icon `Search` bên trong làm nút submit (`aria-label` = `Search.submit`); giữ `large` cho Level/Search/trang chủ.
- `apps/web/src/components/layout/footer.tsx` -- 4 cột (giới thiệu + YouTube, Thư viện = 4 Level, Học & gói = Khoá học/Bảng giá/Tìm kiếm, Bản quyền) + dòng `© năm tên site`; nhận thêm `siteName`.
- `apps/web/src/app/[locale]/layout.tsx` -- truyền `siteName` cho Footer.
- `apps/web/src/app/[locale]/page.tsx` -- trang chủ mới; dữ liệu: `fetchLevelSummary` ×4 (`.total`), `fetchSearch({ sort: 'newest', page: 1 })` lấy 6 đầu, `fetchTracks(locale)`; mỗi cái bọc `try/catch`.
- `apps/web/src/components/home/{hero,level-cards,course-pricing-band}.tsx` -- mới (server component); thẻ Level dùng `Card interactive` + `Badge`/chấm màu `level-*`; lưới bài dùng `SheetGrid` hiện có.
- `apps/web/src/lib/levels.ts` -- `LEVELS`, `LevelSlug`; không đổi.
- `apps/web/src/messages/{vi,en}.json` -- thêm `Home.*` (hero, CTA, mô tả Level, `levelCount`, `latestTitle`, `viewAll`, `coursesTitle/Body/Cta`, `pricingTitle/Body/Cta`), `Footer.*` (cột mới, bản quyền), `Search.submit` đã có.
- Test cần cập nhật/thêm: `components/layout/{header-footer,mobile-menu}.test.tsx`, `nav-links.test.tsx`, `components/home/*.test.tsx`, `app/[locale]/page.test.tsx`; kiểm tra test parity messages nếu có.
- Không đổi: `apps/api`, `apps/admin`, `packages/*`, trang Level/Search/Sheet.

## Tasks & Acceptance

**Execution:**
- [x] `nav-links.tsx`, `header.tsx`, `mobile-menu.tsx`, `search-form.tsx` + test -- header mới
- [x] `footer.tsx`, `layout.tsx` + test -- footer 4 cột
- [x] `components/home/*`, `page.tsx`, `messages/*` + test -- trang chủ
- [x] Chụp `u1-after`, so với `u1-before`, sửa lỗi nhìn thấy -- founder duyệt ảnh

**Acceptance Criteria:**
- Given ảnh chụp 390/768/1280px của mọi trang đã chụp, when kiểm tra, then không cuộn ngang, nav và nút không bị ngắt dòng, header dính khi cuộn.
- Given API tắt, when mở trang chủ, then trang hiển thị hero + thẻ Level và không có lỗi 500.
- Given người dùng bàn phím, when Tab qua header, then thứ tự: logo, ô tìm, nút tìm, ngôn ngữ, đăng nhập, nav; focus luôn thấy rõ; hamburger đóng bằng Esc.
- Given reduced-motion bật, when hover thẻ, then không có chuyển động.

## Implementation Notes

Đã làm đúng spec: `nav-links.tsx` (`PrimaryNav`, `isActivePath`), header 2 hàng sticky, `MobileMenu` dùng icon lucide + `PrimaryNav`, `SearchForm compact`, footer 4 cột + bản quyền (`siteName` truyền từ layout), `components/home/{hero,level-cards,latest-sheets,course-pricing-band}.tsx`, `page.tsx` bọc từng fetch bằng `.catch`, i18n vi/en. Web: lint, typecheck, build, 862 test xanh.

Quyết định thêm: gutter header/footer/trang chủ dùng `md:px-margin-desktop` (64px) để thẳng hàng với các trang hiện có; nút Đăng nhập/Đăng xuất `whitespace-nowrap`. `scripts/shots.mjs` nay cuộn hết trang để ảnh lazy tải xong và báo lỗi khi trang tràn ngang: cả 9 trang × 3 cỡ (`u1-after`) đều không tràn.

Ngoài spec: không có. Chưa kiểm: header khi đã đăng nhập (tên + quyền tải dài), vì ảnh chụp là khách.

## Spec Change Log

## Review Triage Log

Lượt 1 (3 reviewer: Blind Hunter 11 mục, Edge Case Hunter 12, Verification Gap 3 + 1 phụ).

| Phát hiện | Verdict | Xử lý / bằng chứng |
|---|---|---|
| Hero luôn có nút "Xem khoá học" dù chưa có khoá (BH, VG) | medium | Patch: `Hero` nhận `showCourses`; test thêm cả 2 trạng thái. |
| Menu mobile mất test "bấm link thì đóng" sau refactor sang `PrimaryNav` (VG) | medium | Patch: thêm test bấm Pricing → `aria-expanded=false`. |
| CTA hero và ô tìm hero không có assertion (VG) | low | Patch: assert href `/en/level/beginner`, `/en/courses`, có searchbox. |
| Link nav desktop cao ~40px, link stack mobile không `min-h` (ECH, claim ≥ 44px) | low | Patch: `py-2.5` (44px) và `min-h-11`. |
| `orElse` nuốt lỗi không log (BH) | low | Patch: `console.error` kèm message. |
| Thẻ bảng giá giãn full-width khi ẩn khoá học (BH) | low | Patch: `md:max-w-3xl` khi một thẻ. |
| `max-h-[calc(100vh-4rem)]` bỏ qua thanh trình duyệt mobile (BH, ECH) | low | Patch: `100dvh` + `overscroll-contain`. |
| `siteName` rỗng cho dòng bản quyền (ECH) | low | Patch: `siteName \|\| 'Piano Daily'`. |
| Vòng cuộn của `shots.mjs` không giới hạn (BH, ECH) | low | Patch: tối đa 60 bước. |
| Ném đồng bộ làm `.catch` hụt; `total`/`items` thiếu (ECH) | false | `fetchLevelSummary/fetchSearch/fetchTracks` là hàm `async` (lỗi luôn thành rejection) và dữ liệu đã qua `schema.parse`. |
| Overflow chỉ ghi vào `failed` nên thoát mã 0 (BH, ECH) | false | Cuối `main` có `process.exit(1)` khi `failed.length > 0` (đã thử ở lượt trước). |
| Chữ gõ dài chui dưới icon ở ô tìm gọn (ECH) | false | `Input` nhận `className` qua `cn`, có `pr-11`; ảnh chụp xác nhận. |
| Menu mở khi submit tìm / resize lên md (ECH) | low | Reject: form GET tải lại trang nên menu tự đóng; wrapper `md:hidden` ẩn menu khi rộng. |
| Pathname có `/` cuối hoặc null (ECH) | false | `usePathname` của next-intl trả path đã chuẩn hoá, không null ở client. |
| 6 lời gọi API/lần render, `fetchSearch` lấy cả trang (BH) | low | Reject: `publicFetch` dùng `force-cache` + tag; API không có tham số kích thước trang công khai. |
| Năm bản quyền cũ khi trang cache (ECH) | low | Reject: trang làm mới tối đa 10 phút, sai lệch chỉ ở ngày 1/1. |
| `scroll-padding-top`, `focus-within`, `motion-reduce` của thẻ Level (BH) | false | Không có anchor trong trang; thẻ Level đã có `focus-within` và `Card` có `motion-reduce`. |
| Spec nói Badge/chấm màu, code dùng viền màu (ECH, claim) | low | Reject: chỉ lệch mô tả Code Map, hành vi đúng ảnh duyệt. |
| README MEDIA và `AGENTS.md`/`CLAUDE.md` do `next dev` sinh bị commit kèm (BH) | low | Defer: tệp ngữ cảnh agent do Next sinh lại mỗi lần chạy dev (chính tệp ghi nên commit); quyết định giữ/bỏ để người dùng chọn. |
| Chưa có test song ngữ vi/en khớp khoá (VG) | maybe-false | Defer: chung cả repo; các khoá U1 đủ ở cả 2 file. |

## Design Notes

Bỏ "Trang chủ"/"Tìm kiếm" khỏi nav vì logo đã về trang chủ và ô tìm luôn hiện; còn 6 link xếp vừa hàng dưới ở 768px mà không cần dropdown (tránh thêm JS, giữ SSR). Hero căn giữa theo mockup `level-page.html`; thẻ Level dùng màu cấp độ làm điểm nhấn thay vì ảnh để không phụ thuộc dữ liệu.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` (không nạp `.env` vào shell) -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label u1-after` -- expected: ảnh ở `apps/web/.shots/u1-after`

**Manual checks (if no CLI):**
- So `u1-before` và `u1-after` ở 390/768/1280px: header không tràn, trang chủ cân đối, footer gọn.
