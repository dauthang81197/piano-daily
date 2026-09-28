# Epic 1 Context: Founder đăng nhập và đưa Sheet lên thư viện

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Dựng nền móng monorepo mà mọi epic sau dùng chung, và cho founder một khu admin an toàn. Tại đó founder đăng nhập, quản lý Composer/Genre/Series/Sheet, upload PDF/MIDI/MP3 để hệ thống tự xử lý (đếm trang, thumbnail, ảnh từng trang, note-JSON), rồi publish Sheet khi đủ điều kiện. Epic này không có đặt giá (thuộc Epic 3). Xem trước Draft cũng không nằm ở đây mà ở Epic 2, vì nó cần trang chi tiết của web. Kết thúc epic, thư viện có dữ liệu thật hoặc seed sẵn để Epic 2 hiển thị.

## Stories

- Story 1.1: Khởi tạo monorepo và môi trường local
- Story 1.2: API xác thực admin với guard deny-by-default
- Story 1.3: Admin app: đăng nhập, layout và đổi mật khẩu
- Story 1.4: Quản lý Composer, Genre và Series
- Story 1.5: Tạo và sửa thông tin Sheet (Draft)
- Story 1.6: Upload PDF, tự động tạo thumbnail và ảnh từng trang
- Story 1.7: Upload MIDI và MP3
- Story 1.8: Publish, Archive, đánh dấu HOT và dọn file
- Story 1.9: Seed dữ liệu mẫu

## Requirements & Constraints

- **Đăng nhập admin:** bằng email + mật khẩu, có đăng xuất và đổi mật khẩu. Chưa có phiên hợp lệ thì mọi route admin chuyển về `/login` và không để lộ dữ liệu nào.
- **Bảo mật auth:** mật khẩu hash bằng bcrypt; JWT access + refresh; endpoint login có rate limit. Đăng nhập sai trả lỗi chung, không tiết lộ email có tồn tại hay không.
- **CRUD:** Sheet, Composer, Genre, Series. Danh sách có tìm kiếm, lọc và phân trang. Sheet Draft không bao giờ xuất hiện ở trang công khai.
- **Upload:** kéo-thả, có tiến trình. Giới hạn PDF/MP3 ≤ 20MB và MIDI ≤ 2MB; sai định dạng hoặc vượt dung lượng thì bị từ chối rõ ràng. Sheet không bao giờ bị lưu ở trạng thái thiếu file, và không có object mồ côi trên storage.
- **File gốc (PDF/MIDI/MP3):** không bao giờ có URL public.
- **Log:** pino JSON, mỗi request có `requestId`. Không log email đầy đủ, token, secret hay IP thô.
- **Seed:** 1 SUPER_ADMIN (lấy từ env), 4 Level, vài Composer/Genre/Series và 10 Sheet mẫu trải đều 4 Level. Phần lớn ở trạng thái PUBLISHED, có ít nhất 1 Draft và 1 HOT. File mẫu phải đi qua đúng pipeline của `media`. Seed phải idempotent.

## Technical Decisions

- **Cấu trúc:** không dùng starter template. Monorepo pnpm 12.6 + Turborepo 2.11 gồm `apps/{web,admin,api}` và `packages/{shared,tokens}`, cùng `docker-compose.yml` (local: web, admin, api, postgres 18, seaweedfs), `docker-compose.prod.yml` và `.env.example`.
- **Phiên bản pin:**
  - Pin chính xác: TypeScript 6.0.3; Prisma CLI, `@prisma/client` và `@prisma/adapter-pg` 7.10.0.
  - Còn lại: Node 24.21 (image `node:24.21-bookworm-slim` + `poppler-utils`), Next.js 16.3 + React 19.3, Tailwind 4.3, shadcn CLI 4.21, NestJS 12.1, zod 4.6, sharp 0.35, `@tonejs/midi` 2.0, pino 10.3 / nestjs-pino 5.2.
