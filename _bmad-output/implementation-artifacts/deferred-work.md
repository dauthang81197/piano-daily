- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-khoi-tao-monorepo-va-moi-truong-local.md`
  summary: Thêm smoke test tự động cho `docker compose up --build` (health 200, 404 NOT_FOUND, web/admin 200) vào CI.
  evidence: Review Story 1.1 (verification-gap): chưa có CI; lỗi của image (pnpm deploy --prod, turbo prune, DATABASE_URL compose) chỉ lộ ra khi chạy tay. Nên làm ở Story 5.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-api-xac-thuc-admin-voi-guard-deny-by-default.md`
  summary: Admin client (Story 1.3) phải đảm bảo chỉ một tab gọi `/auth/refresh` tại một thời điểm (Web Locks API hoặc BroadcastChannel), để hai tab refresh đồng thời không làm nhau bị đăng xuất.
  evidence: Review Story 1.2: khi hai request refresh chạy đua, request thua trả 401 kèm Set-Cookie xoá cookie; nếu response này tới sau response của bên thắng thì cookie mới bị xoá. I/O matrix của 1.2 (frozen) yêu cầu xoá cookie khi token đã thu hồi, nên cách sửa hợp lý nằm ở phía client.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-quan-ly-composer-genre-va-series.md`
  summary: Thêm upload avatar cho Composer (lưu vùng public qua module `media`) và ô chọn ảnh trong form Composer của admin.
  evidence: Story 1.4 chốt để `Composer.avatar` nullable, chưa có trên form, vì upload ảnh cần module `media` của Story 1.6 (quyết định của founder).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-quan-ly-composer-genre-va-series.md`
  summary: Tìm Composer/Genre/Series không dấu hiện so khớp slug (đóng băng lúc tạo), nên sai sau khi đổi tên và `q` dạng số khớp hậu tố `-N`; chuyển sang tìm bằng `unaccent` (FTS, Story 2.4).
  evidence: Review Story 1.4: mẹo slug được Design Notes chấp nhận tạm thời; `unaccent` sẽ được bật cho FTS ở Story 2.4.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-quan-ly-composer-genre-va-series.md`
  summary: Dropdown/bộ lọc Composer trong admin chỉ tải 100 Composer đầu; cần combobox có tìm kiếm khi thư viện vượt 100 Composer.
  evidence: Implementation Notes của Story 1.4 và review (Blind Hunter).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-quan-ly-composer-genre-va-series.md`
  summary: Thêm integration test cho race P2003 khi create/update Series (Composer bị xoá giữa bước kiểm tra và bước ghi → 400 composerId, không 500).
  evidence: Verification-gap review Story 1.4; có sẵn mẫu spy `findUnique` trong test xoá Composer.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-tao-va-sua-thong-tin-sheet-draft.md`
  summary: Story 1.8 (publish) phải đọc và khoá `first_published_at` trong cùng transaction (SELECT … FOR UPDATE) với bước PATCH sinh lại slug, để slug không bị sinh lại sau lần publish đầu; cân nhắc thêm CHECK cho bất biến giữa status và `first_published_at`.
  evidence: Review Story 1.5: `SheetsService.update` đọc `firstPublishedAt` ngoài transaction ghi; hiện chưa có publish nên chưa xảy ra được.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-tao-va-sua-thong-tin-sheet-draft.md`
  summary: Fallback race P2003 khi create/update Sheet trả 400 không kèm details và chưa có test; bổ sung details theo trường (chạy lại assertRefs) cùng test stub.
  evidence: Verification-gap review Story 1.5 (disposition defer).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-tao-va-sua-thong-tin-sheet-draft.md`
  summary: Danh sách chọn Genre (checkbox), Series và bộ lọc Composer trong form/bảng Sheet chỉ tải 100 mục đầu; cần picker có tìm kiếm (gộp với mục dropdown Composer của Story 1.4). Tìm không dấu theo tiêu đề cũng dựa vào slug nên hỏng sau khi slug đóng băng; gộp với mục `unaccent` của Story 2.4.
  evidence: Review Story 1.5 (Blind Hunter, Edge Case Hunter).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-upload-pdf-tu-dong-tao-thumbnail-va-anh-tung-trang.md`
  summary: Cron GC (Story 1.8) và rollback upload phải xử lý trường hợp hai upload cùng nội dung (key trùng hash) chạy đồng thời: chỉ xoá object khi không còn dòng `sheet_files` nào tham chiếu, kể cả bản đang được commit (cân nhắc khoá theo sheet hoặc thời gian ân hạn).
  evidence: Review Story 1.6: `discardUnreferenced` kiểm tra DB rồi mới xoá, nhưng không nguyên tử với request đang chạy song song.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-upload-pdf-tu-dong-tao-thumbnail-va-anh-tung-trang.md`
  summary: Thêm integration test cho việc khoá dòng sheet (`FOR UPDATE`) khi hai upload vào cùng một Sheet chạy đồng thời (cần hook để giữ một transaction mở).
  evidence: Verification-gap review Story 1.6 (disposition defer).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-upload-midi-va-mp3.md`
  summary: Cron GC (Story 1.8) khi dọn file superseded phải tôn trọng cặp MIDI/MIDI_JSON (và PDF/THUMBNAIL/PAGE_IMAGE): không bao giờ để một dòng MIDI hiện hành tồn tại mà thiếu MIDI_JSON đi kèm, hoặc ngược lại.
  evidence: Review Story 1.7 (Blind Hunter): hiện tại được đảm bảo bởi transaction ghi/supersede đồng thời cả hai; chỉ là rủi ro tiềm ẩn cho logic GC viết sau.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-1-khung-site-cong-khai-song-ngu.md`
  summary: Integration test của API chập chờn (timeout hàng loạt, mỗi lần một spec khác nhau) khi chạy cả suite, nhưng xanh khi chạy riêng.
  evidence: Thấy ở Story 1.9 (`catalog-sheets.spec`, `sheet-files.spec`) và Story 2.1 (`catalog-taxonomy.spec` 401, `sheet-files.spec` timeout 60s liên tiếp); chạy riêng `sheet-files.spec` xanh 43/43. Cần tái hiện có log S3/DB (nghi treo gọi S3 hoặc tranh chấp DB test dùng chung) để xác định nguyên nhân.
