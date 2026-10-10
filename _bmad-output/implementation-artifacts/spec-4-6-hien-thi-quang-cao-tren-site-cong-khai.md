---
title: 'Story 4.6 — Hiển thị quảng cáo trên site công khai'
type: 'feature'
created: '2026-10-10'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'da354fdbd1d8c8555aea9203fb46462bdd5d2e57'
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-5-quan-ly-vi-tri-quang-cao.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-4-4-cai-dat-site.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Quảng cáo founder đã cấu hình ở Story 4.5 (`GET /ads`) chưa hiển thị ở đâu trên site công khai, và nếu chèn `html_code` trực tiếp vào trang thì mã quảng cáo có thể truy cập trang chứa PayPal.

**Approach:** Web lấy `GET /ads` qua tag `ads` và render từng slot đang bật tại đúng vị trí cố định, tách rõ khỏi nội dung (khung trung tính viền dashed); `html_code` chỉ chạy trong `<iframe sandbox="allow-scripts allow-popups" srcdoc>` không có `allow-same-origin`; slot tắt thì không chiếm chỗ.

## Boundaries & Constraints

**Always:** `fetchAds()` trong `apps/web/src/lib/ads.ts` theo mẫu `fetchSiteSettings` (`server-only`, `publicFetch('/ads', { tags: [cacheTags.ads] })`, parse `z.array(publicAdSlotSchema)`, mọi lỗi trả `[]`, không bao giờ ném, không `no-store`, không `cookies()`/`headers()`). Component `AdSlotFrame` (nhận slots và `position`) trả `null` khi không có slot đang bật cho vị trí đó hoặc slot không có nội dung, và không để lại wrapper, margin hay gap (margin nằm trong component). Khung quảng cáo: `<aside>` có `aria-label`, nhãn nhỏ "Quảng cáo" (i18n `Ads` trong `vi.json`/`en.json`), nền trung tính, viền `dashed`, bo `rounded-sm`, KHÔNG dùng màu thương hiệu (`primary`, `secondary`, `hot-accent`). `htmlCode` luôn nằm trong `<iframe sandbox="allow-scripts allow-popups" srcDoc referrerPolicy="no-referrer" title>` đúng chuỗi sandbox đó, không bao giờ thêm `allow-same-origin`/`allow-top-navigation`/`allow-popups-to-escape-sandbox`, không `dangerouslySetInnerHTML`, HTML quảng cáo không xuất hiện trong DOM ngoài iframe. Slot ảnh: `<a href rel="noopener noreferrer sponsored" target="_blank">` bọc `<img loading="lazy">` (alt rỗng kèm nhãn quảng cáo). Iframe có chiều cao cố định theo vị trí (HEADER, STICKY_BOTTOM thấp; IN_LIST, IN_CONTENT, SIDEBAR_* cao hơn). Vị trí: HEADER ngay dưới `<Header/>` trong `[locale]/layout.tsx` (layout gọi `fetchAds()` một lần); STICKY_BOTTOM là thanh cố định đáy từ layout, client component có nút đóng 44 px và `z-index` thấp hơn modal thanh toán (z-50), không che footer (chừa đệm); IN_LIST ở cả 4 trang danh sách (`level`, `genre`, `composer`, `search`) đặt giữa `SheetGrid` và `Pagination`, ngoài lưới, không bao giờ chèn vào `<ul>` của lưới; IN_CONTENT trong `<article>` của trang chi tiết Sheet (sau trình phát/ảnh trang, trước phần YouTube/lời); SIDEBAR_RIGHT đầu cột `<aside>` bên phải của trang chi tiết (hiện kể cả khi cột đó chưa có nội dung khác) và SIDEBAR_LEFT cột trái chỉ từ `xl` trở lên, ẩn trên màn hình nhỏ; layout không đổi khi không có slot. Trang chi tiết ở chế độ xem trước (`showDownloads={false}`) không hiện quảng cáo. Slot tắt: sau khi API revalidate tag `ads`, trang tải lại thấy vị trí biến mất, không cần deploy. Modal thanh toán: không sửa `payment-modal.tsx`; sandbox không `allow-same-origin` đã chặn mã quảng cáo truy cập document chứa PayPal SDK. CSP (`lib/csp.ts`, test cập nhật): chỉ nới `img-src` thêm `https:` để ảnh quảng cáo hiện; KHÔNG nới `script-src`, `connect-src`, `frame-src` toàn site (trang có PayPal); ghi rõ trong Implementation Notes rằng iframe `srcdoc` kế thừa CSP nên quảng cáo có script inline chạy được còn script bên thứ ba bị chặn cho đến khi founder quyết định nới CSP hoặc tách route quảng cáo riêng.

