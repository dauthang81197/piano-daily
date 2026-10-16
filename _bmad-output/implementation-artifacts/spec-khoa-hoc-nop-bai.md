---
title: 'Khoá học piano C3: nộp bài qua link YouTube/Drive'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_commit: '404592eb41d3166e4c63af9c63ace3a4a72f3316'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Người học chưa có chỗ nộp video tập đàn cho một bài; admin không có chỗ xem và kiểm duyệt bài nộp.

**Approach:** Khách đã đăng nhập nộp đúng một link video (YouTube hoặc Google Drive, không upload file) cho mỗi bài công khai, xem/sửa/xoá ở trang bài. Admin xem danh sách bài nộp theo bài, ẩn hoặc xoá. Link được kiểm tra và chuẩn hoá ở shared (dùng chung web/API).

## Boundaries & Constraints

**Always:**
- Mỗi (khách, bài) tối đa một bài nộp: nộp lần nữa = sửa (upsert). Ghi chú tuỳ chọn ≤ 500 ký tự, văn bản thuần.
- Chỉ nhận link YouTube (`parseYoutubeUrl`, lưu dạng chuẩn) hoặc Drive `drive.google.com` dạng `/file/d/ID`, `/open?id=ID`, `/uc?id=ID` (lưu `https://drive.google.com/file/d/ID/view`). Thư mục Drive, domain khác, scheme lạ, user:pass, port → 400.
- Chỉ nộp vào bài công khai ở đủ bốn cấp (`VISIBLE_LESSON`); bài ẩn/không có/uuid sai → 404. Token khách xoá → 401. Không cần xác minh email hay thuê bao.
- Ghi (PUT/DELETE) throttle 10/phút; mọi route `Cache-Control: no-store`. Bài nộp xoá theo khách/bài (CASCADE).
- Bài nộp bị admin ẩn vẫn hiện cho chính người nộp kèm nhãn "Quản trị đã ẩn"; sửa link không bỏ cờ ẩn. Admin thao tác ghi chỉ SUPER_ADMIN (như C1). Link ngoài mở bằng `rel="noopener noreferrer"`, không nhúng iframe.
- Song ngữ vi/en cho mọi chuỗi web; migration viết tay.

**Never:** bình luận/đánh giá/hiển thị công khai bài nộp (C4); gating thuê bao (C5); upload file; kiểm tra link có thật/công khai hay chưa (chỉ gợi ý "chia sẻ ai có link đều xem được").

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nộp mới | khách, bài công khai, link YouTube | 200, lưu link chuẩn + kind | N/A |
| Nộp lại | đã có bài nộp, link Drive mới | 200, thay link, giữ cờ ẩn | N/A |
| Link lạ | `evil.com`, `javascript:`, thư mục Drive | 400 tại `url` | Không ghi |
| Ghi chú dài | note 501 ký tự | 400 tại `note` | Không ghi |
| Bài ẩn/không có | lesson ẩn hoặc uuid lạ | 404 | Không ghi |
| Chưa đăng nhập | không token / token admin | 401 | N/A |
| Xem | GET khi chưa nộp | 200 `{submission:null}` | N/A |
| Xoá | DELETE khi chưa nộp | 204, idempotent | N/A |
| Admin ẩn | PATCH `{hidden:true}` | 200; người nộp thấy nhãn ẩn | id sai → 404 |
| Admin liệt kê | bài có N bài nộp | 200, mới nhất trước, kèm tên/email khách | bài không có → 404 |

</frozen-after-approval>

## Code Map

