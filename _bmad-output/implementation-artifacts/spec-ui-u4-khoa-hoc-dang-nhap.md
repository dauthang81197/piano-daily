---
title: 'UI/UX U4: khoá học, modal đăng nhập, ẩn thanh toán'
type: 'feature'
created: '2026-10-20'
status: 'in-review'
baseline_commit: '4b6c0e76fec3e6b9702acf96ffc2cd62e07831f7'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-u3-chi-tiet-sheet.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Ảnh `u4-before` (dữ liệu mẫu 1 khoá, 3 gói) cho thấy: `/courses` là một thẻ trơ trong lưới 3 cột, không có hero hay dấu nhấn; trang khoá (`/courses/<track>`) là cột 896px lệch trái với các hộp section giống nhau, danh sách bài chỉ là chữ + vài biểu tượng nhỏ, không phân biệt bài khoá/đã học; trang bài học là một cột dài (video, nội dung, nộp bài, bình luận) không có mục lục nên khó biết mình đang ở đâu; thẻ "bài bị khoá" là hộp viền mảnh; bảng giá là 3 thẻ phẳng, giá không nổi bật, tính năng là chữ rời, nút "Sắp có" nhạt; modal đăng nhập đúng chức năng nhưng bo/bóng khác phần còn lại, ở mobile là toàn màn hình với nửa dưới trống.

**Thay đổi theo yêu cầu founder (2026-10-20):** tạm ẩn mọi chức năng thanh toán để tập trung vào khoá học; KHÔNG làm lại giao diện bảng giá trong U4 (làm sau khi bật lại thanh toán). Ẩn bằng cờ `NEXT_PUBLIC_PAYMENTS_ENABLED` (mặc định tắt, đặt `true` lúc build để bật lại), chỉ phía giao diện: bỏ link Bảng giá (menu, footer, khối trang chủ), trang `/pricing` trả 404, không có nút mua/modal thanh toán ở Sheet có giá, bỏ dòng trạng thái gói ở header, bỏ link "xem gói" ở bài khoá/nộp bài/bình luận, không chuyển sang trang giá khi 402. API, dữ liệu, Sheet free không đổi.

**Approach:** Đưa các khu vực khoá học và modal về cùng ngôn ngữ thị giác với U0–U3 (`Card`, `Badge`, `Button`, `PageHeader`, `shadow-card`, `calloutCardClass`). `/courses`: hero có dấu nhấn brass, thẻ nhánh có biểu tượng + số bài + tiến độ. Trang khoá: header 2 cột (mô tả | thẻ tóm tắt + "Tiếp tục học"), mỗi level là một khối, mỗi section thu gọn được (`<details>`, mở sẵn), dòng bài có số thứ tự, trạng thái (đã học/khoá) rõ. Trang bài: từ `lg` 2 cột (nội dung | mục lục sticky của khoá, bài hiện tại nổi bật), khung video `rounded-xl`, thẻ mời đăng ký cho bài khoá. Modal đăng nhập: cùng bo/bóng với `Card`, ở mobile thành bottom sheet. Không đổi logic, API hay dữ liệu.

## Boundaries & Constraints

**Always:** Giữ toàn bộ hành vi: tiến độ ở trình duyệt (khách 0%, đăng nhập thì lấy tiến độ), `ContinueLearning`, bài khoá tải bản đầy đủ sau đăng nhập (401/402/lỗi), nộp bài/đánh giá/bình luận, các trạng thái rỗng (khoá rỗng, section rỗng, bảng giá chưa mở), lý do paywall (`reason`), nút chọn gói và VietQR/PayPal, focus trap + Esc + trả focus của modal; SSR + cache tag, SEO/JSON-LD, i18n vi/en (chuỗi mới vào `messages/{vi,en}.json`), focus ring brass, chạm ≥ 44px, `prefers-reduced-motion`, không tràn ngang ở 390/768/1280px, tương phản AA.

