---
title: 'Khoá học piano C5: gating theo thuê bao'
type: 'feature'
created: '2026-10-16'
status: 'in-review'
baseline_commit: '3109e651c3e7eb764737852616cc1e54241c6205'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khoá học đang miễn phí hoàn toàn; chưa có cách thu phí qua thuê bao S1–S4 đã có.

**Approach:** Khi enforcement thuê bao BẬT, bài học không đánh dấu "xem thử miễn phí" là bài khoá: API công khai và HTML cache chỉ trả tiêu đề, vị trí, thời lượng và cờ `locked`; video/nhạc/nội dung đầy đủ chỉ lấy được qua API của khách có gói ACTIVE còn hạn (tải ở trình duyệt). Nút ghi (nộp bài, bình luận, đánh giá) ở bài khoá cũng cần gói. Khi enforcement TẮT thì hành vi như hiện nay.

## Boundaries & Constraints

**Always:**
- Quyết định khoá lúc yêu cầu: `locked = enforcement BẬT && !isFreePreview`. Cột mới `course_lessons.is_free_preview` mặc định `false` (mọi bài hiện có sẽ khoá khi bật cờ cho tới khi admin bật xem thử).
- Có quyền = enforcement TẮT, hoặc bài xem thử, hoặc khách `is_active` có Subscription ACTIVE và `current_period_end > now` (mọi gói mở toàn bộ khoá học, bỏ qua hạn mức tải; dùng thử KHÔNG mở khoá). Không có quyền → 402 `PLAN_REQUIRED` (`details.reason`).
- `GET /courses/:slug/lessons/:id` với bài khoá trả `locked:true`, `youtubeUrl:null`, `content:''`, `midi:null`; bài không khoá trả như cũ với `locked:false`. Cây `GET /courses/:slug` thêm `locked` cho từng bài (cờ hiển thị ổ khoá). Không để lộ nội dung khoá ở bất kỳ API công khai nào (kể cả `noteJsonUrl`, `hasVideo`/`hasMusic` giữ nguyên vì chỉ là cờ).
- Nội dung đầy đủ: `GET /customer/courses/lessons/:id/full?locale=` (khách JWT, no-store) trả `{youtubeUrl, content, midi}` đúng định dạng/locale như API công khai; bài ẩn → 404, không quyền → 402.
- Ghi ở bài khoá cần quyền (402): đặt/sửa nộp bài, chấm sao, đăng và sửa bình luận. Gỡ/xoá dữ liệu của chính mình và đọc bình luận công khai luôn được; bài xem thử và lúc enforcement TẮT: như hiện nay.
- Đổi cờ enforcement hoặc `is_free_preview` phải revalidate tag web `courses` (lưu cài đặt thuê bao + mọi ghi bài đã có).
- Trang bài khoá: tiêu đề, breadcrumb, thời lượng, ổ khoá và lời mời (khách → đăng nhập; đã đăng nhập chưa có gói → link `/pricing`); khách có quyền thì web tải bản đầy đủ ở trình duyệt rồi hiện video/nhạc/nội dung. Chuỗi song ngữ vi/en; migration viết tay.

