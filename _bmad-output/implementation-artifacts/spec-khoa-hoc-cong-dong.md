---
title: 'Khoá học piano C4: bình luận và đánh giá bài học, kiểm duyệt sau'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_commit: 'fdcd726d81f40323197a6c82618a5532b05e3289'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Trang bài chưa có chỗ để người học hỏi đáp và chấm điểm; admin chưa có công cụ gỡ nội dung xấu.

**Approach:** Khách đã đăng nhập chấm 1–5 sao (mỗi bài một đánh giá, sửa được) và bình luận văn bản thuần (trả lời một cấp). Trang bài hiện trung bình sao, số đánh giá và bình luận công khai. Đăng ngay, kiểm duyệt sau: admin ẩn/hiện/xoá ở trang bình luận toàn cục (lọc theo bài). Dữ liệu cộng đồng tải ở trình duyệt, không nằm trong HTML cache.

## Boundaries & Constraints

**Always:**
- Chỉ đánh giá/bình luận vào bài công khai ở đủ bốn cấp (`VISIBLE_LESSON`); bài ẩn/lạ/uuid sai → 404. Ghi cần khách đang hoạt động và đã xác minh email (`EMAIL_NOT_VERIFIED` 403); token khách đã xoá → 401. Đọc công khai không cần đăng nhập.
- Bình luận: trim, 1–1000 ký tự, không NUL, tối đa 2 link (`http(s)://` hoặc `www.`), cấm trùng nguyên văn bình luận cũ của cùng khách trong cùng bài (409). Trả lời chỉ một cấp: `parentId` phải là bình luận gốc, cùng bài, đang hiện (không thì 404). Hiển thị văn bản thuần (không markdown/HTML), giữ xuống dòng; tên hiển thị = `customer.name`, không bao giờ lộ email.
- Đánh giá: nguyên 1–5, tối đa một đánh giá mỗi (khách, bài), PUT upsert, DELETE gỡ (idempotent). Trung bình làm tròn 1 chữ số, chỉ tính khi bài còn công khai.
- Kiểm duyệt sau: bình luận bị ẩn (hoặc nằm dưới bình luận gốc bị ẩn) không hiện công khai; người viết vẫn thấy bình luận của mình kèm nhãn "Quản trị đã ẩn" và vẫn sửa/xoá được; sửa không bỏ cờ ẩn. Xoá bình luận gốc xoá cả trả lời; xoá khách/bài xoá theo (CASCADE).
- Ghi (POST/PATCH/DELETE/PUT) throttle 10/phút theo IP; mọi route `no-store`. Admin ẩn/xoá chỉ SUPER_ADMIN; xem: mọi admin. Song ngữ vi/en cho chuỗi web; migration viết tay.

**Never:** hiển thị công khai bài nộp C3; báo cáo vi phạm từ người dùng; thông báo email; gating thuê bao (C5); markdown/HTML trong bình luận; kiểm duyệt trước khi đăng; đánh giá ảnh hưởng thẻ nhánh/SEO.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Xem công khai | bài công khai, có bình luận/đánh giá | 200 `{rating:{average,count}, comments:[gốc mới nhất trước, kèm replies cũ trước], nextCursor}`, không thấy bình luận ẩn | bài ẩn/lạ → 404 |
| Xem của tôi | khách đăng nhập | 200 `{myRating, mine:[bình luận của tôi đang bị ẩn]}` | 401 nếu không token |
| Chấm sao | stars 1–5 | 200 lưu/ghi đè | stars 0/6/1.5/chuỗi → 400; chưa xác minh → 403 |
| Bình luận | body hợp lệ | 201 trả bình luận | rỗng/>1000/3 link → 400; trùng → 409 |
| Trả lời | parentId là gốc đang hiện | 201 | parent là reply/ẩn/bài khác/lạ → 404 |
| Sửa/xoá | bình luận của mình | 200/204 (xoá idempotent) | của người khác → 404 |
| Admin ẩn | PATCH `{hidden:true}` | 200; công khai không thấy cả nhánh trả lời | id lạ → 404; EDITOR → 403 |
| Admin liệt kê | lọc `lessonId`, `hidden`, cursor | 200 mới nhất trước, kèm tên/email khách và tên bài | lessonId sai → 400/404 |

</frozen-after-approval>

## Code Map

