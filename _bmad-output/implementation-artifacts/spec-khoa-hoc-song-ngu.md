---
title: 'Khoá học piano: nội dung song ngữ vi/en và level chọn từ danh sách'
type: 'feature'
created: '2026-10-15'
status: 'in-review'
baseline_commit: 'ff37564'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{implementation_artifacts}/spec-khoa-hoc-noi-dung.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Khoá học (C1) chỉ có một ngôn ngữ: admin soạn tiếng Việt, trang `/en/courses…` vẫn hiện nội dung tiếng Việt. Founder muốn admin nhập thêm tiếng Anh cho toàn bộ nội dung khoá học, và **Level** là một lựa chọn có sẵn (sơ cấp, trung cấp, cao cấp…) thay vì gõ tên tự do.

**Approach:** Mỗi nút của cây (nhánh, level, section, bài) có thêm các trường tiếng Anh **tuỳ chọn**: tên, mô tả; riêng bài còn có nội dung Markdown tiếng Anh. Tiếng Việt vẫn là bản gốc và bắt buộc. API công khai nhận `?locale=vi|en` và trả đúng ngôn ngữ, trường tiếng Anh trống thì dùng tiếng Việt (từng trường một). Web `/en/courses…` gửi `locale=en`. Video YouTube và nhạc MIDI dùng chung cho hai ngôn ngữ. Slug nhánh vẫn sinh từ tên tiếng Việt và không đổi. **Level** có thêm `preset` chọn từ danh sách cố định (`BEGINNER` Sơ cấp / Beginner, `INTERMEDIATE` Trung cấp / Intermediate, `ADVANCED` Cao cấp / Advanced, `EXPERT` Chuyên gia / Expert) hoặc "Khác" (preset trống, tự đặt tên như hiện nay). Tên hiển thị của level có preset là tên chuẩn theo ngôn ngữ, nên không cần dịch tay.

## Boundaries & Constraints

**Always:**
- Thêm cột: `title_en` (null, ≤ 120), `description_en` (null, ≤ 500) cho cả 4 bảng; `content_en` (null) cho `course_lessons` (≤ 20.000 ký tự). Chuỗi trống/chỉ khoảng trắng được lưu thành `null`. CHECK độ dài ở DB như các cột hiện có. Dữ liệu cũ không đổi (cột mới null).
- Admin: form nhánh/level/section có thêm "Tên (English)" và "Mô tả (English)", form bài có thêm "Tên (English)" và "Nội dung (English)" Markdown; tất cả tuỳ chọn, ghi rõ "để trống thì web tiếng Anh dùng bản tiếng Việt". Cây admin hiển thị tên tiếng Việt, kèm dấu cho biết nút đã có bản tiếng Anh. Body admin schema nhận các trường mới (`titleEn`, `descriptionEn`, `contentEn`) và trả chúng.
- Level: cột `preset` (null | `BEGINNER|INTERMEDIATE|ADVANCED|EXPERT`, CHECK ở DB). Có preset → tên level là nhãn chuẩn (vi/en, nằm ở `packages/shared`), `title`/`title_en` được đặt đúng theo nhãn khi lưu và admin không nhập tên; không preset ("Khác") → bắt buộc `title` như hiện nay, `title_en` tuỳ chọn. Level cũ đã có dữ liệu giữ nguyên (preset null). Có thể có nhiều level cùng preset trong một nhánh (vd. hai level "Sơ cấp" cho hai chủ đề không bị cấm). Admin chọn preset bằng ô chọn ở form level (mặc định Sơ cấp khi tạo mới); web hiển thị theo ngôn ngữ trang.
- Quy tắc "bài công khai cần ít nhất một phần" chỉ xét bản tiếng Việt như hiện nay (nội dung tiếng Anh một mình không đủ).
- API công khai: query `locale` ∈ `vi|en` (mặc định `vi`; giá trị khác → 400). Với `en`, mỗi trường văn bản (tên, mô tả, nội dung) lấy bản tiếng Anh nếu có, không thì bản tiếng Việt; hình dạng response không đổi (client không cần biết trường nào đã dịch). Số đếm, thứ tự, ẩn theo cha, prev/next, sitemap không phụ thuộc ngôn ngữ.
- Web: `lib/courses.ts` truyền locale của trang vào URL API (khác locale = khác khoá cache); cache tag vẫn `courses`. `generateMetadata` của ba trang cũng dùng đúng locale. Chuỗi khung vi/en không đổi.
- Quyền, revalidate tag `courses`, quy tắc xoá/di chuyển, upload MIDI: giữ nguyên.

