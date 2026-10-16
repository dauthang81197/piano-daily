---
title: 'Khoá học piano: tiến độ học của người học (C2)'
type: 'feature'
created: '2026-10-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd535f15cd78cb4c9a00eb3aa15b366c8ae834646'
context:
  - '{implementation_artifacts}/spec-khoa-hoc-noi-dung.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Thẻ nhánh ở `/courses` đang hiện "x/y bài · 0%" cố định; người học không đánh dấu được bài đã học, không biết mình đang ở đâu trong lộ trình.

**Approach:** Khách đã đăng nhập (tài khoản khách hiện có) bấm "Đánh dấu hoàn thành" / "Bỏ đánh dấu" ở trang bài; tiến độ lưu theo tài khoản trong DB. Web lấy tiến độ ở trình duyệt (trang vẫn SSR và cache như cũ, không phụ thuộc người dùng) rồi hiện số bài/% thật ở thẻ nhánh, dấu hoàn thành và tiến độ theo level/section ở trang nhánh, nút "Tiếp tục học" (bài đầu tiên chưa học), và gợi ý bài tiếp theo chưa học ở trang bài. Khách chưa đăng nhập vẫn xem như cũ, tiến độ 0%, kèm nút mời đăng nhập.

## Boundaries & Constraints

**Always:**
- Bảng mới `course_lesson_progress` (migration viết tay): `customer_id` → `customers` và `lesson_id` → `course_lessons`, cả hai `ON DELETE CASCADE`; khoá chính (`customer_id`, `lesson_id`); `completed_at` timestamptz. Bỏ đánh dấu = xoá dòng. Bảng/cột cũ không đổi.
- API (qua `CustomerAuthGuard`, `@Public()` để bỏ guard admin, `Cache-Control: no-store`, throttle ThrottlerGuard theo IP): `GET /customer/courses/progress` → `{ tracks: [{ slug, completed }], lessonIds: string[] }`; `PUT /customer/courses/lessons/:id/completion` body `{ completed: boolean }` → `{ completed }`, idempotent (đánh dấu hai lần vẫn một dòng; bỏ dấu khi chưa có vẫn 200).
- Chỉ tính bài đang công khai ở đủ bốn cấp (dùng `VISIBLE_LESSON`): bài/section/level/nhánh bị ẩn hoặc xoá thì tự biến khỏi `lessonIds` và số đếm, bật lại thì tự trở lại; không cần dọn dữ liệu. `PUT` lên bài không công khai hoặc id sai dạng → 404 (không lộ bài ẩn). Không yêu cầu đã xác minh email; không phụ thuộc thuê bao.
- Web: một provider ở layout `/[locale]/courses` giữ tiến độ dùng chung cho thẻ, trang nhánh, trang bài (đánh dấu ở trang bài, quay lại trang nhánh thấy ngay). Chỉ tải khi `useCustomer()` là `authenticated`; đăng xuất/đổi tài khoản thì xoá sạch. Cập nhật lạc quan, lỗi thì hoàn lại và hiện thông báo. Trang công khai, cache tag `courses`, SEO, sitemap không đổi (không dữ liệu người dùng trong HTML cache).
- Hiển thị: thẻ nhánh = `completed/lessonCount` + % thật + thanh `role="progressbar"`; trang nhánh = dấu ✓ cạnh bài đã học (có chữ cho trình đọc màn hình, không chỉ màu), "x/y" ở level và section, nút "Tiếp tục học" trỏ tới bài chưa học đầu tiên theo thứ tự lộ trình ("Bắt đầu học" khi chưa học bài nào, ẩn khi đã học hết); trang bài = nút đánh dấu (`aria-pressed`) và, sau khi đã học, liên kết "Bài tiếp theo chưa học" (bài chưa học đầu tiên sau bài hiện tại, không có thì quay vòng lên bài chưa học đầu tiên; học hết thì thông báo hoàn thành nhánh). Chuỗi vi/en trong `messages`.
- Khách: nút "Đăng nhập để lưu tiến độ" mở modal đăng nhập có sẵn (`openAuth`); sau đăng nhập tiến độ tự tải.

