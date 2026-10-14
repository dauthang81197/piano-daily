---
title: 'Khoá học piano C1: nội dung do admin soạn, nhạc MIDI có tay đánh phím, lộ trình công khai'
type: 'feature'
created: '2026-10-15'
status: 'in-review'
baseline_commit: 'fd1fc31707c304e17cd38d2d3f2ae016a7fdc3c1'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Site chỉ có thư viện sheet. Founder muốn thêm khoá học piano có lộ trình (ba nhánh Phương pháp, Kỹ thuật, Tác phẩm); admin soạn bài học; người học bấm Play thấy bàn tay mô phỏng đánh phím piano như ở trang sheet. Hiện chưa có chỗ soạn nội dung khoá học và chưa có trang cho người học.

**Approach:** Cây nội dung **Nhánh → Level → Section → Bài học** trong DB, admin soạn bằng giao diện cây. Mỗi bài học có ba phần **đều tuỳ chọn**: video YouTube, nhạc (upload file MIDI ngay trong bài, dùng lại đúng pipeline MIDI hiện có để ra note-JSON) và nội dung Markdown. Trang bài học web nhúng nguyên `MidiPlayer` hiện có (phím 3D, bàn tay mô phỏng, nốt rơi) khi bài có nhạc. Khuông nhạc chạy theo nhạc (C1b) và trình gõ nốt trên web (C1c) là hai giai đoạn sau; tiến độ học, nộp bài, cộng đồng và gắn thuê bao là C2–C5.

## Boundaries & Constraints

**Always:**
- Bốn bảng `course_tracks`, `course_levels`, `course_sections`, `course_lessons`, mỗi bảng có `sort_order` (số nguyên ≥ 0) và `is_published` (mặc định `false`). Slug chỉ ở Nhánh (duy nhất, sinh từ tiêu đề như composer/genre, không đổi khi đổi tên); URL bài học dùng id. Một bài chỉ hiện công khai khi chính nó và cả ba cấp cha đều `is_published`.
- Bài học KHÔNG có "loại bài". Ba phần đều tuỳ chọn: `youtube_url` (hợp lệ theo `parseYoutubeUrl`), nhạc MIDI, `content` Markdown; kèm `duration_minutes` tuỳ chọn. Bài **đang bật công khai phải có ít nhất một** trong ba phần (kiểm khi tạo/sửa/bật công khai và khi gỡ phần cuối của bài đang công khai → 400); bài nháp được để trống.
- Nhạc của bài: `POST /admin/courses/lessons/:id/midi` (multipart `file`, ≤ 2MB, magic bytes MIDI) dùng lại logic `SheetMediaService` (parse `@tonejs/midi`; file gốc vào vùng private, note-JSON `midi.toJSON()` vào vùng public, khoá object dưới `lessons/<lessonId>/`); `DELETE …/midi` gỡ. Thay file mới thì object cũ bị xoá best-effort SAU khi DB commit; lỗi giữa chừng không để lại bản ghi trỏ vào object không tồn tại (dọn object đã ghi như luồng sheet). Xoá bài học cũng xoá object nhạc best-effort.
- Công khai: bài có nhạc trả `midi: { noteJsonUrl, durationSeconds, noteCount }` (URL public của note-JSON, không lộ file gốc/khoá private). Web nhúng `MidiPlayer` hiện có với `noteJsonUrl` và tiêu đề bài, `key` theo URL; không sửa mã bàn tay/player.
- Nội dung khoá học do admin soạn bằng **tiếng Việt**; khung giao diện song ngữ vi/en, trang `/en/courses…` vẫn hiển thị nội dung tiếng Việt.
- Markdown hiển thị bằng `react-markdown` (không HTML thô, ảnh ngoài bỏ thay bằng chữ thay thế, link `rel="noopener noreferrer nofollow"`) như phần Lyrics; video chỉ qua iframe YouTube nocookie (CSP hiện tại đã cho phép).
- Xem (GET) admin: mọi admin; ghi/upload/đổi thứ tự/xoá: chỉ SUPER_ADMIN (EDITOR nhận 403). Xoá một nút còn con → 409 `RESOURCE_IN_USE` (xoá từ lá lên).
- Đổi thứ tự bằng nút lên/xuống hoán đổi `sort_order` với anh em liền kề cùng cha (nguyên tử, khoá hàng cha); tạo mới nhận `max + 1`.
- API công khai chỉ trả phần đã công khai; cache tag web `courses`, mọi thao tác ghi của admin (kể cả upload/gỡ MIDI) revalidate tag này (best-effort sau commit như `ads`/`plans`).
- Trang web: `/[locale]/courses` (thẻ nhánh: tiêu đề serif lớn, "x bài · 0%", thanh tiến độ 0% chỉ là chỗ giữ cho C2), `/[locale]/courses/[trackSlug]` (level → section → danh sách bài), `/[locale]/courses/[trackSlug]/[lessonId]` (bài học: player nếu có nhạc, video nếu có, nội dung nếu có, bài trước/sau trong nhánh); bài/nhánh không công khai hoặc sai nhánh → 404; SEO metadata + `hreflang`; mục "Khoá học" trên header; sitemap thêm nhánh và bài học. Bundle: `MidiPlayer`/three vẫn chỉ nạp động (test `midi-player-bundle` xanh).