**Never:** Không chèn quảng cáo giữa các thẻ Sheet; không dùng `allow-same-origin`; không đổi API/DB (đã xong ở 4.5); không sửa `payment-modal.tsx`, `SheetGrid` bên trong; không nới `script-src`/`connect-src`/`frame-src`; không hiện `html_code` của slot tắt (API đã lọc).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Slot html đang bật | `HEADER` + `htmlCode` | Khung dashed + iframe sandbox srcdoc = htmlCode dưới header | N/A |
| Slot ảnh | `IN_LIST` + `image` + `link` | `<a rel="noopener noreferrer sponsored" target="_blank"><img>` giữa lưới và phân trang | N/A |
| Không có slot ở vị trí | `GET /ads` rỗng hoặc thiếu vị trí | Không render gì, không chiếm chỗ | N/A |
| Founder tắt slot | API đã revalidate `ads` | Tải lại: vị trí biến mất, layout co lại | N/A |
| API quảng cáo lỗi | `fetchAds` thất bại / dữ liệu sai | `[]`, trang vẫn hiển thị bình thường | Không ném |
| HTML có script | `<script>` trong htmlCode | Chạy trong iframe opaque origin, không truy cập được document cha/PayPal | N/A |
| STICKY_BOTTOM | Có slot | Thanh cố định đáy; bấm đóng thì ẩn; dưới modal (z thấp hơn 50) | N/A |
| Xem trước Sheet nháp | `showDownloads={false}` | Không có IN_CONTENT/SIDEBAR | N/A |
| Màn hình nhỏ | Sidebar | Ẩn dưới `xl`/`lg` tương ứng | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/lib/site-settings.ts` -- mẫu `fetchSiteSettings` (`server-only`, `publicFetch`, fallback); thêm `apps/web/src/lib/ads.ts` + `ads.test.ts` (mẫu `site-settings.test.ts`: `vi.stubEnv`, `vi.stubGlobal('fetch')`, kiểm `init.next.tags`; ca ok, 500, fetch ném, dữ liệu sai schema).
- `packages/shared/src/ads.ts` (`publicAdSlotSchema`, `AdPosition`), `packages/shared/src/cache-tags.ts` (`cacheTags.ads`) -- tái dùng; không đổi.
- `apps/web/src/components/ads/ad-slot-frame.tsx` (+ test), `sticky-bottom-ad.tsx` (client, nút đóng) -- component mới; tham chiếu iframe ở `apps/admin/src/components/ads/ad-preview.tsx` (`sandbox`, `referrerPolicy="no-referrer"`, viền dashed).
- `apps/web/src/app/[locale]/layout.tsx` -- đã `await fetchSiteSettings()`; thêm `fetchAds()`, render HEADER sau `<Header/>` và STICKY_BOTTOM; `components/layout/header.tsx` giữ nguyên.
- `apps/web/src/components/sheet/sheet-detail.tsx` -- grid `lg:grid-cols-[minmax(0,1fr)_20rem]`, `<article>`, `<aside>` có điều kiện; nhận `ads` qua prop (page chi tiết lấy bằng `fetchAds()`; route xem trước không truyền); thêm IN_CONTENT, SIDEBAR_RIGHT, SIDEBAR_LEFT (`xl`+).
- `apps/web/src/app/[locale]/level/[level]/page.tsx`, `genre/[slug]`, `composer/[slug]`, `search` -- chèn `AdSlotFrame position="IN_LIST"` giữa `<SheetGrid/>` và `<Pagination/>`; `components/catalog/sheet-grid.tsx` không đổi.
- `apps/web/src/lib/csp.ts` (+ `lib/csp.test.ts`, `src/csp.test.ts`) -- `img-src` thêm `https:`; giữ nguyên các directive khác.
- `apps/web/src/messages/vi.json`, `en.json` -- namespace `Ads` (`label`, `frameTitle`, `dismiss`); chú ý test chẵn lẻ khoá (`messages-seo.test.ts`).
- Test: `withIntl` từ `components/layout/test-utils.tsx`; mẫu `sheet-detail.test.tsx`, `catalog.test.tsx`, `layout.test.tsx`; token màu trung tính: `bg-surface-container-low`, `border-outline-variant`, `text-on-surface-variant`.

## Tasks & Acceptance

**Execution:**
- [x] `apps/web/src/lib/ads.ts` -- `fetchAds` với tag `ads` và fallback `[]`, test
- [x] `apps/web/src/components/ads/*` -- `AdSlotFrame` (iframe sandbox/ảnh+link/nhãn/dashed) và `StickyBottomAd`, test thuộc tính iframe, không `allow-same-origin`, HTML không lộ ra DOM
- [x] `layout.tsx`, `sheet-detail.tsx`, 4 trang danh sách -- gắn đúng vị trí, bỏ quảng cáo ở chế độ xem trước, giữ layout khi trống, test
- [x] `lib/csp.ts`, `messages/*.json` -- `img-src https:` và chuỗi `Ads`, test CSP/messages

**Acceptance Criteria:**
- Given AdSlot đang active, when trang công khai render, then `html_code` chỉ chạy trong `<iframe sandbox="allow-scripts allow-popups" srcdoc>` không có `allow-same-origin` và không bao giờ vào DOM trực tiếp; khung có nền trung tính, viền dashed, không dùng màu thương hiệu.
- Given vị trí `IN_LIST`, when render lưới Sheet, then quảng cáo nằm giữa lưới và phân trang, không chèn giữa các thẻ Sheet.
- Given founder tắt một AdSlot, when tải lại trang công khai, then vị trí đó biến mất và không chiếm chỗ, không cần deploy.
- Given modal thanh toán đang mở, when có quảng cáo trên trang, then mã quảng cáo không truy cập được document chứa PayPal SDK.

## Implementation Notes

- CSP: iframe `srcdoc` kế thừa CSP của trang chứa nó, nên quảng cáo có script inline chạy được (`script-src` có `'unsafe-inline'`) còn script bên thứ ba (ví dụ AdSense) bị chặn, cho đến khi founder quyết định nới CSP hoặc tách route quảng cáo riêng. Chỉ `img-src` được thêm `https:` để ảnh quảng cáo hiện; `script-src`, `connect-src`, `frame-src` giữ nguyên.
- `findAdSlot` quyết định slot có nội dung (html không rỗng, hoặc image kèm link); `AdSlotFrame` và `StickyBottomAd` dùng chung `AdFrame`. Sheet chi tiết: cột trái chỉ thêm vào lưới khi có slot SIDEBAR_LEFT (`hidden xl:block`).
- Khối đệm `h-36` của STICKY_BOTTOM nằm trong luồng sau footer để thanh cố định không che footer; đóng thanh thì đệm cũng mất.
- `payment-modal.tsx` không sửa; thanh cố định `z-40` < modal `z-50`.

## Spec Change Log

## Review Triage Log

| Phát hiện | Verdict | Route | Bằng chứng |
|---|---|---|---|
| Đệm h-36 thấp hơn thanh sticky khi quảng cáo ảnh (max-h-64) | medium | patch | Đã giới hạn chiều cao ảnh theo vị trí (`IMAGE_MAX_HEIGHT`, sticky `max-h-20`). |
| Không có test nối dây IN_LIST ở 4 trang danh sách và `ads` ở trang chi tiết | medium | patch | Đã thêm test mock `fetchAds`/`AdSlotFrame` ở 5 page.test. |
| Link `javascript:`/`data:` | false | reject | `urlSchema` của shared đã kiểm khi lưu. |
| Dismiss không lưu qua reload | low | reject | Spec chỉ yêu cầu "bấm đóng thì ẩn"; thêm lưu trữ là phức tạp ngoài ý định. |
| Quảng cáo IN_LIST hiện khi danh sách rỗng | low | reject | Spec đặt giữa lưới và phân trang; cosmetic. |
| `fetchAds` tuần tự / chạy cho 404 | low | reject | Dữ liệu được cache theo tag; ảnh hưởng không đáng kể. |
| `allow-popups` thiếu `allow-popups-to-escape-sandbox` | false | reject | Chuỗi sandbox do spec (frozen) quy định, cấm thêm cờ khác. |
| HEADER/STICKY hiện ở route xem trước | low | reject | Spec chỉ cấm quảng cáo ở trang chi tiết chế độ xem trước. |
| SIDEBAR_LEFT iframe trong khối ẩn ở lg | false | reject | iframe `loading="lazy"` trong `display:none` không tải. |
| Chỉ render slot đầu mỗi vị trí | false | reject | Story 4.5 đảm bảo mỗi vị trí một slot. |
| `img-src https:` rộng | low | reject | Quyết định có chủ ý của spec. |

## Verification

**Commands:**
- `pnpm typecheck && pnpm lint` -- expected: pass
- Test web (và shared nếu đổi) -- expected: pass

**Manual checks:**
- Ở admin bật vài slot (một html có `<script>`, một ảnh+link), mở site công khai và kiểm tra vị trí, khung dashed, script chạy trong khung; tắt slot rồi tải lại thì biến mất; mở modal thanh toán khi có quảng cáo.