**Never:**
- Không tự đánh dấu khi xem/phát video/nhạc; không lưu tiến độ ở localStorage cho khách; không chứng chỉ, huy hiệu, chuỗi ngày học; không nộp bài (C3), cộng đồng (C4), gating thuê bao (C5); không đưa tiến độ vào API công khai hay cache; không đổi schema API công khai hiện có.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Đánh dấu | Khách đăng nhập `PUT …/completion {completed:true}` bài công khai | 200 `{completed:true}`; thẻ/trang nhánh/trang bài cập nhật | N/A |
| Lặp lại | Gửi `true` lần hai | 200, vẫn một dòng | N/A |
| Bỏ dấu | `{completed:false}` | 200 `{completed:false}`; dòng bị xoá | N/A |
| Bài ẩn / lạ | Bài nháp, cha ẩn, id không tồn tại hoặc không phải uuid | Không ghi | 404 |
| Chưa đăng nhập | Gọi API không token | — | 401; web hiện "Đăng nhập để lưu tiến độ", tiến độ 0% |
| Body sai | `completed` thiếu hoặc không phải boolean | Không ghi | 400 |
| Ẩn sau khi học | Đã học bài rồi admin ẩn bài | Số đếm và `lessonIds` không còn bài đó; bật lại thì tính lại | N/A |
| Tiến độ theo nhánh | Học 3/10 bài nhánh A | Thẻ A "3/10 bài · 30%"; nhánh khác 0% | N/A |
| Tiếp tục học | Đã học bài 1, 2; chưa học bài 3 | Nút trỏ tới bài 3; học hết → ẩn nút, hiện thông báo hoàn thành | N/A |
| Lỗi mạng khi đánh dấu | Request thất bại | Trạng thái nút hoàn lại, hiện thông báo lỗi | Thử lại được |
| Đăng xuất | Đang có tiến độ | Xoá khỏi bộ nhớ, thẻ về 0% | N/A |
| Xoá bài / tài khoản | Bài hoặc khách bị xoá | Dòng tiến độ tự xoá theo (cascade) | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration mới `…_course_progress` -- model `CourseLessonProgress` (+ quan hệ ngược ở `Customer`, `CourseLesson`).
- `packages/shared/src/courses.ts` -- schema `courseProgressSchema`, body `setLessonCompletionSchema`.
- `apps/api/src/modules/courses/{course-progress.service.ts,customer-courses.controller.ts,courses.module.ts}` -- service + controller mới; module import `CustomersModule` để dùng `CustomerAuthGuard`; dùng `VISIBLE_LESSON`, `UuidParamPipe`, `CurrentCustomer`, mẫu `downloads.controller.ts`. Không đụng `public-courses.*`.
- `apps/api/test/integration/courses.spec.ts` (hoặc file mới) -- ma trận I/O.
- `apps/web/src/lib/customer-api.ts` -- `courseProgress`, `setLessonCompletion`.
- `apps/web/src/components/courses/progress-provider.tsx` (mới, client) + `apps/web/src/app/[locale]/courses/layout.tsx` (mới) -- ngữ cảnh tiến độ dựa trên `useCustomer()` (`getToken`, `status`).
- `apps/web/src/components/courses/{track-card,track-view,lesson-view}.tsx` -- thẻ/trang nhánh/trang bài; tách phần cần tiến độ thành client component nhỏ, phần còn lại giữ server. `app/[locale]/courses/[trackSlug]/[lessonId]/page.tsx` truyền thứ tự bài của nhánh (từ `fetchTrack`, đã cache) cho gợi ý bài kế.
- `apps/web/src/messages/{vi,en}.json` (`Courses`), test `courses.test.tsx`/`lib/courses.test.ts`, `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- bảng `course_lesson_progress`, FK cascade, index `lesson_id`
- [x] `packages/shared/src/courses.ts` -- schema phản hồi/body
- [x] `apps/api/src/modules/courses/**` -- service đếm theo bài công khai, endpoint GET/PUT, wiring module
- [x] `apps/api/test/**` -- integration theo ma trận (401, 404 bài ẩn/lạ, 400, idempotent, bỏ dấu, ẩn/bật lại, đếm theo nhánh, cô lập giữa hai khách, cascade xoá bài)
- [x] `apps/web/src/**` -- client API, provider + layout, thẻ nhánh, trang nhánh, trang bài, messages vi/en
- [x] `apps/web/src/**` -- test (khách vs đã đăng nhập, lạc quan + hoàn lại, nút Tiếp tục học, bài kế chưa học, a11y của dấu ✓)
- [x] `README.md`, `deferred-work.md`

**Acceptance Criteria:**
- Given khách đã đăng nhập đánh dấu hoàn thành bài, when mở `/courses`, then thẻ nhánh hiện số bài và % thật và dữ liệu giữ nguyên sau khi tải lại trang.
- Given khách chưa đăng nhập, when xem khoá học, then mọi trang vẫn xem được như cũ, tiến độ 0%, có nút mời đăng nhập, HTML công khai không chứa dữ liệu người dùng.
- Given hai khách khác nhau, then tiến độ của người này không lộ ra người kia.
- Given admin ẩn một bài đã học, then số đếm giảm tương ứng mà không cần chạy script.
- Lint, typecheck, build, test hiện có xanh.

## Implementation Notes

- Migration `20261018100000_course_progress`; `CoursesModule` import `CustomersModule` + `IdentityModule` (JwtService cho `CustomerAuthGuard`); 2 route mới thêm vào allowlist `@Public()`.
- Web: `course-progress.tsx` gom provider + các thành phần nhỏ (thẻ, dấu ✓, x/y, Tiếp tục học, panel đánh dấu); trang bài lấy thêm `fetchTrack` (đã cache) để có thứ tự bài.
- Kiểm chứng: lint, typecheck, build xanh; shared 295, web 802, API integration 619 (public-routes đạt sau khi cập nhật allowlist).

## Spec Change Log

## Review Triage Log

Ba reviewer (Blind Hunter, Edge Case Hunter, Verification Gap), không có phát hiện chặn.

**Đã vá:**
- Tải tiến độ lỗi không còn làm nút đánh dấu bị khoá vĩnh viễn (hiện như chưa học nhưng vẫn đánh dấu được).
- Đang khôi phục phiên đăng nhập: không còn hiện nhầm lời mời đăng nhập/nhấp nháy cho người đã đăng nhập.
- Hàng đợi PUT theo từng bài (server nhận đúng thứ tự bấm; chỉ lần bấm mới nhất được hoàn lại khi lỗi).
- Đăng xuất xoá hẳn tiến độ khỏi bộ nhớ (không chỉ che); lời mời đăng nhập thêm ở trang nhánh.
- API: token khách còn hạn nhưng tài khoản đã xoá → 401 (trước là 500 do khoá ngoại); bài bị xoá giữa lúc kiểm tra và ghi → 404.
- a11y: nút đánh dấu giữ nhãn cố định với `aria-pressed` (hết nhãn đảo nghĩa); "x/y" của level/section tách khỏi thẻ tiêu đề; mũi tên ẩn khỏi trình đọc màn hình; không gợi ý "bài kế/hoàn thành nhánh" khi bài không nằm trong thứ tự đã cache.
- Test thêm: đăng xuất thật, thử lại sau lỗi, tải lỗi vẫn đánh dấu, trạng thái đang khôi phục phiên, lời mời ở trang nhánh, quay vòng bài kế, thứ tự PUT, đếm tách nhánh, PUT no-store, khách chưa xác minh email, cha ẩn level/section, tài khoản đã xoá.

**Hoãn (`deferred-work.md`):** thẻ nhánh nhấp nháy 0% → giá trị thật khi phiên khôi phục; không tự thử lại khi tải tiến độ lỗi; cây cache cũ có thể trỏ tới bài vừa ẩn (404 tạm thời); nhãn "Tiếp tục học" khi học nhảy cóc; `get` chưa phân trang (đủ ở quy mô hiện tại); số nhiều tiếng Anh "1/1 lessons"; chưa test throttle 429 và HTML render phía server.