**Never:**
- Không làm khuông nhạc, trình gõ nốt, tiến độ học, nộp bài, bình luận/đánh giá, kiểm duyệt, giới hạn theo thuê bao (C1b, C1c, C2–C5).
- Không gắn bài học với Sheet trong catalog (bài tập không được làm rối thư viện sheet); không lưu/phát video tự host; không HTML thô trong nội dung; không đụng catalog sheet, thuê bao, CSP, three, mã bàn tay/player.
- Không cascade xoá cây (phải xoá từ lá); không để bài đang công khai không có phần nào.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Tạo nhánh | SUPER_ADMIN, tiêu đề "Phương pháp" | 201, slug `phuong-phap` (trùng thì `-2`), `is_published=false`, `sort_order=max+1` | Trống/quá dài 400; EDITOR 403 |
| Tạo cấp con | cha tồn tại | 201 gắn đúng cha | Cha lạ 404/400 |
| Bài nháp trống | không video/nhạc/nội dung | 201 (nháp) | N/A |
| Bật công khai bài trống | `isPublished=true`, cả ba phần trống | Không bật | 400 tại `content` ("cần ít nhất một phần") |
| Video không hợp lệ | `youtubeUrl` không phải YouTube | Không lưu | 400 tại `youtubeUrl` |
| Upload MIDI | file MIDI hợp lệ ≤ 2MB | 200 bài có `midi{noteJsonUrl,durationSeconds,noteCount}`; object private + public đã ghi | Quá lớn 413; không phải MIDI 415; MIDI hỏng 400; không ghi gì khi lỗi |
| Thay MIDI | upload lần hai | DB trỏ file mới; object cũ bị xoá sau commit | Lỗi xoá cũ chỉ log |
| Gỡ MIDI | bài chỉ có nhạc và đang công khai | Không gỡ | 400 (cần ít nhất một phần) |
| Đổi thứ tự | `move up` cho mục đầu | Không đổi, 200 | Id lạ 404 |
| Xoá có con | track còn level | Không xoá | 409 `RESOURCE_IN_USE` |
| Công khai nhánh | `GET /courses` | Chỉ nhánh published, `lessonCount` = bài công khai | N/A |
| Cây công khai | `GET /courses/:slug` | level→section→lesson published (kèm cờ `hasVideo`/`hasMusic`, `durationMinutes`) | Nhánh draft/lạ: 404 |
| Bài bị che | bài published nhưng section/level draft | Không có trong cây, đếm, sitemap; GET bài trả 404 | 404 |
| Chi tiết bài | bài công khai có nhạc | Bài + `midi` + video/nội dung + bài trước/sau + level/section; web hiện player | Sai `trackSlug` cho bài: 404 |
| Sửa của admin | bất kỳ ghi thành công | Web nhận revalidate tag `courses` | Lỗi revalidate không làm hỏng thao tác |