**Never:** gating theo từng gói/cấp; dùng thử mở khoá khoá học; dùng gói để giới hạn số bài xem; DRM/bảo vệ file ở S3 (URL note-JSON công khai nếu ai biết khoá); thu hồi tiến độ/bài nộp cũ; đổi hành vi C2–C4 khi enforcement TẮT.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Enforcement TẮT | bất kỳ bài | như cũ, `locked:false` mọi nơi | N/A |
| Bài xem thử | enforcement BẬT, `is_free_preview` | `locked:false`, đủ nội dung cho mọi người | N/A |
| Bài khoá, công khai/SSR | enforcement BẬT, không xem thử | `locked:true`, không video/nhạc/nội dung | N/A |
| Khách có gói | gói ACTIVE còn hạn | `/full` 200 đủ nội dung; ghi được | N/A |
| Khách không có quyền | không gói / gói hết hạn / chỉ dùng thử | `/full` và ghi → 402 `PLAN_REQUIRED` | Web hiện lời mời `/pricing` |
| Chưa đăng nhập | bài khoá | `/full` → 401 | Web hiện nút đăng nhập |
| Bài ẩn/lạ | bất kỳ | 404 | N/A |
| Hết hạn giữa chừng | gói hết hạn sau khi đã mở | lần tải/ghi kế tiếp 402 | N/A |
| Admin đổi cờ | bật/tắt xem thử hoặc enforcement | web thấy trạng thái mới sau revalidate | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration `20261021100000_course_free_preview` -- thêm `is_free_preview BOOLEAN NOT NULL DEFAULT false` vào `course_lessons`.
- `packages/shared/src/courses.ts` -- `lessonBodySchema` thêm `isFreePreview`; `adminLessonSchema` thêm `isFreePreview`; `publicLessonSchema` thêm `locked`; `publicLessonItemSchema` thêm `locked`; schema `lessonFullSchema` (`youtubeUrl`, `content`, `midi`).
- `apps/api/src/modules/courses/course-access.service.ts` (mới) -- `enforcementOn()`, `hasPlan(customerId)` (Subscription ACTIVE, `current_period_end > now`, khách `is_active`), `assertLessonAccess(customerId, lessonId)` (402 `PLAN_REQUIRED`); dùng `SettingsService.subscriptionConfig()` (module Settings export sẵn) và mẫu lỗi `paywall()` của `billing/entitlement.service.ts`.
- `public-courses.service.ts` -- `lesson()`/`tree()` tính `locked` và che nội dung; tách hàm dựng `content/midi` để dùng cho `/full`. `customer-courses.controller.ts` -- thêm `GET lessons/:id/full`. `course-submissions.service.ts`, `course-community.service.ts` -- gọi `assertLessonAccess` ở `upsert`, `setRating`, `create`, `edit`. `courses.service.ts` -- nhận/lưu `isFreePreview`, trả ra admin DTO. `settings/settings.service.ts` -- thêm tag `courses` vào `cache.notify` khi lưu cài đặt. `courses.module.ts` -- import `SettingsModule`.
- Web: `lib/customer-api.ts` (`lessonFull`), `components/courses/lesson-view.tsx` + `lesson-gate.tsx` (mới: tải bản đầy đủ/hiện lời mời), `track-view.tsx` (ổ khoá cạnh bài), `lesson-submission.tsx`/`lesson-community.tsx` (lỗi 402 → lời mời gói), `messages/{vi,en}.json`.
- Admin: `lesson-form.tsx` (công tắc "Xem thử miễn phí"), `course-tree-editor.tsx` (nhãn "Xem thử"), test.
- Không đổi: entitlement tải Sheet, thanh toán, tiến độ C2.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration viết tay -- cột `is_free_preview`
- [x] `packages/shared/src/courses.ts` (+ spec) -- schema/type mới
- [x] `course-access.service.ts` + sửa public/customer controllers, submissions, community, courses service, settings notify, module -- áp quyền
- [x] `courses.spec.ts` -- integration phủ ma trận (bật/tắt enforcement qua `site_settings`, gói hết hạn, dùng thử không mở, 402/401/404, che nội dung ở API công khai, ghi bị khoá, revalidate tag)
- [x] web: `lessonFull`, `lesson-gate.tsx`, ổ khoá ở cây, lỗi 402 ở nộp bài/bình luận, messages (+ test jsdom)
- [x] admin: công tắc xem thử + nhãn (+ test)
- [x] `README.md`, `deferred-work.md`

**Acceptance Criteria:**
- Given enforcement BẬT và bài chưa xem thử, when khách ẩn danh gọi API công khai bài đó, then không có youtubeUrl/content/midi nào trong phản hồi.
- Given khách có gói ACTIVE còn hạn, when mở bài khoá, then thấy video/nhạc/nội dung và nộp bài/bình luận được.
- Given khách chỉ trong dùng thử hoặc gói đã hết hạn, when mở/ghi bài khoá, then nhận 402 và web hiện lời mời `/pricing`.
- Given enforcement TẮT, when ai cũng mở mọi bài, then hành vi y hệt trước C5.

## Implementation Notes

- `CourseAccessService` (module courses, dùng `SettingsService.subscriptionConfig()`) là nơi duy nhất quyết định khoá/quyền; `PublicCoursesService` dùng `enforcementOn()` để tính `locked`, controller khách dùng `assertLessonAccess` cho `/full`, các service ghi gọi nó sau `assertVisible`.
- Lỗi 402 dùng thông điệp riêng cho khoá học (mặc định của `PLAN_REQUIRED` nói về "tải"), `details.reason = 'PLAN_REQUIRED'` như luồng tải Sheet.
- Web: `LessonBody` (chung cho bài mở SSR và bài khoá sau khi tải) + `LockedLesson` (client). `PublicLesson.locked` bắt buộc; test cũ dùng fixture không có `locked` vẫn chạy như bài mở.
- Test integration bật cưỡng chế bằng cách ghi `site_settings.subscriptions_enabled` và dọn lại trong `beforeEach`/`afterAll` để không ảnh hưởng file khác.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: xanh
- `pnpm test` (shared, web, admin) và integration API (`POSTGRES_TEST_PORT=55433`) -- expected: pass
