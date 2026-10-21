---
title: 'UI/UX: trang Bản nhạc full width có bộ lọc bên trái, header gọn (Scores / Courses)'
type: 'feature'
created: '2026-10-21'
status: 'in-review'
baseline_commit: '696d173'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-u2-catalog.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-u1-khung-trang-chu.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Các trang danh sách Sheet (`/search`, `/level/*`, `/genre/*`, `/composer/*`) nằm trong cột `max-w-7xl`, bộ lọc là một form ngang ở đầu trang (ô chọn Level/Composer/định dạng, chip Genre rời rạc), nên khó duyệt kho nhạc lớn và lãng phí chiều ngang màn hình rộng. Header có 6 mục (4 level, Khoá học, PDF sang MIDI) chiếm một hàng riêng. Founder muốn trải nghiệm kiểu MuseScore (ảnh mẫu): giao diện rộng hết cỡ, bộ lọc ở cột trái, header chỉ còn vài mục chính.

**Approach (đã chốt với founder):** (1) Header chỉ còn hai mục **Bản nhạc** (Scores, `/search`) và **Khoá học** (Courses), nằm cùng hàng với logo, ô tìm kiếm, ngôn ngữ, đăng nhập (header thấp hơn, một hàng); bốn level chuyển thành nhóm "Độ khó" của bộ lọc; "PDF sang MIDI" rời header, nằm ở footer và có nút trên trang Bản nhạc. (2) Header và footer dàn hết chiều ngang toàn site. (3) Các trang lưới Sheet dùng chung bố cục hai cột full width: **cột trái là bộ lọc** (Độ khó, Thể loại, Tác giả, Định dạng; mỗi nhóm chọn tối đa một mục, kèm số lượng nếu có), **cột phải là kết quả** (ô tìm kiếm, nhãn đang lọc, sắp xếp, lưới thẻ nhiều cột theo bề rộng, phân trang). Dưới `lg` bộ lọc thu thành nút "Bộ lọc" mở/đóng phía trên kết quả. (4) Trang chủ giữ nguyên nội dung, chỉ header/footer đổi theo; thẻ level trên trang chủ trỏ sang trang Bản nhạc đã lọc. Không đổi API, dữ liệu hay hợp đồng.

## Boundaries & Constraints

**Always:**
- Mọi lựa chọn lọc là link thuần (không JS để lọc): URL phản ánh trạng thái (`/search?level=&genre=&composer=&format=&q=&sort=`), có `aria-current` cho mục đang chọn, bấm lại mục đang chọn thì bỏ lọc (mỗi nhóm tối đa một mục), mọi thay đổi bộ lọc đặt lại `page`. Dùng lại `searchHref`/`SearchQueryState` và các hàm parse hiện có; `sort` giữ khi đổi bộ lọc.
- SEO và cache giữ nguyên: trang `/level/<slug>`, `/genre/<slug>`, `/composer/<slug>` vẫn tồn tại với tiêu đề, metadata, JSON-LD, phân trang như cũ (có thể indexable), nhưng dùng cùng bố cục có bộ lọc; từ các trang này, chọn nhóm khác dẫn sang `/search?...` đã hợp nhất bộ lọc hiện tại. Trang `/search` có bộ lọc vẫn `noindex, follow`.
- Số lượng: Thể loại và Tác giả lấy từ `fetchFacets()` (`count`), Độ khó từ `fetchLevelSummary` (4 lời gọi như trang chủ, có `orElse` + log); Định dạng không có số (API không trả). Thiếu dữ liệu thì ẩn số, không ẩn nhóm; nhóm rỗng (không có mục) thì ẩn nhóm.
- Nhóm dài (Thể loại, Tác giả) hiện tối đa 8 mục đầu và "Xem tất cả/Thu gọn" bằng `<details>` (mục đang chọn luôn hiện, kể cả khi nằm ngoài 8 mục đầu).
- Sidebar dính từ `lg` (`sticky`, cuộn riêng nếu dài) dưới header mới; dưới `lg` là nút "Bộ lọc" (hiện số bộ lọc đang áp dụng) bật/tắt panel; panel đóng khi điều hướng.
- Giữ: skeleton `loading.tsx` đúng bố cục mới, `EmptyState` (kèm nút bỏ từng bộ lọc), `SortLinks`, `Pagination`, quảng cáo `AdSlotFrame` của trang tìm kiếm, thẻ Sheet và nút nghe thử, `GenreScroller` (nếu còn dùng), i18n vi/en, focus ring, vùng chạm ≥ 44px, AA, reduced-motion, không tràn ngang ở 390/768/1280/1920px.
- Thanh điều hướng chính: **Bản nhạc** active ở `/search`, `/level/*`, `/genre/*`, `/composer/*`, `/sheet/*`; **Khoá học** active ở `/courses/*`; `aria-current="page"`; menu mobile cùng hai mục.
- Chiều cao header mới được phản ánh ở mọi nơi dùng `sticky top-*`/`scroll-mt-*` dưới header (sidebar trang Sheet, mục lục bài học, đích skip link).

