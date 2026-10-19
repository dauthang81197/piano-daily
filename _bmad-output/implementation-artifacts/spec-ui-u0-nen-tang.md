---
title: 'UI/UX U0: công cụ chụp ảnh + thành phần dùng chung'
type: 'chore'
created: '2026-10-19'
status: 'in-review'
baseline_commit: 'a135d0b68399b554ac3d252fe3a206e674de0c3a'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/spec-ui-ux-lo-trinh.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Chưa có cách nhìn giao diện thật để chấm "đẹp", và `components/ui` chỉ có `Button` (2 biến thể, 1 cỡ) + `Input`, nên mỗi trang tự viết lại thẻ/huy hiệu/skeleton bằng chuỗi class riêng.

**Approach:** (1) Thêm script `apps/web/scripts/shots.mjs` chụp các trang công khai ở 390/768/1280px bằng `playwright-core` (dùng Chromium đã có trên máy), kèm hướng dẫn dựng API + dữ liệu mẫu cục bộ. (2) Thêm token bóng/chuyển động (chỉ bổ sung). (3) Mở rộng `Button` (cỡ, ghost) và thêm `Card`, `Badge`, `Skeleton`, `PageHeader` có test; chưa đổi trang nào (giai đoạn sau dùng).

## Boundaries & Constraints

**Always:** Tương thích ngược: `Button` không truyền cỡ/biến thể mới vẫn render đúng như cũ (test hiện có xanh). Token mới chỉ thêm, không đổi giá trị cũ (admin dùng chung `theme.css`). Chuyển động tôn trọng `prefers-reduced-motion`. Script chụp không chạm production: chỉ nhận URL gốc qua tham số, mặc định `http://localhost:4100`. Ảnh ghi vào `apps/web/.shots/` (gitignore).

