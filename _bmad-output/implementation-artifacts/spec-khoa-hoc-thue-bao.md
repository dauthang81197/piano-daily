---
title: 'Khoá học piano C5: gating theo thuê bao'
type: 'feature'
created: '2026-10-16'
status: 'done'
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

| # | Phát hiện | Verdict | Xử lý / bằng chứng |
|---|-----------|---------|--------------------|
| 1 | `isFreePreview` có `.default(false)` nên sửa bài từ client cũ/script không gửi trường sẽ tắt xem thử và khoá lại bài khi enforcement BẬT (Blind, Edge) | high | patch: trường tuỳ chọn, vắng thì giữ nguyên; tạo mới mặc định false ở DB; thêm test sửa không gửi trường |
| 2 | Test "chỉ dùng thử" trống rỗng: chỉ đếm khách đã xác minh, không chứng minh đang dùng thử (Blind, Edge, Gap) | medium | patch: gọi `/customer/entitlement` xác nhận `trial.active=true` rồi mới kiểm 402 |
| 3 | Web: `/full` trả 401 (phiên hết hạn) hiện lỗi chung, không có đường đăng nhập lại (Blind, Edge) | medium | patch: trạng thái `login` → nút đăng nhập; thêm test |
| 4 | Web: một lần render còn kết quả/trạng thái của khách trước khi effect reset (Edge) | low | patch: mọi trạng thái mang `owner`, khác chủ coi như đang tải |
| 5 | Lỗi 402 ở nộp bài/bình luận/sao chỉ có chữ, không có đường tới `/pricing` (Edge, claim) | medium | patch: thêm link "Xem các gói"; thêm assert |
| 6 | Không test `/full` khi cha (section/level) bị ẩn (Gap) | low | patch: thêm vào test 404 |
| 7 | Wrapper `customerApi.lessonFull` (đường dẫn, locale, Bearer, parse) chỉ test sau mock (Gap) | medium | patch: `customer-api.test.ts` với `fetch` giả |
| 8 | `/full` không giới hạn tốc độ (Blind, Edge) | false | controller khách có `@Throttle` 60/phút ở cấp class, áp cho cả GET `/full` |
| 9 | Sửa bình luận ở bài đã ẩn trả 404 thay vì cho sửa (Edge) | false | từ C4 `edit` vốn đã yêu cầu bài công khai (`lesson: VISIBLE_LESSON`); C5 không đổi hành vi này |
| 10 | Tiến độ (C2) không bị khoá ở bài khoá (Blind, Gap) | false | cố ý: spec chỉ khoá nội dung và hành động cộng đồng; ghi nhận ở deferred |
| 11 | Metadata/JSON-LD/sitemap có thể lộ nội dung bài khoá (Blind) | false | `generateMetadata` dùng `lesson.content` từ API công khai, vốn đã là `''` với bài khoá; sitemap chỉ có id/ngày |
| 12 | Đọc submission/community "của tôi" ở bài khoá (Edge) | false | chỉ trả dữ liệu của chính khách; không lộ gì của người khác |
| 13 | DTO bài khoá vẫn có cờ `hasVideo`/`hasMusic` ở cây (Edge) | false | cố ý (spec): chỉ là cờ, không lộ nội dung |
| 14 | Lỗi đọc cài đặt khi tính khoá (Edge) | low | reject: `subscriptionConfig()` ném lỗi → 500 qua filter chung, không bao giờ mở nội dung (fail-closed ngầm) |
| 15 | Form nộp bài/bình luận vẫn hiện cho khách chưa có gói ở bài khoá (Blind) | low | defer: lỗi 402 đã có thông báo + link gói |
| 16 | `enforcementOn()` đọc DB mỗi request; chưa cache TTL; notify có thể trễ (Blind) | low | defer |
| 17 | Bật cưỡng chế khoá cả thư viện, chưa có cảnh báo/đếm bài xem thử/công cụ hàng loạt ở admin (Blind) | medium | defer (đã ghi C5 deferred); README cảnh báo |
| 18 | Hết hạn gói giữa chừng, nút thử lại cho lỗi tải, layout shift khi tải phiên (Blind) | low | defer |
| 19 | Test đơn vị riêng cho `CourseAccessService` (biên `currentPeriodEnd`, khách bị khoá), `LessonBody` tiếng Anh (Gap) | low | defer: biên hạn và khách bị khoá đã phủ qua integration (gói hết hạn, khách `isActive=false`) |
| 20 | Claim: Code Map ghi `lesson-gate.tsx` nhưng file thực là `locked-lesson.tsx`; diff không có deferred-work (Edge) | false | ghi chú thực hiện đã nêu `LockedLesson`; `deferred-work.md` nằm ngoài diff vì loại thư mục `_bmad-output` |
| 21 | Dọn nhỏ: thứ tự import, dòng trống cuối file test, nhập `title` của `LessonBody` (Blind) | low | reject: không có hại |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: xanh
- `pnpm test` (shared, web, admin) và integration API (`POSTGRES_TEST_PORT=55433`) -- expected: pass
