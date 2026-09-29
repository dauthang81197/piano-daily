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
