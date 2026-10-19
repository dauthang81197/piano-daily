---
title: 'UI/UX U2: catalog (thẻ Sheet, lưới, bộ lọc, trạng thái)'
type: 'feature'
created: '2026-10-19'
status: 'in-review'
baseline_commit: '1533b093a6f8d6904c42a7ceba96f2d129eb6851'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ảnh `u2-before` cho thấy: thẻ Sheet cao và phẳng (trang PDF trắng tràn cả khung, không có chiều sâu), ở mobile mỗi thẻ chiếm gần cả màn hình nên danh sách rất dài; tag Genre xuống dòng thành nhiều hàng; ba ô chọn lọc xếp dọc; trạng thái rỗng chỉ là chữ; skeleton và `Badge` lặp lại chuỗi class riêng; chữ trắng trên nhãn "Nâng cao" (#a97d2f) chỉ đạt ~3.7:1, dưới chuẩn AA 4.5:1.

**Approach:** Làm lại `SheetCard` dùng `Card`/`Badge` của U0: ảnh trang đặt như tờ giấy trên nền ngà (đệm, bóng, cắt từ đầu trang, tỉ lệ 4/5), hiệu ứng phóng nhẹ khi hover; ở `< sm` thẻ nằm ngang (ảnh trái, chữ phải) để quét danh sách nhanh. Tag Genre thành viên thuốc cuộn ngang một hàng ở mobile; sắp xếp dạng nhóm nút; bộ lọc Search 2 cột ở mobile; trạng thái rỗng có biểu tượng và nút hành động; skeleton theo đúng hình thẻ mới; phân trang có mũi tên. Nhãn "Nâng cao" dùng token màu đậm hơn để đạt AA.

## Boundaries & Constraints

**Always:** Giữ hành vi hiện có: thẻ bấm cả vùng (stretched link, link Composer `z-10`), nút nghe thử `CardPreviewButton` (luôn hiện ở cảm ứng), phân trang theo số trang, `aria-current` của tag/sort, SSR + cache tag; i18n vi/en; focus ring brass, chạm ≥ 44px, `prefers-reduced-motion`; không tràn ngang ở 390/768/1280px; thumbnail thiếu thì có placeholder.

**Never:** Đổi màu hiện có hay font; đổi API/DB; infinite scroll; thêm thư viện; sửa trang chi tiết Sheet (U3) hay khoá học (U4); đổi giá trị token đã có (chỉ thêm token mới).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Thẻ có ảnh | `thumbnailUrl` | Ảnh trong khung giấy có bóng, `alt` như cũ, `loading="lazy"` | N/A |
| Thẻ không ảnh | `thumbnailUrl` null | Placeholder biểu tượng nhạc + chữ "Chưa có bản xem trước" | N/A |
| Mobile | `< sm` | Thẻ nằm ngang, ảnh ~112px bên trái; tiêu đề, composer, lượt xem, định dạng bên phải; nút nghe thử vẫn thấy | N/A |
| Nhãn cấp độ | 4 level + HOT | `Badge` cùng tông cũ; "Nâng cao" dùng màu đậm (tương phản ≥ 4.5:1) | N/A |
| Genre nhiều tag | Vượt bề ngang mobile | Một hàng cuộn ngang, tag đang chọn cuộn vào vùng nhìn | N/A |
| Không kết quả | `items` rỗng (Level/Search/Composer/Genre) | Khối có biểu tượng, tiêu đề, gợi ý, nút "bỏ lọc" (nếu có) và liên kết Level | N/A |
| Phân trang | 1 trang / nhiều trang | Một trang: không hiện; nhiều: nút Trước/Sau có mũi tên, trang hiện tại nổi bật, `rel prev/next` giữ nguyên | N/A |
| Đang tải | `loading.tsx` | Skeleton cùng số cột và hình dạng thẻ mới (cả dạng ngang ở mobile) | N/A |
| Reduced motion | Bật | Không phóng ảnh, không chuyển bóng | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/catalog/sheet-card.tsx` -- viết lại bố cục; bỏ `LEVEL_BADGE`/`badge` export (kiểm mọi nơi import trước khi xoá); dùng `Card interactive`, `Badge`; giữ stretched link và `CardPreviewButton`.
- `apps/web/src/components/ui/badge.tsx` + `packages/tokens/theme.css` -- thêm token `--color-level-advanced-strong: #86611f` (chỉ thêm), `Badge tone="advanced"` dùng nó; thêm hàm/map `levelTone(level)` dùng chung.
- `apps/web/src/components/catalog/{sheet-card-skeleton,sheet-grid}.tsx` -- skeleton dùng `Skeleton`/`Card`, hai dạng; `SHEET_GRID_CLASS` giữ 1/2/3 cột (mobile 1 cột nhưng thẻ ngang).
- `apps/web/src/components/catalog/{genre-tags,sort-links,pagination,search-filters,level-links}.tsx` -- tag viên thuốc cuộn ngang, nhóm nút sắp xếp, mũi tên phân trang, lưới lọc `grid-cols-2 md:grid-cols-3`.
- `apps/web/src/components/catalog/empty-state.tsx` -- mới: biểu tượng (lucide), tiêu đề, gợi ý, vùng hành động; dùng ở 4 trang.
- `apps/web/src/app/[locale]/{level/[level],search,composer/[slug],genre/[slug]}/page.tsx` và `loading.tsx` -- thay khối rỗng bằng `EmptyState`; dùng skeleton mới. Đọc từng trang để giữ nguyên props/logic.
- `apps/web/src/components/home/level-cards.tsx` -- đã dùng viền màu; không đổi.
- `apps/web/src/messages/{vi,en}.json` -- chỉ thêm khoá nếu cần (nhãn placeholder, tên nhóm).
- Test: `catalog.test.tsx` và test các trang liên quan; thêm test `empty-state`, `Badge` tone advanced, thẻ không ảnh, `aria-current`. Test hiện có kiểm class (vd. `bg-level-*`) phải cập nhật theo hành vi mới.
- Không đổi: `apps/api`, `apps/admin`, `packages/shared`, `card-preview-button.tsx` (chỉ định vị lại bằng class cha).

## Tasks & Acceptance

**Execution:**
- [x] `theme.css`, `badge.tsx` -- token màu đậm cho "Nâng cao", map `levelTone` -- đạt AA
- [x] `sheet-card.tsx`, `sheet-card-skeleton.tsx`, `sheet-grid.tsx` + test -- thẻ mới 2 dạng
- [x] `genre-tags`, `sort-links`, `pagination`, `search-filters` + test -- thanh điều khiển
- [x] `empty-state.tsx` + 4 trang + `loading.tsx` + test -- trạng thái rỗng, đang tải
- [x] Chụp `u2-after` ở 390/768/1280px, so với `u2-before`, sửa lỗi nhìn thấy -- founder duyệt ảnh

**Acceptance Criteria:**
- Given ảnh chụp Level/Search/Composer/Genre/Search-empty ở 3 cỡ, when kiểm tra, then không tràn ngang, không chữ bị cắt/chồng, thẻ mobile nằm ngang và danh sách ngắn hơn rõ rệt so với `u2-before`.
- Given người dùng bàn phím, when Tab qua thẻ, then mỗi thẻ có đúng một điểm dừng cho link bài, link Composer và nút nghe thử có focus rõ; Enter mở trang bài.
- Given nhãn "Nâng cao", when đo, then chữ/nền ≥ 4.5:1.
- Given reduced-motion, when hover thẻ, then không phóng ảnh.

## Implementation Notes

Đã làm đúng spec: token `level-advanced-strong` + `Badge` dùng nó và `levelTone`; `buttonClasses` (để gắn lên `Link`); `SheetCard` mới (Card/Badge, ảnh như tờ giấy 4/5, ngang ở `< sm`, placeholder có biểu tượng, hover phóng nhẹ tắt khi reduced-motion); skeleton 2 dạng; `GenreTags` viên thuốc cuộn ngang + `GenreScroller` (client, chỉ nhận children); `SortLinks` dạng nhóm nút; phân trang có mũi tên; bộ lọc Search 2 cột ở mobile; `EmptyState` cho Level/Search/Composer/Genre; `sheet-detail.tsx` dùng `Badge` (bỏ `LEVEL_BADGE`). Web: lint, typecheck, build, 866 test xanh; admin build xanh.

Lỗi bắt được nhờ chụp ảnh thật (jsdom không thấy): bản đầu biến `GenreTags` thành Client Component nên trang lỗi "Functions cannot be passed directly to Client Components" (truyền `hrefFor`). Đã tách phần cuộn ra `GenreScroller` chỉ nhận `children`; `scripts/shots.mjs` nay coi lớp phủ lỗi Next là trang lỗi (dev vẫn trả 200).

Ảnh duyệt: `apps/web/.shots/u2-before` và `u2-after` (12 trang × 3 cỡ, không tràn ngang). Chưa kiểm: thẻ có `CardPreviewButton` bấm thật (seed không có note JSON hợp lệ trong ảnh), Composer/Genre khi rỗng.

## Spec Change Log

## Review Triage Log

## Design Notes

Ảnh trang PDF có nền trắng nên đặt trên nền ngà `surface-container` với đệm và bóng để giống tờ giấy; cắt từ đầu trang (`object-top`, tỉ lệ 4/5) vì phần nhạc bắt đầu ở trên và thẻ ngắn đi. Thẻ ngang ở mobile dựa trên quan sát: danh sách nhạc quét theo tên/composer nhiều hơn xem ảnh lớn. Màu đậm riêng cho "Nâng cao" thay vì đổi `level-advanced` để không ảnh hưởng admin và các chỗ dùng màu làm viền.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build && pnpm --filter @piano-daily/admin build` (không nạp `.env` vào shell) -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label u2-after` -- expected: ảnh, không cảnh báo tràn ngang

**Manual checks (if no CLI):**
- So `u2-before` và `u2-after` ở 390/768/1280px.