</frozen-after-approval>

## Code Map

- `apps/api/prisma/schema.prisma` + migration `20261016100000_courses` -- 4 bảng, CHECK (thứ tự ≥ 0, `duration_minutes` > 0, MIDI: `midi_storage_key` và `note_json_key` cùng null hoặc cùng có), index theo cha + `sort_order`, FK cha `RESTRICT`.
- `apps/api/src/modules/media/sheet-media.service.ts`, `media.module.ts` -- tách phần parse MIDI dùng chung, thêm `storeLessonMidi(lessonId, upload)` (khoá `private/lessons/<id>/MIDI/…`, `public/lessons/<id>/MIDI_JSON/…`) và xoá object; mẫu: `storeMidi`, `StorageWriteError`, `MidiProcessingError`.
- `apps/api/src/modules/courses/` (mới, chủ 4 bảng) -- `courses.service.ts` (CRUD, move, kiểm tra cha, slug, quy tắc "ít nhất một phần"), `lesson-midi.service.ts` (upload/gỡ + dọn object), `admin-courses.controller.ts`, `public-courses.controller.ts`, `public-courses.service.ts` (cây, đếm, chi tiết), `courses.module.ts`; mẫu: `catalog/composers.service.ts` + `unique-slug.ts`, `catalog/sheet-files.controller.ts` + `sheets.service.ts` (multer, kiểm magic bytes/dung lượng MIDI, ánh xạ lỗi), `ads/ads.controller.ts` (`SuperAdminGuard`), `catalog/cache-invalidator.ts`.
- `packages/shared/src/courses.ts` (mới), `cache-tags.ts` (`courses`), `sheet.ts` (`sitemapEntriesSchema` thêm `courseTracks`, `courseLessons` mặc định `[]`), `file.ts` (hằng MIDI dùng lại: `MIDI_MAX_BYTES`, `MIDI_MIME_TYPE`).
- `apps/api/src/modules/catalog/public-sheets.service.ts` -- `sitemapEntries()` thêm dữ liệu khoá học.
- `apps/admin/src/app/(admin)/courses/page.tsx`, `courses/[id]/page.tsx`, `components/courses/**`, `lib/api/courses.ts`, `components/admin-sidebar.tsx` (+test) -- danh sách nhánh, trình soạn cây, form từng cấp (video tuỳ chọn có xem trước, nhạc upload MIDI, nội dung Markdown); mẫu: `components/sheets/midi-uploader.tsx` + `use-sheet-file-upload.ts`, `markdown-editor.tsx`, `youtube-preview.tsx`.
- `apps/web/src/app/[locale]/courses/page.tsx`, `courses/[trackSlug]/page.tsx`, `courses/[trackSlug]/[lessonId]/page.tsx`, `components/courses/**`, `lib/courses.ts`, `lib/sitemap.ts`, `components/layout/header.tsx` + `mobile-menu.tsx`, `messages/{vi,en}.json` -- giao diện; mẫu: `components/sheet/player-slot.tsx` + `midi-player.tsx` (nhúng nguyên, không sửa), `lyrics.tsx` (Markdown an toàn), `youtube-embed.tsx`, `lib/ads.ts`/`lib/plans.ts` (fetch có tag), `app/[locale]/pricing/page.tsx`.
- `README.md`, `deferred-work.md`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/shared/src/courses.ts`, `cache-tags.ts`, `sheet.ts`, `index.ts` -- schema, tag, sitemap -- hợp đồng chung
- [x] `apps/api/prisma/schema.prisma` + migration -- bảng/ràng buộc -- nền dữ liệu
- [x] `apps/api/src/modules/media/**` -- `storeLessonMidi` + xoá object, dùng chung parse MIDI -- xử lý nhạc bài học
- [x] `apps/api/src/modules/courses/**`, `app.module.ts`, `catalog/public-sheets.service.ts` -- admin CRUD + move + upload MIDI, API công khai, sitemap
- [x] `apps/api/test/**` -- unit (quy tắc "ít nhất một phần", slug, move) + integration (CRUD từng cấp, quyền, 409, ẩn theo cấp cha, upload/thay/gỡ MIDI với SeaweedFS thật, công khai/đếm/chi tiết/404, prev-next, revalidate, sitemap); cập nhật `public-routes.spec.ts`
- [x] `apps/admin/src/**` -- trang Khoá học + trình soạn cây + upload MIDI + test; sidebar
- [x] `apps/web/src/**` -- ba trang (trang bài nhúng `MidiPlayer`), header, sitemap, i18n + test
- [x] `README.md`, `deferred-work.md` -- tài liệu

**Acceptance Criteria:**
- Given SUPER_ADMIN tạo nhánh→level→section→bài, upload một file MIDI vào bài, công khai từng cấp, when mở `/vi/courses` → nhánh → bài, then thấy player; bấm Play thì có phím và bàn tay mô phỏng như trang sheet.
- Given bài chỉ có YouTube, hoặc chỉ có nội dung, then trang bài hiển thị đúng phần có; bài không có video thì không có khối video.
- Given một cấp cha ở trạng thái nháp, then mọi bài bên dưới biến mất khỏi cây, số đếm, bài trước/sau, sitemap, và URL trực tiếp của bài trả 404.
- Given EDITOR, then xem được cây admin nhưng mọi ghi/upload bị 403; xoá nút còn con bị 409.
- Given admin sửa bất kỳ nội dung hoặc nhạc, then web nhận revalidate tag `courses`.
- Test hiện có, lint, typecheck, build xanh; `midi-player-bundle` vẫn xanh.

## Implementation Notes

- Hoàn tất C1: shared, DB, API admin/công khai, admin UI, web (3 trang, header, sitemap, vi/en), README, deferred-work.
- Ba trang web đặt `dynamic = 'force-dynamic'` (build không có API); dữ liệu vẫn qua data cache tag `courses`.
- Kiểm chứng: lint, typecheck, build xanh; shared 295, web 756, admin 224 test xanh; API integration 608 xanh (đã sửa test sitemap cũ cho hai mảng mới); API unit chỉ còn 6 lỗi `backup-script` có sẵn trên macOS.

## Spec Change Log

## Review Triage Log

## Design Notes

Cây bốn cấp với `sort_order` số nguyên và nút lên/xuống đủ cho vài trăm bài mà không cần kéo-thả; hoán đổi `sort_order` với anh em liền kề trong một transaction (khoá hàng cha) tránh hai admin đua nhau. "Hiện công khai" tính bằng JOIN bốn cấp cùng `is_published` nên ẩn một section ẩn cả nhánh con; đây cũng là cơ sở cho đếm "x bài" và C2. Nhạc của bài lưu trực tiếp trên bài học (không qua Sheet) để bài tập không làm rối catalog; note-JSON giữ nguyên dạng `midi.toJSON()` (có `ticks`, `ppq`, tempo) nên C1b có đủ dữ liệu để dựng khuông nhạc và C1c có thể ghi cùng định dạng khi gõ nốt trên web.

## Verification

**Commands:**
- `pnpm lint && pnpm typecheck && pnpm build` -- expected: không lỗi
- test shared/web/admin; API unit + integration (`docker compose up -d --wait seaweedfs`, `POSTGRES_TEST_PORT=55433 docker compose --profile test up -d --wait postgres-test`, `set -a && . ./.env && set +a && unset NODE_ENV`) -- expected: pass (trừ 6 test `backup-script` lỗi sẵn trên macOS)

**Manual checks (if no CLI):**
- Trong admin tạo nhánh, level, section, một bài, upload file MIDI nhỏ, công khai tất cả, mở `/vi/courses`, đi tới bài và bấm Play xem phím và tay.