**Never:** Đổi API/DB/`packages/shared`; thêm lọc nhiều giá trị cùng nhóm; thêm thư viện; đổi token; gỡ trang `/level|genre|composer` hay đổi URL của chúng; đổi trang chi tiết Sheet, khoá học, thanh toán, player ngoài chiều cao sticky; làm `/search` thành trang chủ.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Vào Bản nhạc | `/search` | Hai cột full width: bộ lọc trái, lưới phải; header chỉ Bản nhạc + Khoá học | N/A |
| Chọn một mục | Bấm "Beginner" | `/search?level=beginner`, mục đánh dấu, nhãn đang lọc, lưới đổi, `page` về 1 | N/A |
| Bỏ mục | Bấm lại mục đang chọn | Bỏ lọc của nhóm đó, các nhóm khác giữ | N/A |
| Kết hợp | Level + Genre + Composer + Format + q | Cùng lúc áp dụng (mỗi nhóm một mục), `sort` giữ | slug lạ bị bỏ như hiện nay |
| Từ trang level | `/level/beginner` | Cùng bố cục, "Độ khó: Beginner" đã chọn; chọn Thể loại → `/search?level=beginner&genre=…` | N/A |
| Không có kết quả | Lọc ra 0 Sheet | `EmptyState` + nút bỏ từng bộ lọc; bộ lọc vẫn hiện để đổi | N/A |
| Thiếu facets/summary | API lỗi | Nhóm tương ứng ẩn số (hoặc ẩn nhóm nếu không có mục); trang không lỗi | Log lỗi, không ném |
| Nhóm dài | > 8 Thể loại/Tác giả | 8 mục đầu + "Xem tất cả"; mục đang chọn luôn thấy | N/A |
| Mobile (< lg) | 390px | Nút "Bộ lọc (n)" trên kết quả; panel mở thấy các nhóm; chọn mục thì điều hướng và đóng panel | N/A |
| Màn hình rất rộng | 1920px | Lưới tăng số cột theo bề rộng, không kéo dãn thẻ vô hạn | N/A |
| Trang chủ | `/` | Nội dung như cũ; header gọn; thẻ level dẫn tới `/search?level=` | N/A |
| Điều hướng bàn phím | Tab | Skip link → header → bộ lọc → kết quả; focus thấy rõ; mục đang chọn đọc được là đang chọn | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/layout/header.tsx` -- một hàng ở `md+`: logo | nav (Bản nhạc, Khoá học) | ô tìm kiếm | ngôn ngữ + đăng nhập; container full width (bỏ `max-w-7xl`), giữ `px-margin-*`.
- `apps/web/src/components/layout/nav-links.tsx` -- chỉ hai mục; `isActivePath` mở rộng cho nhóm tiền tố (Bản nhạc: `/search`, `/level`, `/genre`, `/composer`, `/sheet`); bỏ `LEVELS`; `mobile-menu.tsx` theo.
- `apps/web/src/components/layout/footer.tsx` -- full width; giữ cột Trình độ (link `/search?level=`) và "Học" kèm "PDF sang MIDI" (đã có).
- `apps/web/src/components/catalog/catalog-shell.tsx` (mới) -- bố cục hai cột full width (`lg:grid-cols-[18rem_minmax(0,1fr)]`), cột trái sticky; `filter-drawer.tsx` (mới, client) nút Bộ lọc + panel dưới `lg`.
- `apps/web/src/components/catalog/filter-sidebar.tsx` (mới, server) -- nhóm Độ khó / Thể loại / Tác giả / Định dạng, mục là `Link` (icon ô chọn trang trí, `aria-current`), "Xem tất cả" bằng `<details>`; nhận `state: SearchQueryState`, `facets`, `levelCounts`, `hrefFor`.
- `apps/web/src/components/catalog/search-filters.tsx` -- rút còn ô tìm kiếm (+ giữ các lọc khác bằng input ẩn); `genre-tags.tsx`/`level-links.tsx` bớt dùng ở trang lưới (giữ file nếu còn nơi dùng).
- `apps/web/src/app/[locale]/search/page.tsx` + `loading.tsx` -- dùng `CatalogShell`; thêm nút "Chuyển PDF sang MIDI"; lấy `levelCounts`.
- `apps/web/src/app/[locale]/{level/[level],genre/[slug],composer/[slug]}/page.tsx` + `loading.tsx` -- cùng bố cục; sidebar ở chế độ "từ trang chuyên biệt" (mục đã chọn theo trang, link nhóm khác sang `/search`).
- `apps/web/src/components/catalog/sheet-grid.tsx` -- `SHEET_GRID_CLASS` nhiều cột hơn (`grid-cols-[repeat(auto-fill,minmax(15rem,1fr))]` hoặc breakpoint tới `2xl`); skeleton dùng chung.
- `apps/web/src/components/home/{hero,level-cards,...}.tsx` -- thẻ level trỏ `/search?level=`; không đổi bố cục khác. `app/[locale]/layout.tsx` -- `scroll-mt` đích skip link theo header mới; `sheet-detail.tsx`, `lesson-view.tsx`/`lesson-outline.tsx` -- `lg:top-*` theo chiều cao header mới.
- `apps/web/src/messages/{vi,en}.json` -- `Nav.scores`, `Filters.*` (tiêu đề nhóm, "Xem tất cả", "Thu gọn", nút Bộ lọc, nhãn "đang chọn").
- Test: cập nhật `header-footer`, `nav-links`, `page.test` (search/level/genre/composer/home), `catalog.test`, `shots-script`; thêm test cho `FilterSidebar` (mục chọn/bỏ, kết hợp, "Xem tất cả", mục đã chọn nằm ngoài 8 đầu, thiếu số), `isActivePath`, drawer (mở/đóng, đóng khi điều hướng).
- Không đổi: `apps/api`, `apps/admin`, `packages/*`, trang chi tiết Sheet (ngoài sticky), khoá học, thanh toán, player.

## Tasks & Acceptance

**Execution:**
- [x] Header một hàng với Bản nhạc / Khoá học; mobile menu; `isActivePath` nhóm; header/footer full width; chỉnh `sticky`/`scroll-mt` theo chiều cao mới
- [x] `CatalogShell` + `FilterSidebar` + `FilterDrawer` + i18n + test
- [x] Áp bố cục cho `/search`, `/level`, `/genre`, `/composer` (+ `loading.tsx`), nút PDF sang MIDI, lưới nhiều cột
- [x] Trang chủ: thẻ level → `/search?level=`; cập nhật test
- [x] Chụp `shots` 390/768/1280 (+1920) trước/sau, sửa lỗi, kiểm tra bàn phím, so với ảnh mẫu

**Acceptance Criteria:**
- Given `/search`, when mở ở ≥ lg, then bộ lọc ở cột trái (Độ khó, Thể loại, Tác giả, Định dạng), kết quả full width, header chỉ Bản nhạc + Khoá học trên một hàng.
- Given một mục lọc, when bấm, then URL/kết quả/đánh dấu đổi và bấm lại thì bỏ; kết hợp nhiều nhóm hoạt động; `page` về 1; `sort` giữ.
- Given `/level/beginner` (hoặc genre/composer), when mở, then bố cục giống `/search` và vẫn có tiêu đề/metadata/phân trang như trước.
- Given 390px, when mở trang Bản nhạc, then có nút "Bộ lọc (n)", panel mở/đóng được, không tràn ngang; 1920px: không kéo dãn bất thường.
- Given thiếu facets hoặc summary, then trang vẫn hiển thị, không số lượng/nhóm tương ứng.
- Given test/lint/typecheck/build của web, then xanh; AA, bàn phím, reduced-motion như U0–U5.

## Implementation Notes

Đã làm đúng spec. Header một hàng (logo | Bản nhạc, Khoá học | ô tìm | ngôn ngữ, đăng nhập), header/footer full width; `isActivePath` theo nhóm tiền tố (Bản nhạc sáng ở `/search`, `/level`, `/genre`, `/composer`, `/sheet`; không khớp tiền tố giả). `CatalogShell` (aside sticky từ `lg` + `<main>`), `FilterSidebar` (server; nhóm Độ khó, Thể loại, Tác giả, Định dạng; link thuần, `aria-current` + chữ "đang chọn", 8 mục đầu + "Xem tất cả" bằng `<details>`, mục đang chọn luôn hiện), `FilterDrawer` (client; nút "Bộ lọc (n)" dưới `lg`, đóng khi bấm link), `lib/filter-groups.ts` (dựng nhóm, mỗi nhóm một mục, giữ q/sort, bỏ page) và `lib/filter-data.ts` (facets + số level, lỗi API thì ẩn số/nhóm, có log). `/search`, `/level`, `/genre`, `/composer` dùng chung bố cục (giữ nguyên URL, metadata, phân trang); từ trang chuyên biệt, link lọc dẫn tới `/search?...` đã gộp bộ lọc. `SearchFilters` còn ô tìm kiếm (+ input ẩn giữ bộ lọc); `GenreTags` không còn dùng ở trang lưới (giữ file). Lưới thẻ tự chia cột (`auto-fill, minmax(15rem, 1fr)` từ `sm`). Nút "PDF sang MIDI" ở đầu trang Bản nhạc; footer link level trỏ `/search?level=`. `sticky top-24` cho sidebar trang Sheet và mục lục bài học, `scroll-mt-20` cho skip link. Thẻ level trang chủ trỏ `/search?level=` (CTA hero vẫn tới `/level/...`).
**Kiểm chứng:** web lint/typecheck/build xanh, 941+ test (cập nhật test header/nav/footer/mobile-menu/trang; thêm test `buildFilterGroups`, `FilterSidebar`, `CatalogShell`/`FilterDrawer`). Ảnh `catalog-after` 390/768/1280 không tràn ngang, không lỗi; 1920px: 5 cột, không tràn ngang. **Chưa kiểm chứng:** Safari/iOS, trình đọc màn hình thật với danh sách bộ lọc, trang `/level`, `/genre`, `/composer` bằng mắt (cùng bố cục nhưng chưa xem từng trang).

## Spec Change Log

## Review Triage Log

## Design Notes

Bộ lọc chọn một mục mỗi nhóm bằng link thuần (không checkbox thật) vì API tìm kiếm chỉ nhận một giá trị mỗi nhóm; giữ link thuần cũng giữ SSR, cache theo URL và điều hướng bàn phím/trình đọc màn hình đơn giản. Hình ô chọn chỉ là trang trí, trạng thái dựa vào `aria-current`. Level chuyển hẳn vào bộ lọc nên header không còn cần 4 mục level; các trang `/level|genre|composer` giữ nguyên để không mất SEO và liên kết cũ. Header một hàng làm chiều cao header giảm khoảng một nửa, nên các `sticky top-*` đang tính theo header hai hàng phải chỉnh theo.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` (không nạp `.env` vào shell) -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label catalog-after` -- expected: ảnh, không cảnh báo tràn ngang hay lớp phủ lỗi Next

**Manual checks (if no CLI):**
- So ảnh trước/sau ở 390/768/1280px (và 1920px) với ảnh mẫu; thử bộ lọc kết hợp, "Xem tất cả", panel mobile, điều hướng bàn phím.
