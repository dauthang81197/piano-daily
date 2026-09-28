- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-khoi-tao-monorepo-va-moi-truong-local.md`
  summary: Thêm smoke test tự động cho `docker compose up --build` (health 200, 404 NOT_FOUND, web/admin 200) vào CI.
  evidence: Review Story 1.1 (verification-gap): chưa có CI; lỗi của image (pnpm deploy --prod, turbo prune, DATABASE_URL compose) chỉ lộ ra khi chạy tay. Nên làm ở Story 5.3.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-api-xac-thuc-admin-voi-guard-deny-by-default.md`
  summary: Admin client (Story 1.3) phải đảm bảo chỉ một tab gọi `/auth/refresh` tại một thời điểm (Web Locks API hoặc BroadcastChannel), để hai tab refresh đồng thời không làm nhau bị đăng xuất.
  evidence: Review Story 1.2: khi hai request refresh chạy đua, request thua trả 401 kèm Set-Cookie xoá cookie; nếu response này tới sau response của bên thắng thì cookie mới bị xoá. I/O matrix của 1.2 (frozen) yêu cầu xoá cookie khi token đã thu hồi, nên cách sửa hợp lý nằm ở phía client.