**Never:** Đổi trang/layout hiện có, màu, font; thêm thư viện UI/animation; commit ảnh; tải trình duyệt trong `postinstall` (dùng Chromium sẵn có hoặc biến `PLAYWRIGHT_CHROMIUM_PATH`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Chụp bình thường | `pnpm --filter @piano-daily/web shots -- --label before` khi web chạy | 3 ảnh mỗi trang trong `.shots/before/<viewport>/<trang>.png` | N/A |
| Web chưa chạy | URL gốc không phản hồi | Thoát mã ≠ 0, thông báo tiếng Việt nêu cách chạy web | In URL đã thử |
| Không thấy Chromium | Không có đường dẫn hợp lệ | Thoát mã ≠ 0, hướng dẫn đặt `PLAYWRIGHT_CHROMIUM_PATH` | N/A |
| Một trang lỗi 4xx/5xx | Trang không tồn tại | Vẫn chụp, ghi cảnh báo + mã trạng thái, tiếp tục trang khác, cuối cùng thoát mã ≠ 0 | Liệt kê trang lỗi |
| Button cũ | `<Button>` / `variant="secondary"` / có `href` | Class và hành vi y như trước | N/A |
| Button mới | `size="sm"/"lg"`, `variant="ghost"` | Class tương ứng; mọi cỡ giữ vùng chạm ≥ 44px trên mobile (trừ `sm` chỉ dùng trong hàng dày, có `min-h-9`) | N/A |

</frozen-after-approval>

## Code Map

- `apps/web/src/components/ui/button.tsx` -- thêm `size`, variant `ghost`; giữ `base` hiện tại cho mặc định.
- `apps/web/src/components/ui/{card,badge,skeleton,page-header}.tsx` -- mới; dùng `cn` từ `@/lib/cn`.
- `apps/web/src/components/catalog/sheet-card.tsx` -- `LEVEL_BADGE`/`badge` hiện export tại đây; `Badge` mới dùng cùng map (không sửa SheetCard ở U0).
- `packages/tokens/theme.css` -- thêm `--shadow-card`, `--shadow-card-hover`, `--ease-standard`, `--duration-fast/base`.
- `apps/web/scripts/shots.mjs` -- mới; danh sách trang lấy từ `/vi`, `/vi/level/beginner`, `/vi/search`, `/vi/pricing`, `/vi/courses`, một `/vi/sheet/<slug>` và một khoá/bài đầu tiên (đọc qua API công khai); thiếu thì bỏ qua.
- `apps/web/package.json` -- thêm devDependency `playwright-core` và script `shots`.
- `.gitignore` -- thêm `apps/web/.shots/`.
- `README.md` -- mục "Chụp ảnh giao diện" (dựng DB/API/seed, chạy web, chạy script).
- Cách dựng cục bộ: `docker compose up -d postgres seaweedfs`; API `pnpm --filter @piano-daily/api db:seed` rồi `dev`; web `pnpm --filter @piano-daily/web dev` (cổng 4100, API 4000). Không đổi `apps/api`.

## Tasks & Acceptance

**Execution:**
- [x] `packages/tokens/theme.css` -- thêm token bóng + chuyển động -- nền cho U1–U5
- [x] `apps/web/src/components/ui/button.tsx` + `button.test.tsx` -- `size` (sm/md/lg), `ghost` -- cho header/hero
- [x] `apps/web/src/components/ui/{card,badge,skeleton,page-header}.tsx` + test -- thành phần chung
- [x] `apps/web/scripts/shots.mjs`, `package.json`, `.gitignore`, `README.md` -- công cụ chụp ảnh + hướng dẫn
- [x] Dựng môi trường thật, chạy `shots --label before` và xem ảnh -- lấy ảnh "trước" cho U1

**Acceptance Criteria:**
- Given DB seed + API + web đang chạy, when chạy `shots --label before`, then có ảnh ở 3 cỡ cho các trang tồn tại và ảnh xem được (không trắng/lỗi).
- Given test hiện có, when chạy test web, then xanh và không đổi hành vi trang nào.
- Given admin dùng chung `theme.css`, when build admin, then vẫn thành công.

## Implementation Notes

Đã làm: token bóng/chuyển động; `Button` thêm `size`/`ghost` (lớp mặc định giữ nguyên); `Card`, `Badge`, `Skeleton`, `PageHeader` + `ui-kit.test.tsx`; `scripts/shots.mjs` (+ test `findChromium`), `playwright-core@1.64.1`, `.gitignore`, README. Web: lint/typecheck/test (853) xanh, web + admin build xanh. Lưu ý: không `source .env` khi build (`NODE_ENV=development` làm build lỗi); chỉ nạp .env khi chạy `dev`.

Ảnh "trước" (27 ảnh, `apps/web/.shots/before`) cho thấy các vấn đề cho U1–U5:
- **Header (U1):** ở 768px trang rộng 1110px, tức tràn ngang (nav 8 link + ô tìm + Tìm + English + Đăng nhập không vừa); nhãn nav và nút "Đăng nhập" bị ngắt làm 2 dòng ở 1280px; nút "Tìm" tách rời ô tìm.
- **Trang chủ (U1):** cột 768px lệch trái, trống phía dưới, chỉ 4 nút Level.
- **Thẻ Sheet (U2):** thumbnail seed hiện ảnh vỡ (alt text) vì S3 local không phục vụ qua trình duyệt; cần xử lý ở U0-seed hoặc xác nhận môi trường trước khi chấm thẻ.
- **Chi tiết Sheet (U3):** trang PDF trang 1–4 cũng ảnh vỡ; khối nhạc và video là ô rỗng lớn; 2 cột chỉ ở nửa dưới trang.
- **Khoá học (U4):** seed chưa có khoá học nên chỉ chụp được danh sách rỗng; cần dữ liệu mẫu khoá học trước U4.

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `pnpm --filter @piano-daily/web lint && pnpm --filter @piano-daily/web typecheck && pnpm --filter @piano-daily/web test` -- expected: xanh
- `pnpm --filter @piano-daily/web build && pnpm --filter @piano-daily/admin build` -- expected: thành công
- `pnpm --filter @piano-daily/web shots -- --label before` -- expected: ảnh trong `apps/web/.shots/before`