- **Modular monolith NestJS:** `apps/api` là CommonJS, mỗi bảng có đúng một module chủ. Epic này chạm tới:
  - `identity`: User, RefreshToken.
  - `catalog`: Sheet, SheetFile, Composer, Genre, SheetGenre, Series, `recomputeDerived`, cron GC.
  - `media`: là module duy nhất nói chuyện với S3; xử lý PDF/MIDI.

  Web và admin là client mỏng, chỉ gọi API qua HTTP.
- **Hợp đồng API:** `packages/shared` là hợp đồng duy nhất, chứa zod DTO, enum (`Role`, `Level`, `FileType`, `SheetStatus`…) và danh mục mã lỗi. API validate bằng chính các schema này (standard-schema của Nest 12, fallback là `nestjs-zod`). Có test kiểm tra enum shared trùng với enum Prisma.
- **Prisma:** generator `prisma-client`, output `apps/api/src/generated`, `moduleFormat = "cjs"`, dùng adapter-pg. Cấu hình qua `prisma.config.ts`, file này tự nạp `.env`. API chạy `prisma migrate deploy` trước khi listen.
- **Config:** chỉ đọc từ env qua `ConfigModule`, validate bằng zod lúc khởi động; thiếu biến thì app dừng và nêu rõ tên biến.
- **Auth deny-by-default:**
  - Guard JWT là global; route public phải đánh dấu `@Public()`. Có test liệt kê mọi route và fail nếu route `@Public()` nằm ngoài allowlist.
  - Access token 15 phút, giữ trong bộ nhớ của admin.
  - Refresh token xoay vòng, đặt trong cookie `httpOnly; Secure; SameSite=Strict; Path=/auth`. DB chỉ lưu hash; logout hoặc đổi mật khẩu thì thu hồi.
  - v1 chỉ dùng `SUPER_ADMIN`.
  - Admin app chỉ fetch dữ liệu client-side.
- **Biên HTTP:**
  - IP khách chỉ lấy qua `getClientIp()`: đọc `CF-Connecting-IP`, khi chạy local thì fallback về IP socket.
  - CORS theo allowlist tường minh; `credentials` chỉ bật cho origin admin.
  - Bật `helmet`.
  - Throttler chạy trong bộ nhớ; API chỉ chạy một instance.
- **Quy ước chung:**
  - PK dùng UUIDv7; `Sheet.public_id` tự tăng.
  - Model Prisma PascalCase, cột snake_case (`@map`), JSON camelCase, tên file kebab-case.
  - Thời gian lưu `timestamptz` UTC.
  - List trả `{items,page,pageSize,total}`; lỗi trả `{error:{code,message,details?}}`, với `code` SCREAMING_SNAKE lấy từ shared.
  - Slug tự sinh từ tên (bỏ dấu tiếng Việt), unique, tự thêm hậu tố khi trùng.
- **Storage hai vùng:**
  - public: thumbnail, page image webp, note-JSON; cache immutable.
  - private: file gốc; chỉ phát signed URL TTL 5 phút.
  - Key có dạng `{public|private}/sheets/{sheetId}/{fileType}/{hash}.{ext}`. Với R2 đặt checksum `WHEN_REQUIRED`.
  - Response chỉ chứa URL public đã resolve; `storage_key` và URL private không bao giờ lộ ra ngoài.
- **Upload đồng bộ, commit sau cùng:**
  1. Validate mime và dung lượng.
  2. Xử lý ngoài transaction: PDF qua `pdftoppm` + sharp thành webp và thumbnail; MIDI qua `@tonejs/midi` thành note-JSON. File `.mid` gốc không bao giờ public.
  3. Khi mọi object đã lưu xong mới mở transaction: ghi `SheetFile`, đánh `superseded_at` cho file cũ cùng type, gọi `recomputeDerived()`.
  4. Lỗi ở bất kỳ bước nào thì xoá các object vừa ghi.

  Không có queue.