- `packages/shared/src/courses.ts` -- thêm `parseDriveUrl`, `submissionUrlSchema` (transform → `{kind,url}`), `upsertSubmissionSchema`, `setSubmissionHiddenSchema`, `lessonSubmissionSchema`, `adminSubmissionSchema` + types. Dùng `parseYoutubeUrl`/`youtubeCanonicalUrl` từ `sheet.ts`.
- `apps/api/prisma/schema.prisma` + migration `20261019100000_course_submissions` -- model `CourseSubmission` (uuidv7 id, customer_id, lesson_id, kind, url, note, is_hidden, timestamps; unique (customer_id, lesson_id); index lesson_id; CASCADE hai FK; CHECK kind IN ('YOUTUBE','DRIVE')).
- `apps/api/src/modules/courses/course-submissions.service.ts` (mới) -- `get/upsert/remove` cho khách (mẫu `course-progress.service.ts`: `VISIBLE_LESSON`, P2003 → 401/404) + `listForLesson/setHidden/removeAny` cho admin.
- `customer-courses.controller.ts` -- thêm `GET/PUT/DELETE lessons/:id/submission` (`@Throttle` 10/phút cho ghi). `admin-courses.controller.ts` -- thêm `GET lessons/:id/submissions`, `PATCH/DELETE submissions/:id` (`BillingSuperAdminGuard` cho ghi). `courses.module.ts` -- đăng ký service. `test/integration/public-routes.spec.ts` -- allowlist route khách mới.
- `apps/web/src/lib/customer-api.ts` -- `lessonSubmission/saveSubmission/deleteSubmission`. `apps/web/src/components/courses/lesson-submission.tsx` (mới) + gắn vào `lesson-view.tsx` dưới `LessonProgressPanel`; `messages/{vi,en}.json` khoá `Courses.submission*`.
- `apps/admin/src/lib/api/courses.ts` + component danh sách bài nộp (mới) gắn vào trang soạn bài trong `apps/admin/src/components/courses/`.
- Không đổi: cây khoá học, C2 progress, trình gõ nốt.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/courses.ts` (+ test) -- parser Drive, schema, types -- dùng chung, chặn link lạ
- [x] `schema.prisma` + migration viết tay -- bảng `course_submissions`
- [x] `course-submissions.service.ts` + controllers + module + `public-routes.spec.ts` -- API khách/admin
- [x] `courses.spec.ts` -- integration: ma trận I/O, cô lập giữa khách, cascade xoá khách/bài, ẩn bài thì 404, 429 ghi, quyền EDITOR không ghi được admin
- [x] web: `customer-api.ts`, `lesson-submission.tsx`, `lesson-view.tsx`, messages vi/en (+ test jsdom: khách, chưa nộp, nộp, sửa, xoá, lỗi 400, nhãn ẩn)
- [x] admin: `courses.ts` client + danh sách bài nộp (+ test): xem, ẩn/hiện, xoá có xác nhận
- [x] `README.md`, `deferred-work.md` -- ghi C3

**Acceptance Criteria:**
- Given khách đã đăng nhập, when nộp link hợp lệ rồi tải lại trang bài, then thấy link đã nộp và sửa/xoá được.
- Given khách A nộp bài, when khách B gọi GET cùng bài, then thấy `null` (không lộ bài của A).
- Given admin ẩn một bài nộp, when người nộp mở trang bài, then thấy nhãn "Quản trị đã ẩn" và link vẫn sửa/xoá được.
- Given bài bị ẩn sau khi có bài nộp, when khách nộp/sửa, then 404; admin vẫn liệt kê được.

## Implementation Notes

- Admin ẩn/xoá nằm ở controller riêng `AdminCourseSubmissionsController`, đăng ký TRƯỚC `AdminCoursesController` vì `PATCH|DELETE :kind/:id` sẽ bắt nhầm `submissions/:id` (404 do `CourseKindPipe`).
- `DELETE` của khách không kiểm tra bài còn công khai: khách luôn gỡ được bài nộp của mình (kể cả khi bài đã bị ẩn). GET/PUT thì 404 với bài không công khai.
- Admin UI: trang riêng `/courses/[id]/lessons/[lessonId]/submissions` + nút "Bài nộp" ở mỗi hàng bài (mẫu nút "Soạn nhạc" của C1c). EDITOR xem được, nút ẩn bị khoá, không có nút xoá.
- Web: `LessonSubmission` dùng thẳng `useCustomer()` (không qua provider tiến độ), có che dữ liệu khi đổi tài khoản/bài. `course-progress.test.tsx` mock component này vì đã có test riêng.
- Test thêm: shared 6 (`course-submissions.spec.ts`), API integration 8 (cả 429), web 7, admin 7. Lỗi 500 lúc đầu do quên import `youtubeCanonicalUrl` trong shared (typecheck API không bắt vì đọc `dist`).
- `prisma format` căn lại cột các model cũ trong `schema.prisma` (chỉ khoảng trắng).

## Spec Change Log

## Review Triage Log

| # | Phát hiện | Verdict | Xử lý / bằng chứng |
|---|-----------|---------|--------------------|
| 1 | Kết quả lưu/xoá về muộn sau khi đổi khách/bài ghi đè trạng thái (Edge) | medium | patch: so khoá (khách,bài) hiện tại trước khi `setLoad`/`setBusy`; thêm test |
| 2 | Form giữ chữ của tài khoản/bài trước (Edge) | medium | patch: reset `url`/`note` trong effect đổi khách/bài; thêm test |
| 3 | 404/401 khi lưu chỉ báo lỗi chung, thử lại không bao giờ thành công (Edge, Gap) | medium | patch: thông báo `submissionUnavailable`; thêm test |
| 4 | 400 ở `note`/trường khác hiện `err.message` sai ngôn ngữ (Edge, Gap, Blind) | low | patch: `submissionInvalidNote` / `submissionInvalidUrl` theo ngôn ngữ web |
| 5 | `type=url` chặn link không scheme mà server nhận (Edge) | low | patch: `type=text inputMode=url`; thêm test |
| 6 | Hai PUT đầu tiên song song → P2002 → 500 (Edge) | medium | patch: bắt P2002 rồi cập nhật dòng đã có; thêm test song song |
| 7 | Admin: tải lại lỗi/PATCH 404 để dòng cũ nằm cạnh lỗi (Edge) | low | patch: xoá `rows` khi tải lỗi, tải lại sau lỗi thao tác; thêm test |
| 8 | Link Drive dạng `/file/u/0/d/ID` bị từ chối (Blind) | low | patch: regex nhận `u/N/`; thêm test shared |
| 9 | README nói "thư mục bị từ chối" quá mức: `/open?id=` nhận cả id thư mục (Edge) | low | patch README; không thể phân biệt offline → ghi vào deferred |
| 10 | Không có test `LessonView` gắn khối nộp bài (Gap) | medium | patch: `lesson-view-submission.test.tsx` |
| 11 | 429 chỉ test PUT, DELETE chưa (Gap) | low | patch: mở rộng test 429 cho DELETE |
| 12 | Trần 200 dòng admin không test, không phân trang/báo cắt (Gap, Edge, Blind) | low | defer (đã ghi C3 deferred; cần seed 201 khách) |
| 13 | Throttle theo IP, người dùng chung NAT dùng chung 10/phút (Blind, Edge) | low | defer: cùng mẫu C2 và các route khách khác; README ghi rõ "theo IP" |
| 14 | `is_hidden` chưa có tác dụng ngoài nhãn (Blind) | false | đúng theo spec: người nộp vẫn thấy; nơi dùng cờ là C4 |
| 15 | PATCH admin trả `MySubmission` thiếu `customer`, thiếu `no-store` (Blind) | low | reject: UI tải lại danh sách; dữ liệu admin không cache công khai |
| 16 | Gợi ý "ai có link" không kiểm tra Drive riêng tư/YouTube private (Blind) | low | reject: spec Never "kiểm tra link có thật"; đã có gợi ý |
| 17 | Admin chưa kiểm `lessonId` thuộc `trackId` (Blind) | low | reject: chỉ ảnh hưởng tiêu đề/liên kết quay lại; API vẫn quyền admin |
| 18 | Không có audit trail/thông báo khi ẩn/xoá; `updated_at` đổi khi admin ẩn (Blind) | low | defer: đã ghi chưa thông báo; audit ngoài phạm vi C3 |
| 19 | Chuỗi admin chỉ tiếng Việt (Blind) | false | admin toàn tiếng Việt theo kiến trúc hiện có |
| 20 | Trạng thái tải im lặng, focus, `confirm()` native, thiếu nút thử lại khi tải lỗi (Blind, Edge) | low | reject/defer: không có hại cụ thể; thử lại ghi vào deferred |
| 21 | `href` admin không kiểm scheme (Edge) | low | reject: URL chỉ do server chuẩn hoá https ghi vào; không đường nào ghi scheme khác |
| 22 | Admin `canWrite` nhấp nháy khi chưa có user (Edge) | low | reject: cùng mẫu mọi trang admin khác |
| 23 | Index không có `id`; test CHECK; ghi chú toàn khoảng trắng; `schema.prisma` căn lại cột (Blind) | false | index đủ cho truy vấn; ghi chú rỗng đã test ở shared; căn cột do `prisma format` chuẩn |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: xanh
- `pnpm test` (shared, web, admin) và integration API (`POSTGRES_TEST_PORT=55433`) -- expected: pass