**Never:**
- Không tự dịch bằng máy/AI; không thêm ngôn ngữ thứ ba; không đổi slug theo ngôn ngữ; không tách video/nhạc theo ngôn ngữ; không đụng thuê bao, catalog sheet, player.
- Không bắt buộc nhập tiếng Anh; không làm hỏng dữ liệu hoặc API đang chạy (trường mới đều tuỳ chọn, request cũ vẫn hợp lệ).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nhập EN | PATCH nhánh `titleEn: "Method"` | Lưu; admin trả `titleEn` | Quá dài 400 |
| Xoá EN | `titleEn: "  "` | Lưu `null` | N/A |
| Web en, có EN | `GET /courses?locale=en` | Tên/mô tả bản EN | N/A |
| Web en, thiếu EN | nhánh chưa có `titleEn` | Tên tiếng Việt (fallback từng trường) | N/A |
| Mặc định | `GET /courses` (không locale) | Tiếng Việt như cũ | N/A |
| Locale sai | `?locale=fr` | Không trả | 400 |
| Level preset | tạo level `preset: INTERMEDIATE` không gửi title | 201, `title` = "Trung cấp", `titleEn` = "Intermediate"; `/en` hiện "Intermediate" | preset lạ 400 |
| Level "Khác" | `preset: null`, title trống | Không lưu | 400 |
| Đổi preset | PATCH level sang `ADVANCED` | Tên đổi theo preset; level cũ vẫn mở được | N/A |
| Bài EN | bài có `contentEn` | `/en/…` hiện nội dung EN; `/vi/…` hiện nội dung VN | N/A |
| Bài chỉ có `contentEn` | `content` trống, không video/nhạc | Không công khai được | 400 (quy tắc ≥ 1 phần, xét tiếng Việt) |
| Prev/next | `locale=en` | Tên bài trước/sau theo EN (fallback VN) | N/A |
| Cache | sửa EN ở admin | Revalidate tag `courses` làm mới cả hai locale | N/A |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration mới `…_courses_english` -- cột `*_en` cho 4 bảng, CHECK độ dài.
- `packages/shared/src/courses.ts` -- body schema thêm `titleEn/descriptionEn/contentEn` (trim, rỗng → null, giới hạn), admin schema trả thêm, `courseLocaleSchema`/query.
- `apps/api/src/modules/courses/{courses.service,public-courses.service,public-courses.controller}.ts`, `course-helpers.ts` -- ghi/đọc trường EN, chọn ngôn ngữ + fallback (một hàm dùng chung).
- `packages/shared/src/courses.ts` (thêm `COURSE_LEVEL_PRESETS` + nhãn vi/en); admin `node-form.tsx` -- ô chọn preset cho level.
- `apps/admin/src/components/courses/{node-form,lesson-form,course-tree-editor}.tsx`, `lib/api/courses.ts` -- trường EN, dấu "EN" ở cây.
- `apps/web/src/lib/courses.ts`, ba trang `app/[locale]/courses/**` -- truyền locale.
- `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] `schema.prisma` + migration -- cột `*_en` + `course_levels.preset` + CHECK
- [x] `packages/shared/src/courses.ts` -- schema/body/query
- [x] `apps/api/src/modules/courses/**` -- lưu/trả EN, `locale` công khai + fallback
- [x] `apps/api/test/**` -- integration (lưu/xoá EN, mặc định vi, en có/thiếu EN, locale sai 400, nội dung bài, prev/next, quy tắc ≥ 1 phần không tính EN)
- [x] `apps/admin/src/**` -- trường EN + dấu ở cây + test
- [x] `apps/web/src/**` -- truyền locale + test
- [x] `README.md`, `deferred-work.md`

**Acceptance Criteria:**
- Given admin nhập tên/mô tả/nội dung tiếng Anh, when mở `/en/courses…`, then thấy bản tiếng Anh; trường chưa dịch hiện tiếng Việt.
- Given `/vi/courses…`, then luôn là tiếng Việt như trước; API không truyền `locale` giữ hành vi cũ.
- Given admin tạo level bằng cách chọn "Trung cấp", then tên level hiện "Trung cấp" ở `/vi` và "Intermediate" ở `/en` mà không phải gõ; chọn "Khác" thì tự đặt tên.
- Given bài chỉ có `contentEn`, when bật công khai, then 400.
- Test hiện có, lint, typecheck, build xanh.


## Implementation Notes

- Migration `20261017100000_courses_english`: cột `*_en` cho 4 bảng, `course_levels.preset` (CHECK 4 mức), CHECK độ dài.
- Level có mức: server đặt `title`/`titleEn` theo nhãn chuẩn (bỏ qua giá trị client gửi); "Khác" bắt buộc `title`.
- API công khai: `pick(locale, vi, en)` từng trường; không truyền locale = vi như cũ. Web truyền locale vào URL (khoá cache riêng mỗi ngôn ngữ).
- Kiểm chứng: lint, typecheck, build xanh; shared 295, web 758, admin 225, API integration 611/612 (ads throttle chập chờn đã biết, đạt khi chạy riêng), API unit chỉ 6 lỗi `backup-script` có sẵn.

## Review Triage Log