- `packages/shared/src/courses.ts` -- thêm schema/type C4: `ratingBodySchema`, `commentBodySchema` (+ `COMMENT_MAX`, đếm link), `setCommentHiddenSchema`, `publicCommunitySchema`, `myCommunitySchema`, `adminCommentSchema` + page.
- `apps/api/prisma/schema.prisma` + migration `20261020100000_course_community` -- `CourseRating` (PK customer,lesson; CHECK stars 1..5) và `CourseComment` (uuidv7, lesson_id, customer_id, parent_id tự tham chiếu CASCADE, body, is_hidden, created/updated/edited_at; index (lesson_id, parent_id, created_at DESC)).
- `apps/api/src/modules/courses/course-community.service.ts` (mới) -- đọc công khai + của tôi, ghi (mẫu `course-submissions.service.ts`: `VISIBLE_LESSON`, P2003 → 401/404), quyền ghi, kiểm duyệt admin.
- `public-courses.controller.ts` -- thêm `GET lessons/:id/community?cursor=` (khai báo trước `:trackSlug`). `customer-courses.controller.ts` -- thêm `GET lessons/:id/community/mine`, `PUT|DELETE lessons/:id/rating`, `POST lessons/:id/comments`, `PATCH|DELETE comments/:id`. `admin-course-community.controller.ts` (mới, đăng ký TRƯỚC `AdminCoursesController` như C3) -- `GET comments`, `PATCH|DELETE comments/:id`. `courses.module.ts`, `test/integration/public-routes.spec.ts` -- đăng ký/allowlist.
- `apps/web/src/lib/public-api.ts`, `customer-api.ts` -- gọi API; `components/courses/lesson-community.tsx` (mới) gắn vào `lesson-view.tsx` dưới `LessonSubmission`; `messages/{vi,en}.json` khoá `Courses.community*`.
- `apps/admin/src/lib/api/courses.ts`, trang `app/(admin)/courses/comments/page.tsx` + `components/courses/community-moderation.tsx` (mới); nút "Bình luận" ở hàng bài trong `course-tree-editor.tsx` (`?lessonId=`) và liên kết ở `courses/page.tsx`.
- Không đổi: cây khoá học, C2 tiến độ, C3 nộp bài (không hiển thị công khai).

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/courses.ts` (+ spec) -- schema, đếm link, kiểu dữ liệu -- dùng chung web/API
- [x] `schema.prisma` + migration viết tay -- hai bảng
- [x] `course-community.service.ts` + controllers + module + `public-routes.spec.ts` -- API công khai/khách/admin
- [x] `courses.spec.ts` -- integration phủ ma trận I/O, ẩn nhánh trả lời, cô lập khách, cascade, 403 chưa xác minh, 429, quyền EDITOR, cursor
- [x] web: api client, `lesson-community.tsx`, `lesson-view.tsx`, messages vi/en (+ test jsdom)
- [x] admin: client, trang moderation, liên kết từ cây/danh sách (+ test)
- [x] `README.md`, `deferred-work.md` -- ghi C4

**Acceptance Criteria:**
- Given khách đã xác minh, when chấm 4 sao rồi 5 sao cho cùng bài, then chỉ còn một đánh giá (5) và trung bình/số lượng cập nhật.
- Given admin ẩn bình luận gốc có trả lời, when khách khác tải trang bài, then không thấy cả nhánh; người viết vẫn thấy bình luận của mình kèm nhãn.
- Given bài bị ẩn sau khi có đánh giá, when xem công khai, then 404; admin vẫn thấy bình luận.
- Given bình luận chứa `<script>` hoặc markdown, when hiển thị, then là văn bản thuần.

## Implementation Notes

- Controller admin tách riêng `AdminCourseCommunityController`, đăng ký TRƯỚC `AdminCoursesController` (cùng lý do C3: `:kind/:id` sẽ bắt nhầm `comments/:id`).
- Khách xem phần của mình qua `GET .../community/mine` (đánh giá + mọi bình luận của mình, `isHidden` tính cả khi bình luận gốc bị ẩn); web ghép với danh sách công khai để biết bình luận nào của mình (không lộ id khách trong dữ liệu công khai).
- Gỡ đánh giá / xoá bình luận của mình không cần bài còn công khai (như C3); tạo/sửa/chấm sao thì cần.
- Test integration dùng dải IP riêng `10.x` cho C4 vì công thức `198.51.100.(seq+100)` của C2/C3 bắt đầu va chạm với địa chỉ login khi số request trong file tăng (throttle chéo giữa test).
- Trang admin `/courses/comments` đọc `?lessonId=` bằng `useSearchParams` trong `Suspense` (mẫu trang login).

## Spec Change Log

## Review Triage Log

| # | Phát hiện | Verdict | Xử lý / bằng chứng |
|---|-----------|---------|--------------------|
| 1 | Con trỏ dùng `created_at` (ms ở JS, µs ở DB) làm mất/trùng bình luận giữa các trang, cả công khai lẫn admin (Gap, Edge, Blind) | high | patch: con trỏ chỉ chứa `id` (uuidv7), sắp xếp theo `id` giảm dần; thêm kiểm độ dài con trỏ |
| 2 | `countLinks` đếm theo `\S+` nên `https://a.com,https://b.com,https://c.com` chỉ tính 1 link (Edge) | medium | patch: đếm số lần xuất hiện `http(s)://`/`www.`; thêm test shared + API |
| 3 | Bình luận toàn ký tự vô hình (zero-width) qua được `min(1)` (Edge) | medium | patch: từ chối; thêm test |
| 4 | Sửa với nội dung y hệt vẫn đặt cờ "đã chỉnh sửa" (Edge) | low | patch: trả nguyên bình luận, không ghi; thêm test |
| 5 | `DELETE rating` ở bài đã ẩn trả trung bình/số đánh giá của bài ẩn (Edge) | medium | patch: bài không công khai trả `{average:null,count:0}`; thêm test |
| 6 | Lọc admin "ẩn/hiện" bỏ sót trả lời nằm dưới bình luận gốc bị ẩn (Edge, Blind) | medium | patch: lọc tính cả gốc bị ẩn, thêm `parentHidden` và nhãn "Ẩn theo bình luận gốc"; thêm test API + admin |
| 7 | `more()` web/admin không bỏ kết quả về muộn (đổi bài/bộ lọc), lỗi "Xem thêm" lẫn vào lỗi form (Edge, Blind, Gap) | medium | patch: so khoá/phạm vi, `moreError` riêng; thêm test |
| 8 | Phần "của tôi" tải lỗi làm nút sao bị khoá vĩnh viễn (Edge) | medium | patch: nút sao chỉ khoá khi đang gửi; thêm test |
| 9 | Admin xoá lỗi 404 không tải lại danh sách (Edge) | low | patch: tải lại trong `onError`; thêm test |
| 10 | Trung bình sao luôn "4.5" kể cả tiếng Việt (Blind) | low | patch: `toLocaleString(locale)` ("4,5" ở vi) |
| 11 | Không test `LessonView` gắn `LessonCommunity` (Gap) | medium | patch: stub có dấu hiệu + assert id bài |
| 12 | Wrapper `customerApi`/`fetchCommunity` chỉ test sau mock (Gap) | low | defer: một dòng/wrapper, server đã phủ route; cùng mức C2/C3 |
| 13 | `REPLIES_CAP` 500 dùng chung cả trang, cắt âm thầm (Edge, Blind, Gap) | low | defer: cần >500 trả lời trong 20 bình luận gốc |
| 14 | `mine()` cắt 200 bình luận (Edge, Blind) | low | defer: cần >200 bình luận của một khách ở một bài |
| 15 | Kiểm tra trùng nguyên văn là đọc-rồi-ghi, không có unique (Edge, Blind) | low | defer: chỉ hai POST song song cùng nội dung; hậu quả là một bản trùng |
| 16 | Một cấp trả lời chỉ do ứng dụng giữ, DB không ràng buộc (Blind) | low | defer: không có đường ghi nào khác ngoài service |
| 17 | Throttle theo IP/NAT, chưa chặn tài khoản, chưa kiểm duyệt đánh giá, chưa audit, chưa xem trước bình luận gốc ở admin (Blind) | low | defer (đã ghi C4 deferred) |
| 18 | Admin mỗi thao tác tải lại về trang đầu; web tải lại trang đầu sau khi gửi (Edge, Blind) | low | defer: ghi nhận trong deferred |
| 19 | Tên hiển thị = `customer.name`, tài khoản bị khoá vẫn hiện bình luận cũ (Edge, Blind) | low | defer: ghi nhận; admin ẩn/xoá được |
| 20 | A11y: tên nút Trả lời/Sửa/Xoá trùng nhau, focus, đếm ký tự, `confirm()` native; chưa báo trước "cần xác minh email" (Blind) | low | defer/reject: không gây hỏng chức năng; ghi vào deferred |
| 21 | `refresh()` lỗi sau khi gửi thành công hiện lỗi tải (Edge) | low | reject: dữ liệu cũ vẫn hiển thị, người dùng không bị chặn |
| 22 | Claim: DELETE rating/comment bỏ qua kiểm 401/404; PATCH/DELETE admin thiếu no-store; `mine` khác hình dạng ma trận; admin PATCH/DELETE không cache (Edge, claims) | false | cố ý: người dùng luôn gỡ được dữ liệu của mình (như C3); phản hồi admin không cache được vì PATCH/DELETE; tên trường chỉ khác ghi chú ma trận |

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: xanh
- `pnpm test` (shared, web, admin) và integration API (`POSTGRES_TEST_PORT=55433`) -- expected: pass