**Never:** Sửa `payment-modal`, `plan-checkout` (logic), `vietqr-panel`, `auth-provider`, `customer-api`, `course-progress` (logic) , `lesson-community`/`lesson-submission` (logic, chỉ lớp trình bày nếu cần); sửa `apps/api` ngoài `prisma/seed.ts` (dữ liệu mẫu dev); đổi màu/font/token; thêm thư viện; dùng bảng so sánh gói theo hàng/cột (dữ liệu gói không có danh sách tính năng thật); nhãn "phổ biến nhất" hay đếm "người đang học" (không có dữ liệu thật).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Danh sách khoá | ≥1 nhánh | Hero + lưới thẻ (1/2/3 cột theo màn hình), thẻ cả vùng bấm được | N/A |
| Chưa có khoá | 0 nhánh | Trạng thái rỗng dùng `EmptyState` | N/A |
| Trang khoá đủ dữ liệu | levels/sections/lessons | Header 2 cột từ `lg`; mỗi section `<details open>`; bài có số, biểu tượng nhạc/video/khoá, dấu đã học | N/A |
| Khoá không có level / section rỗng | rỗng | Thông báo rỗng như cũ, không lỗ trống | N/A |
| Bài mở | `locked=false` | 2 cột từ `lg`: nội dung trái, mục lục sticky phải (bài hiện tại `aria-current="page"`); mobile: mục lục thu gọn dưới nội dung | N/A |
| Bài khoá, khách | `locked`, chưa đăng nhập | Thẻ mời (biểu tượng khoá, nút Đăng nhập + Xem bảng giá) | N/A |
| Bài khoá, có gói | 200 | Hiện nội dung đầy đủ như cũ | 402/401/lỗi như cũ |
| Thanh toán ẩn (mặc định) | cờ tắt | Không link Bảng giá; `/pricing` 404; Sheet có giá không nút mua; không dòng trạng thái gói | N/A |
| Bật lại thanh toán | `NEXT_PUBLIC_PAYMENTS_ENABLED=true` | Mọi thứ như trước U4 | N/A |
| Modal đăng nhập | mọi tab | Bo `rounded-xl`, bóng thẻ; mobile: bottom sheet, desktop: giữa màn hình; focus/Esc như cũ | Lỗi vẫn nêu bằng chữ |
| Reduced motion | bật | Không chuyển động mới | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/seed.ts` -- đã thêm `seedCourses` (1 nhánh, 2 level, 3 section, 5 bài, bài đầu xem thử) và 3 gói giá, idempotent; chỉ dev. (Cờ `subscriptions_enabled` bật tay trong `site_settings`, không seed, vì bật cờ đổi hành vi thật.)
- `apps/web/scripts/shots.mjs` -- đã thêm trang `auth-modal` (mở modal từ header, chụp khung nhìn). README mục "Chụp ảnh giao diện": ghi thêm bật cờ thuê bao.
- `apps/web/src/app/[locale]/courses/page.tsx`, `components/courses/track-card.tsx` -- hero + thẻ nhánh (biểu tượng `GraduationCap`/`Layers`, số bài, tiến độ; `Card interactive`, giữ vùng bấm `after:absolute`).
- `components/courses/track-view.tsx` -- header 2 cột, thẻ tóm tắt (số bài, số level) + `ContinueLearning`; section dùng `<details open>` + `<summary>` (min-h-11, chevron xoay, `motion-reduce`); dòng bài có số, `LessonDoneMark`, khoá, nhạc, video, phút.
- `components/courses/lesson-view.tsx` -- từ `lg` lưới 2 cột `[minmax(0,1fr)_18rem]` (dùng `flex`/`grid` ngoài test hiện có kiểm tra), thẻ mục lục `LessonOutline` mới (từ `order`, đánh dấu bài hiện tại) sticky `lg:top-40`; mobile: `<details>` thu gọn. Nút prev/next dùng `buttonClasses`.
- `components/courses/{lesson-video,lesson-body,locked-lesson}.tsx` -- video `rounded-xl` + `shadow-card`; `LockedLesson` dùng `calloutCardClass` + `buttonClasses`.
- Ẩn thanh toán: `lib/public-env.ts` (`paymentsEnabled()`), `layout/{nav-links,footer}`, `home/course-pricing-band`, `app/[locale]/pricing/page`, `sheet/sheet-detail` (`purchase` + callout chỉ cho Sheet free), `auth/{header-auth,auth-provider}`, `courses/{locked-lesson,lesson-community,lesson-submission}`, `vitest.setup.ts` (test mặc định bật), `.env.example`, `shots.mjs` (chỉ chụp `pricing` khi cờ bật). Không đụng `pricing-view`/`plan-checkout`/`payment-modal`.
- `components/auth/auth-modal.tsx` -- lớp trình bày: `rounded-xl shadow-card-hover`, mobile bottom sheet (`items-end`, `rounded-t-xl`, `max-h-[90dvh]`), tiêu đề + phụ đề gọn; không đổi state/hàm/focus trap.
- `apps/web/src/messages/{vi,en}.json` -- khoá mới (tóm tắt khoá, mục lục, kỳ hạn gói).
- Test: thêm cho trạng thái ẩn (`header-footer`, `sheet-detail`); cập nhật/ thêm trong `courses.test.tsx`, `locked-lesson.test.tsx`, `auth.test.tsx`: section thu gọn được, mục lục đánh dấu bài hiện tại, modal vẫn giữ focus/Esc.
- Không đổi: `apps/admin`, `packages/*`, `components/payment/*`, `course-progress` (logic), `lib/*`.

## Tasks & Acceptance

**Execution:**
- [x] `seed.ts`, `shots.mjs` -- dữ liệu mẫu + ảnh `auth-modal`; chụp `u4-before`
- [x] `/courses`: hero + `TrackCard` + test
- [x] `track-view.tsx`: header 2 cột, section `<details>`, dòng bài + test
- [x] `lesson-view.tsx` + `LessonOutline` + `locked-lesson`/`lesson-video` + test
- [x] Ẩn thanh toán bằng cờ `NEXT_PUBLIC_PAYMENTS_ENABLED` + test
- [x] `auth-modal.tsx` (trình bày) + test hành vi
- [x] Chụp `u4-after` (+ bản có bài khoá nếu seed được), so với `u4-before`, sửa lỗi, founder duyệt ảnh

**Acceptance Criteria:**
- Given ảnh 4 trang (courses, track, lesson, auth-modal) ở 390/768/1280px, when kiểm tra, then không tràn ngang, không lớp phủ lỗi Next, bố cục đúng spec.
- Given test hiện có và mới, when chạy, then xanh; hành vi tiến độ, bài khoá, chọn gói, modal (focus/Esc) không đổi.
- Given người dùng bàn phím, when Tab qua trang khoá, then mỗi section mở/đóng được bằng Enter/Space và focus luôn thấy rõ; trang bài: thứ tự nội dung → mục lục → prev/next hợp lý.
- Given `prefers-reduced-motion`, then chevron/hover không chuyển động.

## Implementation Notes

Đã làm: (1) Ẩn thanh toán bằng `paymentsEnabled()` (`NEXT_PUBLIC_PAYMENTS_ENABLED`, mặc định tắt) ở menu, footer, khối trang chủ, `/pricing` (404), Sheet có giá (không nút mua; khối MIDI/MP3 chỉ cho Sheet free), dòng trạng thái gói, link "xem gói", chuyển trang giá khi 402; test mặc định bật (`vitest.setup.ts`), test riêng cho trạng thái ẩn. (2) `/courses` hero + `TrackCard` (biểu tượng, số bài, tiến độ). (3) Trang khoá: header 2 cột + thẻ tóm tắt, level đánh số, section `<details open>`, dòng bài có số. (4) Trang bài: `max-w-7xl`, 2 cột từ `lg`, `LessonOutline` sticky (`aria-current`), nút prev/next dùng `buttonClasses`; `LockedLesson` dùng thẻ chung; video `rounded-xl`. (5) Modal đăng nhập: `rounded-xl`, bóng thẻ, mobile bottom sheet. (6) Seed khoá/gói mẫu, `shots.mjs` thêm `auth-modal` và chỉ chụp `pricing` khi cờ bật.
Kết quả: web lint/typecheck/build xanh, 876 test. Ảnh `u4-after`: không tràn ngang, không lớp phủ lỗi Next. Chưa kiểm tay: bài khoá khi có gói, luồng thanh toán (đã ẩn). Lưu ý: nhãn cột footer "Học và gói" vẫn nhắc "gói" khi thanh toán ẩn (xử lý ở U5 cùng rà chữ).

## Spec Change Log

## Review Triage Log

## Design Notes

Khoá học là chỗ đầu tư lâu dài của người học nên cần định hướng ("mình ở đâu trong khoá"): mục lục sticky ở trang bài, số thứ tự và dấu đã học ở trang khoá. `<details>` thay accordion JS vì không cần thư viện, hoạt động không cần JS, truy cập bằng bàn phím sẵn. Thanh toán ẩn bằng cờ build-time thay vì xoá code: bật lại chỉ là đổi một biến, không mất UI và test đã có. Modal chỉ đổi bo/bóng/vị trí để cùng ngôn ngữ với U0–U3, không chạm logic hay modal thanh toán.

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build` (không nạp `.env` vào shell) -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label u4-after` -- expected: ảnh, không cảnh báo

**Manual checks (if no CLI):**
- So `u4-before` và `u4-after` ở 390/768/1280px; thử bài khoá khi có gói, modal thanh toán gói (VietQR/PayPal) bằng tay.