- **Vòng đời Sheet:**
  - Trạng thái `DRAFT|PUBLISHED|ARCHIVED`.
  - `recomputeDerived()` (`SELECT … FOR UPDATE`) là nơi duy nhất ghi `has_*`, `page_count` và thumbnail. DTO không nhận các trường này.
  - Partial unique index: mỗi `(sheet_id, type)` của PDF/MIDI/MP3 chỉ có một file chưa bị superseded. Gỡ file đi qua endpoint riêng.
  - Điều kiện publish (kiểm phía server): có PDF đã xử lý, có Composer và Level. Slug đóng băng sau lần publish đầu.
  - "Xoá": Sheet chưa từng có Order thì hard delete, đã có Order thì chuyển ARCHIVED. FK dùng RESTRICT; bị chặn thì trả lỗi rõ ràng, không trả 500.
  - Cron GC của `catalog` quyết định xoá object S3 của file superseded, `media` thực thi.
  - Không có cột `download_count`.
- **Test:** Vitest cho mọi workspace, chạy qua `pnpm test` bằng Turborepo. `apps/api` có integration test với Postgres thật (container riêng, migrate trước khi chạy).

## UX & Interaction Patterns

- **Token "Ivory & Walnut":** đặt trong `packages/tokens` dưới dạng Tailwind v4 `@theme`, gồm màu, typography, rounded và spacing. Web và admin cùng import.
- **UI kit:** admin dùng shadcn/ui, chỉ override theo thương hiệu:
  - nút chính màu walnut (primary);
  - lỗi dùng kiểu `form-error` (nền error-container, có icon, đọc được bằng screen reader);
  - label gắn với input, focus ring brass 2px.
- **Tối ưu cho desktop.** Sidebar gồm Dashboard, Sheet, Composer/Genre/Series, Quảng cáo, Đơn hàng, Cài đặt.
- **Bảng dữ liệu:** ô tìm kiếm và bộ lọc cố định trên đầu bảng, có phân trang, click hàng để mở form sửa.
- **Uploader:**
  - kéo-thả, có fallback click để chọn file;
  - tiến trình theo %; preview ngay khi xong (thumbnail PDF, audio player nhỏ cho MP3, thông tin cơ bản của MIDI);
  - lỗi hiện ngay tại ô upload với lý do cụ thể, không chờ submit form, và không làm mất dữ liệu các trường khác.
- **Form Sheet:** preview video YouTube ngay trong form (link sai thì báo lỗi tại trường); lyrics & chords dùng markdown editor. Publish không có hộp "bạn có chắc?".
- **Luồng làm việc:** hết hạn access token thì tự refresh một lần rồi gửi lại request; refresh thất bại thì về `/login`. Đổi mật khẩu xong phải đăng nhập lại.
- **Microcopy:** trang trọng, không emoji; lỗi nói rõ chuyện gì đã xảy ra và cần làm gì tiếp.

## Cross-Story Dependencies

- **Nền móng:** 1.1 là nền cho mọi story.
- **Auth:** 1.2 (API auth) phải xong trước 1.3 (admin app), và mọi route `/admin/*` về sau đều cần guard của 1.2.
- **Chuỗi Sheet:** 1.4 → 1.5 → 1.6/1.7 → 1.8. Sheet cần Composer; upload cần Sheet; publish cần PDF đã xử lý.
- **Seed:** 1.9 phụ thuộc toàn bộ pipeline `media` và các bảng của 1.2–1.8.
- **Mỗi story tự tạo migration cho bảng mình sở hữu.**
- **Liên epic:**
  - Bảng Order ra đời ở Epic 3. Trước đó, điều kiện "đã có Order thì chuyển ARCHIVED" chưa có hiệu lực (mọi Sheet đều hard delete được), và hook "còn DownloadToken sống tham chiếu file" của GC luôn trả false.
  - Xem trước Draft (preview token do `identity` cấp) thuộc Epic 2.
  - Cache revalidate khi admin thay đổi nội dung thuộc Epic 2.
  - Đặt giá và `is_free` thuộc Epic 3.
