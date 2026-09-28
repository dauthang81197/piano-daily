---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-Piano-Daily-2026-09-27/prd.md
  - _bmad-output/planning-artifacts/architecture/architecture-Piano Daily-2026-09-27/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-Piano-Daily-2026-09-27/EXPERIENCE.md
  - _bmad-output/planning-artifacts/briefs/brief-Piano-Daily-2026-09-27/addendum.md
  - _bmad-output/planning-artifacts/briefs/brief-Piano-Daily-2026-09-27/brief.md
---

# Piano Daily - Epic Breakdown

## Overview

Tài liệu này phân rã toàn bộ yêu cầu của Piano Daily từ PRD, UX Design (DESIGN.md + EXPERIENCE.md) và Architecture Spine thành các epic và story có thể triển khai.

## Requirements Inventory

### Functional Requirements

FR1: Duyệt theo Level. Guest xem lưới Sheet `PUBLISHED` của một Level. Mỗi thẻ có thumbnail, tiêu đề, Composer, lượt xem, các định dạng có sẵn (theo `has_*`) và số trang. Lưới có phân trang và sắp xếp theo mới nhất hoặc xem nhiều nhất.
FR2: Tìm kiếm toàn văn. Tìm Sheet theo tên bài, tên Composer, lyrics hoặc ID. Có thể lọc thêm theo Level, Genre, Composer và định dạng; các bộ lọc kết hợp kiểu AND.
FR3: Trang Composer (`/composer/{slug}`) và trang Genre (`/genre/{slug}`). Mỗi trang hiển thị thông tin và lưới Sheet thuộc đúng Composer hoặc Genre đó.
FR4: Chi tiết Sheet. Hiển thị tiêu đề, Composer, Level, điểm và ghi chú độ khó, số trang, lượt xem, ngày cập nhật, ảnh từng trang, danh sách Sheet cùng Series và Lyrics & Chords (nếu có). Sheet HOT có badge trên cả thẻ và trang chi tiết. `view_count` chỉ tăng một lần cho mỗi IP/phiên trong một khoảng thời gian.
FR5: MIDI player ngay trên trang. Có phím đàn ảo hiển thị nốt đang phát, thanh tua, tốc độ 0.5x–2x và ghi chú rằng đây là bản mô phỏng. Không cần tải file hay đăng nhập.
FR6: Video YouTube nhúng (lazy-load) kèm ghi chú nguồn bên thứ ba. Sheet không có `youtube_url` thì không hiển thị khối video.
FR7: Với Sheet không FREE, bấm Download mở modal thanh toán gồm tên bài, loại file, giá, lựa chọn mua lẻ hoặc Bundle và ô email (guest). Với Sheet FREE thì tải ngay. Giá trong modal luôn là giá hiện tại, không lấy từ cache.
FR8: Thanh toán qua PayPal Smart Payment Buttons. Backend luôn tự tính lại giá. Order chuyển PAID chỉ khi PayPal trả `COMPLETED` và amount/currency khớp với Order.
FR9: Khi Order chuyển PAID, hệ thống sinh DownloadToken (mặc định 7 ngày / 5 lượt, admin chỉnh được), hiển thị trang "Thanh toán thành công" có nút tải và gửi email chứa link tải lại. Mua lại với cùng email khi token còn hiệu lực thì không phải trả tiền lần hai. Token hết hạn hoặc hết lượt trả lỗi rõ ràng. Mỗi lượt tải đều được ghi log.
FR10: Webhook PayPal (`CAPTURE.COMPLETED/REFUNDED/DENIED`) được xác minh chữ ký và xử lý idempotent theo `provider_event_id`. Webhook REFUNDED chuyển Order sang REFUNDED và vô hiệu hoá token.
FR11: Admin đăng nhập bằng email + mật khẩu, có đăng xuất và đổi mật khẩu. Mọi route admin yêu cầu phiên hợp lệ; chưa đăng nhập thì chuyển về trang login.
FR12: CRUD Sheet (Draft/Published, HOT), Composer, Genre và Series. Danh sách có tìm kiếm, lọc và phân trang. Sheet Draft không xuất hiện ở bất kỳ trang công khai nào.
FR13: Upload PDF/MIDI/MP3 bằng kéo-thả, có thanh tiến trình. PDF tự đếm trang, tạo thumbnail và ảnh từng trang. File sai định dạng hoặc vượt dung lượng (PDF/MP3 ≤ 20MB, MIDI ≤ 2MB) bị từ chối rõ ràng, và Sheet không bị lưu ở trạng thái thiếu file.
FR14: Đặt giá PDF/MIDI/MP3, giá Bundle hoặc đánh dấu Miễn phí. Có công cụ đặt giá hàng loạt theo Level/Composer/Genre. Sheet Miễn phí bỏ qua modal thanh toán.
FR15: Quản lý Order. Có danh sách lọc theo trạng thái/ngày/email, trang chi tiết, lịch sử tải, gửi lại email, gia hạn token và hoàn tiền qua PayPal Refund API. Hoàn tiền phải vô hiệu hoá token (đồng bộ với FR10).
FR16: CRUD AdSlot theo vị trí, bật/tắt độc lập từng vị trí. Tắt một slot có hiệu lực ngay trên frontend mà không cần deploy.
FR17: Dashboard gồm lượt xem/tải theo Level, doanh thu theo ngày/tháng, số đơn và top Sheet bán chạy/xem nhiều. Doanh thu bằng tổng Order PAID trừ đi các Order REFUNDED.
FR18: Cài đặt site gồm tên, logo, SEO mặc định, link YouTube, bật/tắt thanh toán và giá trị mặc định cho hạn dùng/số lượt của token mới.
FR19: Tự chọn Locale theo IP (VN → `vi`, còn lại → `en`). Người dùng đổi tay được và lựa chọn được nhớ lại; IP không ghi đè lựa chọn thủ công. Chỉ dịch UI chrome, nội dung Sheet chỉ có một phiên bản.
FR20: SEO. Mọi trang công khai render phía server (SSR), có meta theo Locale, Open Graph và JSON-LD MusicComposition cho trang chi tiết. `sitemap.xml` cập nhật khi có Sheet mới được publish. View-source phải thấy đủ nội dung chính.

### NonFunctional Requirements

NFR1: Bảo mật thanh toán. Giá luôn được tính lại phía server từ dữ liệu Sheet hiện tại, không bao giờ tin giá client gửi lên. Webhook được xác minh chữ ký và xử lý idempotent theo `provider_event_id`.
NFR2: Bảo mật file. PDF/MIDI/MP3 gốc không có URL public, chỉ phục vụ qua signed URL ngắn hạn sinh từ token hợp lệ. Endpoint tải có rate limit.
NFR3: Xác thực admin dùng JWT access + refresh, mật khẩu hash bằng bcrypt và rate limit trên endpoint login.
NFR4: SEO/hiệu năng. Mọi trang công khai phải SSR/SSG được, nội dung chính không phụ thuộc client-side rendering.
NFR5: Nghe/xem/video luôn miễn phí và không nằm sau bất kỳ bước xác thực hay thanh toán nào (SM-C1).
NFR6: Trang chi tiết và MIDI player tải và phát mượt trên kết nối di động thông thường (SM-3).
NFR7: Tiền tệ duy nhất là USD, hiển thị USD cho mọi Locale và không quy đổi sang VND.
NFR8: Nền tảng là web responsive (desktop + mobile), hỗ trợ trình duyệt hiện đại có Web Audio API.
NFR9: Email là best-effort. Lỗi gửi email không bao giờ làm rollback một thanh toán đã thành công.
NFR10: Log. Dùng pino JSON, mỗi request có `requestId`; không log email đầy đủ, token, secret hay IP thô.

### Additional Requirements

**Khởi tạo dự án (ảnh hưởng Epic 1 Story 1).** Không dùng starter template có sẵn. Architecture quy định một Structural Seed cho monorepo pnpm 12.6 + Turborepo 2.11, gồm `apps/{web,admin,api}` và `packages/{shared,tokens}`, cùng `docker-compose.yml` (local: web, admin, api, postgres, seaweedfs), `docker-compose.prod.yml` và `.env.example`. Story đầu tiên phải scaffold đúng cấu trúc này với các phiên bản được pin trong bảng Stack.

- Stack được pin: Node 24.21 (`node:24.21-bookworm-slim` + `poppler-utils`), TypeScript 6.0.3 (exact), Next.js 16.3 + React 19.3, Tailwind 4.3, shadcn CLI 4.21 (admin), next-intl 4.14, NestJS 12.1, Prisma 7.10.0 (exact cho CLI, client và adapter-pg), PostgreSQL 18.6, zod 4.6, `@paypal/paypal-server-sdk` 2.5, `@paypal/react-paypal-js` 10.5, sharp 0.35, Tone.js 15.1, `@tonejs/midi` 2.0, Resend 6.30, pino 10.3 / nestjs-pino 5.2.
- Kiến trúc là modular monolith NestJS với các module `catalog`, `media`, `commerce`, `identity`, `ads`, `settings`, `analytics`, `notify`. Mỗi bảng có đúng một module chủ (AD-1). Web và admin là client mỏng, chỉ gọi API qua HTTP.
- `packages/shared` là hợp đồng API duy nhất (AD-2): zod DTO, enum, bảng chuyển trạng thái Order, danh mục mã lỗi và hàm sinh cache tag. Có một test kiểm tra enum shared trùng với enum Prisma. Validation dùng standard-schema của Nest 12, fallback là `nestjs-zod`.
- Tiền là số nguyên cents USD (`*_cents`) ở mọi lớp; `Order.items` lưu snapshot (AD-3).
- Máy trạng thái Order và `fulfil()` idempotent (AD-4):
  - Chuyển trạng thái hợp lệ: `PENDING→PAID|FAILED|CANCELLED`, `CANCELLED|FAILED→PAID` (thanh toán đến muộn), `PAID→REFUNDED`.
  - Webhook insert `PaymentEvent` UNIQUE trước khi xử lý. Lệch số tiền thì đặt `review_required`.
  - Cron huỷ Order PENDING quá 24h, nhưng chỉ sau khi `GET order` trên PayPal.
- PayPal nằm sau port `PaymentProvider` (AD-5). Verify webhook qua REST `/v1/notifications/verify-webhook-signature` với raw body và `PAYPAL_WEBHOOK_ID`. `PAYPAL_MODE` chọn sandbox hoặc live.
- Storage có hai vùng (AD-6):
  - public: thumbnail, page image webp, MIDI note-JSON; key theo content hash, cache immutable.
  - private: file gốc và backup, chỉ phát signed URL TTL 5 phút.
  - Key có dạng `{public|private}/sheets/{sheetId}/{fileType}/{hash}.{ext}`. Với R2 đặt checksum `WHEN_REQUIRED`.
- MIDI player chỉ đọc note-JSON sinh server-side bằng `@tonejs/midi`, không bao giờ public file `.mid` (AD-7).
- Một đường tải duy nhất (AD-8):
  - `GET /files/:sheetId/:fileType/download` cho Sheet free.
  - `GET /downloads/:token/:fileType` với câu UPDATE nguyên tử `used<max`, rồi ghi DownloadLog và redirect 302.
  - `GET /downloads/:token` trả trạng thái token.
  - `ALREADY_PURCHASED` khi mua lại cùng email.
  - `payments_enabled=false` chỉ chặn `create-order`.
- Upload xử lý đồng bộ (AD-9): PDF qua `pdftoppm` + sharp thành webp và thumbnail; MIDI thành note-JSON. Commit DB diễn ra sau cùng; lỗi thì xoá các object vừa ghi. Không có queue.
- Cache của web (AD-10):
  - SSR với `force-cache`, tag cộng `revalidate: 600`.
  - API gọi `POST /api/revalidate` (có secret, retry 3 lần). Handler gọi `revalidateTag(tag, {expire:0})`.
  - `CacheInvalidator.tagsFor(before, after)` tính tập tag.
  - Giá lấy bằng fetch `no-store`. Không bật `cacheComponents`.
- View beacon `POST /sheets/:id/view` với dedupe qua `SheetViewDedupe(sheet_id, visitor_hash, hour_bucket)` (AD-11).
- Locale nằm trên URL `/vi|/en`, có hreflang (AD-12). `proxy.ts` chỉ redirect path chưa có tiền tố, theo thứ tự cookie → `cf-ipcountry` → `en`. Cookie giữ 1 năm.
- Auth deny-by-default (AD-13):
  - Guard JWT global; route public phải đánh dấu `@Public()`, có test allowlist.
  - Access token 15 phút giữ trong bộ nhớ. Refresh token xoay vòng trong cookie httpOnly/Strict/`Path=/auth`, lưu hash và bị thu hồi khi logout.
  - Admin chỉ fetch dữ liệu client-side.
- Email qua `notify.EmailPort` (Resend), gửi sau commit; lỗi thì `email_sent_at` để null (AD-14).
- API chạy một instance (AD-15): throttler trong bộ nhớ và `@nestjs/schedule`. `prisma migrate deploy` chạy trước khi listen.
- Vòng đời Sheet (AD-16):
  - Trạng thái `DRAFT|PUBLISHED|ARCHIVED`. "Xoá" nghĩa là ARCHIVED; hard delete chỉ khi Sheet chưa từng có Order. FK dùng RESTRICT.
  - `recomputeDerived()` là nơi duy nhất ghi `has_*`, `page_count` và thumbnail.
  - Partial unique index: một file hiện hành cho mỗi `(sheet, type)`.
  - Cron GC xoá object S3.
  - Điều kiện publish: có PDF, Composer và Level; Sheet không free phải có ít nhất một type mua được. Slug đóng băng sau lần publish đầu.
- Báo giá một nguồn qua `PricingService.quote()` (AD-17). Type mua được = có file và giá > 0. BUNDLE cần ít nhất 2 type và gồm mọi type mua được. Client gửi `expectedTotalCents`; lệch thì trả `PRICE_CHANGED`.
- Biên HTTP (AD-18):
  - `getClientIp()` đọc `CF-Connecting-IP`; Caddy đặt `trusted_proxies` = dải Cloudflare.
  - SSR gọi `API_INTERNAL_URL` kèm `X-Internal-Secret`.
  - CORS theo allowlist, `credentials` chỉ cho admin.
  - `helmet` trên API; web có CSP cho PayPal, YouTube và CDN.
- Preview Draft bằng token ký 10 phút qua route `/[locale]/preview/sheet/[id]?token=`, render `no-store` + `noindex`, không đếm view (AD-19).
- Số liệu tải lấy từ `DownloadLog` (cả free lẫn paid). Không có cột `download_count`. Doanh thu tính theo `REPORT_TZ=Asia/Ho_Chi_Minh` (AD-20).
- AdSlot `html_code` chỉ render trong `<iframe sandbox="allow-scripts allow-popups" srcdoc>` (AD-21).
- Quy ước chung:
  - UUIDv7 cho PK; `Sheet.public_id` tự tăng; `order_code` có dạng `PD-XXXXXX`.
  - Response lỗi `{error:{code,message}}`; list trả `{items,page,pageSize,total}`.
  - Thời gian lưu `timestamptz` UTC.
  - Search dùng Postgres FTS (`tsvector` generated + `unaccent` + config `simple`, GIN index, migration SQL tay); query toàn số thì khớp `public_id`.
  - Config env được validate bằng zod lúc khởi động.
- Hạ tầng production: một VPS chạy Docker Compose (web, admin, api, postgres, caddy, backup) sau Cloudflare proxy (bật IP Geolocation). Storage là R2 public + private. Service backup chạy `pg_dump` hằng đêm lên R2 private. Domain gồm `pianodaily.*`, `admin.*`, `api.*` và `cdn.*`.
- Seed data: 1 admin, 4 level, vài composer/genre và 10 sheet mẫu (addendum §6).
- Deferred (không làm ở v1, chỉ ghi nhận): hàng đợi nền; staging/CI/CD/giám sát (xem lại trước khi bật `PAYPAL_MODE=live`); test framework (giao cho TEA).

### UX Design Requirements

UX-DR1: Triển khai token "Ivory & Walnut" trong `packages/tokens` dưới dạng Tailwind v4 `@theme`, dùng chung cho web và admin. Gồm:
  - màu surface, primary walnut, secondary brass, tertiary burgundy, error, 4 màu level và hot-accent;
  - typography (display-lg, display-lg-mobile, headline-md/sm, body-lg/md, label-caps, caption);
  - rounded (sm → full);
  - spacing (unit 8, gutter 24, margin 16/64, section-gap 64).
UX-DR2: Font Playfair Display cho heading và Be Vietnam Pro cho body/UI, có subset tiếng Việt.
UX-DR3: Component `button-primary` (walnut) dùng cho điều hướng/CTA, và `button-secondary` (outline).
UX-DR4: Component `button-download` (brass) dùng cho mọi hành động tải/mua/thanh toán; không dùng brass cho hành động không liên quan tiền.
UX-DR5: Badge Level (4 màu, `label-caps`, đặt góc trên-trái thumbnail) và badge HOT (hot-accent, góc trên-phải).
UX-DR6: `card-sheet`. Click cả thẻ để mở chi tiết; hover nâng nhẹ bằng shadow ấm. Thẻ hiển thị nhãn định dạng `label-caps` và icon play mini để nghe thử 10–15 giây ngay tại lưới.
UX-DR7: Lưới Sheet 3/2/1 cột (lg/md/sm), **phân trang theo số trang, không dùng infinite scroll**, dùng skeleton card khi đang tải.
UX-DR8: `tag-genre` (chip `rounded.sm`, nền brass khi được chọn). Tag cloud trên trang Level lọc lưới ngay tại chỗ.
UX-DR9: Component `input`, focus viền brass 2px.
UX-DR10: `ad-slot` nền trung tính, viền dashed, không dùng màu thương hiệu. Khi tắt thì không chiếm không gian layout. Không chèn quảng cáo giữa các thẻ trong lưới.
UX-DR11: `form-error` (nền error-container, chữ error, có icon), đọc được bằng screen reader.
UX-DR12: `payment-modal`:
  - nền trắng, `rounded.lg`, overlay ấm `rgba(36,27,20,0.4)`, mở bằng fade (không trượt/nảy); toàn màn hình khi `< md`;
  - hiển thị tên bài, lựa chọn lẻ/Bundle, giá và email;
  - nút PayPal giữ style gốc của SDK; khi đang xử lý thì disable kèm spinner;
  - lỗi được báo theo lý do cụ thể và giữ nguyên lựa chọn đã chọn;
  - không đóng được bằng click nền khi popup PayPal đang mở; đóng modal không huỷ Order PENDING;
  - chỉ lồng một cấp modal.
UX-DR13: MIDI player:
  - play/pause, thanh tua kéo được, dropdown tốc độ 0.5x–2x;
  - phím trắng `surface-bright`, phím đen `on-surface`, nốt đang phát và nốt rơi highlight bằng brass, kèm **tên nốt dạng chữ** (không chỉ dựa vào màu);
  - không tự phát; không có animation bounce hay màu neon.
UX-DR14: Nhóm nút Download chỉ hiển thị định dạng thực sự có; định dạng không có thì ẩn hẳn, không hiện nút disable.
UX-DR15: State patterns:
  - search rỗng: dùng `headline-sm` và gợi ý bỏ bớt bộ lọc;
  - token hết hạn/hết lượt: báo "Link tải đã hết hiệu lực" kèm nút liên hệ;
  - Draft: trả 404;
  - lỗi upload: báo tại ô upload, không mất dữ liệu các trường khác.
UX-DR16: Accessibility floor:
  - alt text cho thumbnail và ảnh trang ("tên bài – trang N");
  - label gắn với input;
  - focus ring brass 2px trên mọi phần tử bấm được;
  - kiểm tra tương phản WCAG AA (còn `[NOTE FOR UX]` chưa đo).
UX-DR17: Responsive:
  - `≥ lg`: trang chi tiết 2 cột (nội dung + sidebar);
  - `md`: sidebar chuyển xuống dưới;
  - `< md`: menu hamburger, modal toàn màn hình.
  - Admin ưu tiên desktop.
UX-DR18: Voice & tone cho microcopy song ngữ: trang trọng, không emoji, lỗi phải nói rõ chuyện gì xảy ra và cần làm gì tiếp.
UX-DR19: Uploader admin:
  - kéo-thả, có fallback click để chọn file;
  - tiến trình %; preview ngay sau khi upload xong (thumbnail PDF, player MIDI/MP3);
  - lỗi validate hiện tức thì bằng `form-error`.
UX-DR20: Bảng dữ liệu admin có tìm kiếm và bộ lọc cố định, phân trang, click hàng để mở chi tiết. Nút hoàn tiền/gia hạn token dùng brass; lỗi dùng `form-error` (override shadcn/ui).
UX-DR21: Layout trang Level:
  - hero `display-lg` kèm tổng số bài và ô search lớn;
  - dòng "Sheet database updated on …";
  - tag cloud;
  - lưới.
UX-DR22: Layout trang chi tiết:
  - breadcrumb → H1 → meta → nút tải → player → ảnh sheet → khối MIDI/MP3 → video → Lyrics & Chords;
  - sidebar có Download PDF và các bài liên quan.
UX-DR23: Form Sheet admin có preview video YouTube và MIDI player ngay trong form, nút "Xem như người dùng" (preview token) và publish không cần hộp xác nhận.
UX-DR24: Header gồm logo, Home, Search, 4 Level và nút đổi ngôn ngữ; footer gồm about, link và disclaimer bản quyền.

### FR Coverage Map

FR1: Epic 2 - Duyệt Sheet theo Level
FR2: Epic 2 - Tìm kiếm toàn văn + bộ lọc
FR3: Epic 2 - Trang Composer / Genre
FR4: Epic 2 - Chi tiết Sheet + view count
FR5: Epic 2 - MIDI player nghe thử
FR6: Epic 2 - Video YouTube nhúng
FR7: Epic 3 - Modal thanh toán / tải ngay Sheet FREE
FR8: Epic 3 - Thanh toán PayPal, server định giá
FR9: Epic 3 - DownloadToken, trang thành công, email, tải lại
FR10: Epic 3 - Webhook PayPal idempotent
FR11: Epic 1 - Đăng nhập admin
FR12: Epic 1 - CRUD Sheet/Composer/Genre/Series, Draft/Published
FR13: Epic 1 - Upload file + xử lý PDF/MIDI
FR14: Epic 3 - Đặt giá lẻ/Bundle/Miễn phí, đặt giá hàng loạt
FR15: Epic 4 - Quản lý đơn hàng, hoàn tiền, gia hạn token
FR16: Epic 4 - Quản lý AdSlot
FR17: Epic 4 - Dashboard doanh thu & lượt dùng
FR18: Epic 4 - Cài đặt site
FR19: Epic 2 - Song ngữ theo IP
FR20: Epic 2 - SSR/SEO, JSON-LD, sitemap

## Epic List

### Epic 1: Founder đăng nhập và đưa Sheet lên thư viện
Founder đăng nhập admin, tạo và sửa Composer/Genre/Series/Sheet, upload PDF/MIDI/MP3 (hệ thống tự xử lý), xem trước bản Draft rồi Publish. Epic này không có đặt giá. Story đầu tiên scaffold monorepo theo Structural Seed.
**FRs covered:** FR11, FR12, FR13
**Ghi chú triển khai:** AD-1, AD-2, AD-6, AD-9, AD-13, AD-16, AD-19; seed data; UX-DR1, UX-DR19, UX-DR20, UX-DR23.

### Epic 2: Người dùng khám phá, xem và nghe thử Sheet
Guest duyệt theo Level, tìm kiếm, vào trang Composer/Genre và trang chi tiết Sheet. Họ xem ảnh sheet, nghe MIDI player, xem YouTube, tất cả miễn phí. Site có song ngữ theo IP và SSR/SEO đầy đủ.
**FRs covered:** FR1, FR2, FR3, FR4, FR5, FR6, FR19, FR20
**Ghi chú triển khai:** AD-7, AD-10, AD-11, AD-12, AD-18; Search FTS; UX-DR2–UX-DR10, UX-DR13–UX-DR18, UX-DR21, UX-DR22, UX-DR24. Nút Download chưa hoạt động (ẩn đi) cho tới Epic 3.

### Epic 3: Tải file và mua qua PayPal
Founder đặt giá (lẻ, Bundle, Miễn phí, đặt hàng loạt). Người dùng tải ngay Sheet FREE, hoặc mua qua modal PayPal, nhận trang thành công, email và link tải lại. Webhook xử lý idempotent.
**FRs covered:** FR7, FR8, FR9, FR10, FR14
**Ghi chú triển khai:** AD-3, AD-4, AD-5, AD-8, AD-14, AD-17, AD-20 (ghi DownloadLog); UX-DR4, UX-DR11, UX-DR12, UX-DR14, UX-DR15. Giá trị mặc định của token và cờ `payments_enabled` được đọc từ `settings` (có seed sẵn); UI để chỉnh chúng thuộc Epic 4.

### Epic 4: Founder vận hành kinh doanh
Founder quản lý đơn hàng (hoàn tiền, gửi lại email, gia hạn token), bật/tắt quảng cáo, xem dashboard doanh thu và lượt dùng, chỉnh cài đặt site.
**FRs covered:** FR15, FR16, FR17, FR18
**Ghi chú triển khai:** AD-4 (refund), AD-8 (TokenService), AD-10 (tag ads/settings), AD-20, AD-21; UX-DR10, UX-DR20.

### Epic 5: Ra mắt production
Site chạy thật trên domain qua Cloudflare, có backup hằng đêm và sẵn sàng bật `PAYPAL_MODE=live`.
**FRs covered:** không có FR mới. Epic này hiện thực hạ tầng production (AD-15, AD-18), `docker-compose.prod.yml`, service backup và checklist trước khi go-live.

**Phụ thuộc:** Epic 1 → Epic 2 → Epic 3 → Epic 4. Epic 5 có thể làm song song sau Epic 2 (go-live bản miễn phí trước).

## Epic 1: Founder đăng nhập và đưa Sheet lên thư viện

Founder đăng nhập admin, quản lý Composer/Genre/Series/Sheet, upload PDF/MIDI/MP3 (hệ thống tự xử lý) và publish Sheet. Epic này đặt nền móng monorepo cho mọi epic sau. Phần xem trước Draft (AD-19) nằm ở Epic 2 vì nó cần trang chi tiết của web.

### Story 1.1: Khoi tao monorepo va moi truong local

As a founder-developer,
I want một monorepo đúng Structural Seed của Architecture, chạy được toàn bộ ở local bằng một lệnh,
So that mọi story sau có nền móng thống nhất về cấu trúc, phiên bản và quy ước.

**Acceptance Criteria:**

**Given** repo trống
**When** scaffold hoàn tất
**Then** có pnpm workspaces + Turborepo với `apps/web` (Next.js 16.3), `apps/admin` (Next.js 16.3 + shadcn/ui), `apps/api` (NestJS 12.1, CommonJS), `packages/shared` và `packages/tokens`
**And** TypeScript được pin chính xác 6.0.3; Prisma, `@prisma/client` và `@prisma/adapter-pg` được pin chính xác 7.10.0; các phiên bản còn lại theo bảng Stack

**Given** Docker đã cài
**When** chạy `docker compose up` với `docker-compose.yml`
**Then** web, admin, api, postgres 18 và seaweedfs (S3 local) đều khởi động; api chạy `prisma migrate deploy` trước khi listen
**And** `GET /health` của api trả 200

**Given** api khởi động mà thiếu một biến bắt buộc trong `.env`
**When** `ConfigModule` validate bằng zod
**Then** app dừng với thông báo nêu rõ tên biến thiếu
**And** `.env.example` liệt kê đầy đủ mọi biến đang dùng

**Given** Prisma schema
**When** generate client
**Then** dùng generator `prisma-client` với output `apps/api/src/generated` và `moduleFormat = "cjs"`, cấu hình qua `prisma.config.ts` (có nạp `.env`)

**Given** một request tới API
**When** request được xử lý
**Then** log được ghi dạng pino JSON có `requestId`; `helmet` đã bật; lỗi trả theo dạng `{error:{code,message,details?}}`

**Given** `packages/tokens`
**When** web hoặc admin import tokens
**Then** các token "Ivory & Walnut" của DESIGN.md (màu, typography, rounded, spacing) có sẵn dưới dạng Tailwind v4 `@theme` (UX-DR1)

**Given** monorepo đã scaffold
**When** chạy `pnpm test` ở root
**Then** Turborepo chạy test của mọi workspace bằng Vitest; `apps/api` có cấu hình integration test dùng Postgres thật (container riêng cho test, migrate trước khi chạy) để các story sau viết được test transaction và test đồng thời
**And** có ít nhất một unit test mẫu và một integration test mẫu (gọi `GET /health`) chạy xanh
**And** chiến lược test chi tiết (risk-based) có thể được bổ sung sau bằng `bmad-testarch-test-design` mà không phải đổi runner

### Story 1.2: API xac thuc admin voi guard deny-by-default

As a founder,
I want đăng nhập an toàn vào hệ thống bằng email và mật khẩu,
So that chỉ mình tôi truy cập được các chức năng quản trị.

**Acceptance Criteria:**

**Given** bảng `User` và `RefreshToken` được tạo trong migration của story này (module `identity`), cùng seed 1 tài khoản SUPER_ADMIN lấy từ env
**When** gọi `POST /auth/login` với email và mật khẩu đúng
**Then** nhận access JWT hạn 15 phút trong body, và refresh token trong cookie `httpOnly; Secure; SameSite=Strict; Path=/auth`
**And** mật khẩu được lưu bằng hash bcrypt; bảng chỉ lưu hash của refresh token; `last_login_at` được cập nhật

**Given** sai mật khẩu hoặc tài khoản đã bị vô hiệu
**When** gọi `/auth/login`
**Then** trả 401 với mã lỗi chung, không tiết lộ email có tồn tại hay không
**And** endpoint có throttle theo IP khách; gọi quá ngưỡng thì trả 429. IP chỉ lấy qua helper `getClientIp()` (đọc `CF-Connecting-IP`, fallback về IP socket khi chạy local) (AD-18)

**Given** refresh token hợp lệ
**When** gọi `POST /auth/refresh`
**Then** nhận access token mới và refresh token được xoay vòng (token cũ bị thu hồi)
**And** dùng lại refresh token cũ thì bị từ chối

**Given** đã đăng nhập
**When** gọi `POST /auth/logout`, `GET /auth/me` hoặc `POST /auth/change-password` (có kiểm tra mật khẩu cũ)
**Then** logout thu hồi refresh token, `me` trả thông tin admin, và change-password đổi hash rồi thu hồi mọi refresh token

**Given** guard JWT đăng ký global (AD-13)
**When** gọi bất kỳ route nào không gắn `@Public()` mà không có token hợp lệ
**Then** trả 401
**And** có test liệt kê mọi route và fail nếu một route `@Public()` không nằm trong allowlist

**Given** `packages/shared`
**When** định nghĩa DTO auth và enum `Role`
**Then** DTO là zod schema, API validate bằng chính schema đó, và có test kiểm tra enum shared trùng enum Prisma (AD-2)

### Story 1.3: Admin app — dang nhap, layout va doi mat khau

As a founder,
I want một trang admin có màn đăng nhập, sidebar điều hướng và chức năng đổi mật khẩu,
So that tôi có nơi làm việc an toàn cho mọi thao tác quản trị.

**Acceptance Criteria:**

**Given** chưa có phiên hợp lệ
**When** truy cập bất kỳ route nào của admin
**Then** bị chuyển về `/login` và không có dữ liệu admin nào hiển thị (FR11)

**Given** màn login
**When** nhập đúng thông tin
**Then** vào Dashboard (tạm là trang trống) với sidebar gồm Dashboard, Sheet, Composer/Genre/Series, Quảng cáo, Đơn hàng, Cài đặt
**And** access token chỉ giữ trong bộ nhớ; tải lại trang thì app tự gọi `/auth/refresh` để khôi phục phiên

**Given** access token hết hạn khi đang thao tác
**When** một request trả 401
**Then** app tự refresh một lần rồi gửi lại request; refresh thất bại thì về `/login`

**Given** đã đăng nhập
**When** dùng chức năng đổi mật khẩu hoặc đăng xuất
**Then** đổi mật khẩu thành công bắt đăng nhập lại; đăng xuất xoá phiên và về `/login`

**Given** giao diện admin dùng shadcn/ui
**When** hiển thị nút và lỗi
**Then** nút hành động chính dùng màu primary (walnut), lỗi dùng kiểu `form-error`, label gắn với input (UX-DR11, UX-DR16)
**And** mọi dữ liệu admin được fetch client-side, không fetch trong server component (AD-13)
**And** API bật CORS theo allowlist tường minh, `credentials` chỉ cho origin admin, để cookie refresh hoạt động (AD-18)

### Story 1.4: Quan ly Composer, Genre va Series

As a founder,
I want tạo, sửa và xoá Composer, Genre và Series,
So that tôi có sẵn phân loại trước khi đăng Sheet.

**Acceptance Criteria:**

**Given** migration của story này tạo bảng `Composer` (name, slug, bio, avatar), `Genre` (name, slug, icon) và `Series` (name, slug, composer_id), do module `catalog` sở hữu
**When** admin gọi CRUD qua `/admin/composers`, `/admin/genres` và `/admin/series`
**Then** thao tác thành công; slug tự sinh từ tên (bỏ dấu tiếng Việt), unique, và tự thêm hậu tố khi trùng
**And** list trả `{items, page, pageSize, total}` và hỗ trợ tìm theo tên

**Given** Composer đang được Series hoặc Sheet tham chiếu
**When** admin xoá Composer đó
**Then** bị từ chối với thông báo rõ ràng (FK RESTRICT), không phải lỗi 500

**Given** trang admin Composer/Genre/Series
**When** founder mở danh sách
**Then** có bảng dữ liệu với ô tìm kiếm, phân trang, click hàng để sửa, và form tạo mới (UX-DR20)
**And** lỗi validate hiển thị bằng `form-error` ngay dưới trường

### Story 1.5: Tao va sua thong tin Sheet (Draft)

As a founder,
I want tạo và sửa thông tin một Sheet ở trạng thái Draft,
So that tôi soạn nội dung bài dần dần trước khi upload file và publish.

**Acceptance Criteria:**

**Given** migration của story này tạo bảng `Sheet` và `SheetGenre`
**When** kiểm tra schema
**Then** `Sheet` có các cột theo addendum §3 và AD-16: `public_id` tự tăng, slug, title, subtitle, composer_id, series_id nullable, level, difficulty_score 0–100, difficulty_note, description, lyrics_chords (markdown), youtube_url, `has_*`, page_count, view_count, is_hot, `status DRAFT|PUBLISHED|ARCHIVED`; PK là UUIDv7
**And** không có cột `download_count` (AD-20)

**Given** form tạo Sheet ở admin
**When** founder nhập tiêu đề, chọn Composer, Series, Genre (nhiều) và Level, nhập độ khó, mô tả, lyrics & chords (markdown editor) và link YouTube
**Then** Sheet được lưu ở trạng thái DRAFT, slug tự sinh
**And** link YouTube hợp lệ hiển thị preview video ngay trong form; link không hợp lệ báo lỗi tại trường (UX-DR23)

**Given** DTO tạo và sửa Sheet
**When** client gửi `has_*`, `page_count` hoặc thumbnail
**Then** các trường này bị bỏ qua hoặc bị từ chối, vì chỉ `recomputeDerived()` được ghi chúng (AD-16)

**Given** danh sách Sheet ở admin
**When** founder tìm theo tiêu đề và lọc theo Level, Status, Composer
**Then** bảng hiển thị đúng kết quả, có phân trang, click hàng để mở form sửa (FR12, UX-DR20)

### Story 1.6: Upload PDF, tu dong tao thumbnail va anh tung trang

As a founder,
I want kéo-thả file PDF vào form Sheet và để hệ thống tự đếm trang, tạo thumbnail và ảnh từng trang,
So that tôi không phải xử lý ảnh thủ công.

**Acceptance Criteria:**

**Given** migration của story này tạo `SheetFile` (type PDF|MIDI|MP3|THUMBNAIL|PAGE_IMAGE, storage_key, original_name, size, mime_type, page_number, superseded_at), kèm partial unique index cho mỗi `(sheet_id, type)` của PDF/MIDI/MP3 với `superseded_at IS NULL`
**When** kiểm tra module `media`
**Then** chỉ `media` nói chuyện với S3; có 2 vùng public và private với key `{public|private}/sheets/{sheetId}/{fileType}/{hash}.{ext}` (AD-6); R2 được cấu hình checksum `WHEN_REQUIRED`

**Given** PDF hợp lệ dung lượng ≤ 20MB
**When** gọi `POST /admin/sheets/:id/files` (multipart)
**Then** PDF gốc được lưu vào vùng private; `pdftoppm` + sharp tạo page image webp và thumbnail trang đầu ở vùng public
**And** chỉ sau khi mọi object đã lưu xong mới mở transaction: ghi `SheetFile`, đánh `superseded_at` cho PDF cũ, rồi `recomputeDerived()` cập nhật `page_count` và `has_sheet` (AD-9)

**Given** file sai mime hoặc > 20MB
**When** upload
**Then** bị từ chối 4xx với mã lỗi cụ thể, không có object hay dòng DB nào được tạo (FR13)

**Given** lỗi xảy ra giữa chừng (ví dụ `pdftoppm` fail)
**When** request kết thúc
**Then** các object vừa ghi lên S3 bị xoá và DB không thay đổi

**Given** uploader trong form Sheet
**When** founder kéo-thả hoặc click chọn file
**Then** thấy tiến trình %, xong thì hiện thumbnail ngay; lỗi hiện `form-error` tại ô upload và các trường khác trong form giữ nguyên dữ liệu (UX-DR19, UX-DR15)

**Given** API trả dữ liệu Sheet
**When** trả thông tin file
**Then** chỉ trả URL public đã resolve; không bao giờ lộ `storage_key` hay URL private

### Story 1.7: Upload MIDI va MP3

As a founder,
I want upload file MIDI và MP3 cho Sheet,
So that người dùng có thể nghe thử và mua các định dạng này.

**Acceptance Criteria:**

**Given** MIDI hợp lệ ≤ 2MB
**When** upload qua `POST /admin/sheets/:id/files`
**Then** file `.mid` gốc được lưu vào vùng private, và `media` dùng `@tonejs/midi` chuyển sang note-JSON lưu ở vùng public (AD-7)
**And** `recomputeDerived()` đặt `has_midi = true`

**Given** MP3 hợp lệ ≤ 20MB
**When** upload
**Then** file được lưu vào vùng private và `has_mp3 = true`

**Given** MIDI > 2MB, file không parse được, hoặc sai mime
**When** upload
**Then** bị từ chối với lỗi cụ thể; không có object nào mồ côi

**Given** Sheet đã có MIDI hoặc MP3
**When** upload file mới cùng type
**Then** file cũ được đánh `superseded_at`; tại mỗi thời điểm chỉ có một file hiện hành

**Given** founder muốn gỡ một file
**When** gọi endpoint xoá file riêng
**Then** SheetFile bị đánh superseded và `recomputeDerived()` cập nhật `has_*` tương ứng

**Given** form Sheet sau khi upload xong
**When** founder xem preview
**Then** MP3 phát được bằng audio player nhỏ; MIDI hiển thị thông tin cơ bản (thời lượng, số nốt) lấy từ note-JSON (UX-DR19)

### Story 1.8: Publish, Archive, danh dau HOT va don file

As a founder,
I want publish Sheet khi đã đủ điều kiện, đánh dấu HOT, và "xoá" Sheet mà không làm hỏng dữ liệu,
So that thư viện công khai chỉ có bài hoàn chỉnh và lịch sử bán hàng không bị mất.

**Acceptance Criteria:**

**Given** Sheet ở trạng thái DRAFT
**When** founder chuyển sang PUBLISHED
**Then** server kiểm tra điều kiện: đã có PDF xử lý xong, có Composer và Level; thiếu điều kiện thì trả lỗi liệt kê rõ điều kiện còn thiếu (AD-16)
**And** việc publish không có hộp "bạn có chắc?" (UX-DR23)
**And** slug bị đóng băng sau lần publish đầu tiên; sửa tiêu đề về sau không làm đổi slug

**Given** một Sheet
**When** founder bật hoặc tắt HOT
**Then** cờ `is_hot` được cập nhật

**Given** founder bấm "Xoá" một Sheet
**When** Sheet chưa từng có Order
**Then** Sheet bị hard delete
**And** nếu Sheet đã từng có Order thì chuyển sang ARCHIVED (bảng Order ra đời ở Epic 3; tới lúc đó điều kiện này có hiệu lực, còn trước đó mọi Sheet đều hard delete được)

**Given** các SheetFile đã bị superseded
**When** cron GC của `catalog` chạy
**Then** `media` xoá object S3 của file đó, và SheetFile tương ứng được dọn
**And** có hook kiểm tra "còn DownloadToken sống tham chiếu tới file"; trước Epic 3, hook luôn trả false

**Given** trang danh sách Sheet
**When** founder xem
**Then** thấy cột Status và HOT, và đổi được trạng thái ngay từ bảng hoặc từ form

### Story 1.9: Seed du lieu mau

As a founder-developer,
I want một lệnh seed tạo dữ liệu mẫu đầy đủ,
So that tôi phát triển và demo các epic sau mà không phải nhập tay.

**Acceptance Criteria:**

**Given** DB trống sau khi migrate
**When** chạy `pnpm db:seed`
**Then** DB có 1 SUPER_ADMIN (từ env), vài Composer, Genre và Series, cùng 10 Sheet mẫu trải đều 4 Level (addendum §6)
**And** các Sheet mẫu có file mẫu PDF, MIDI và MP3 (tự sinh hoặc đặt trong `apps/api/prisma/fixtures/`, không cần file thật) đi qua đúng pipeline của `media` (có thumbnail, page image và note-JSON), phần lớn ở trạng thái PUBLISHED, có ít nhất 1 Draft và 1 HOT

**Given** seed đã chạy
**When** chạy lại lệnh seed
**Then** không tạo bản ghi trùng (seed idempotent)

## Epic 2: Người dùng khám phá, xem và nghe thử Sheet

Guest duyệt theo Level, tìm kiếm, xem trang Composer/Genre và trang chi tiết Sheet; họ xem ảnh sheet, nghe MIDI player và xem YouTube hoàn toàn miễn phí. Site có song ngữ theo IP và SSR/SEO đầy đủ. Admin xem trước được bản Draft. Nút Download chưa hiển thị cho tới Epic 3.

### Story 2.1: Khung site cong khai song ngu

As a người dùng,
I want site hiển thị đúng ngôn ngữ của tôi và đổi được ngôn ngữ bằng tay,
So that tôi đọc giao diện bằng tiếng Việt hoặc tiếng Anh một cách tự nhiên.

**Acceptance Criteria:**

**Given** request tới một path không có tiền tố locale (ví dụ `/level/beginner`)
**When** `apps/web/src/proxy.ts` xử lý
**Then** redirect theo thứ tự: cookie `NEXT_LOCALE` → header `cf-ipcountry == VN` thì `/vi/...` → còn lại `/en/...` (AD-12, FR19)
**And** URL đã có tiền tố `/vi` hoặc `/en` không bao giờ bị redirect theo IP

**Given** người dùng đổi ngôn ngữ bằng nút trên header
**When** tải trang tiếp theo, kể cả vào lại path không tiền tố
**Then** cookie `NEXT_LOCALE` (giữ 1 năm) được tôn trọng và IP không ghi đè lựa chọn

**Given** một trang công khai bất kỳ
**When** render
**Then** có header gồm logo, Home, Search, 4 Level và nút đổi ngôn ngữ; có footer gồm about, link và disclaimer bản quyền (UX-DR24)
**And** chỉ UI chrome được dịch (file message `vi`/`en`), microcopy theo Voice & Tone (UX-DR18); dùng font Playfair Display + Be Vietnam Pro có subset tiếng Việt (UX-DR2)
**And** màn hình `< md` dùng menu hamburger (UX-DR17); focus ring brass 2px trên mọi phần tử bấm được (UX-DR16)
**And** bộ component nền dùng token có sẵn: `button-primary` (walnut) và `button-secondary` (outline) cho điều hướng/CTA (UX-DR3); `input` có focus viền brass 2px, dùng cho ô tìm kiếm ở header (UX-DR9)

**Given** SSR của web gọi API
**When** chạy trong mạng docker
**Then** gọi qua `API_INTERNAL_URL` kèm `X-Internal-Secret` và không bị throttle; browser dùng `NEXT_PUBLIC_API_URL` (AD-18)
**And** API tiếp tục dùng `getClientIp()` (Story 1.2) cho mọi logic cần IP; allowlist CORS được bổ sung origin web (không bật `credentials`)
**And** web có CSP cho phép PayPal, YouTube và CDN; mọi route công khai có thẻ `hreflang`

### Story 2.2: Trang duyet theo Level

As a người dùng,
I want xem lưới Sheet của một Level, lọc theo Genre và sắp xếp,
So that tôi nhanh chóng tìm được bài hợp trình độ.

**Acceptance Criteria:**

**Given** API public `GET /sheets?level=&genre=&sort=newest|most_viewed&page=`
**When** gọi
**Then** chỉ trả Sheet `PUBLISHED` đúng Level, dạng `{items, page, pageSize, total}`; mỗi item có thumbnail URL public, title, composer, view_count, `has_*`, page_count, is_hot và level (FR1)

**Given** `/[locale]/level/[level]`
**When** render phía server
**Then** có hero `display-lg` kèm tổng số bài, ô tìm kiếm lớn, dòng "Sheet database updated on …", tag cloud Genre và lưới Sheet (UX-DR21)
**And** fetch dùng `cache: 'force-cache'` với tag sinh từ hàm trong shared (`list:level:{level}`, …) và `revalidate: 600` (AD-10)

**Given** lưới Sheet
**When** hiển thị
**Then** có 3/2/1 cột theo lg/md/sm; phân trang theo số trang với URL riêng cho từng trang, không dùng infinite scroll; skeleton card khi đang tải (UX-DR7)
**And** mỗi `card-sheet` có badge Level ở góc trên-trái, badge HOT ở góc trên-phải (nếu có), nhãn định dạng `label-caps` chỉ cho định dạng thực sự có, alt text "tên bài – trang 1"; click cả thẻ để mở trang chi tiết, hover nâng nhẹ (UX-DR5, UX-DR6, UX-DR16)

**Given** tag cloud
**When** click một tag Genre
**Then** lưới được lọc ngay tại chỗ, URL cập nhật query, tag được chọn đổi sang nền brass (UX-DR8)

**Given** level không hợp lệ trong URL
**When** truy cập
**Then** trả 404

### Story 2.3: Tu lam moi cache khi admin thay doi noi dung

As a founder,
I want thay đổi của tôi ở admin hiện ngay trên site công khai,
So that tôi không phải deploy lại hay chờ cache hết hạn.

**Acceptance Criteria:**

**Given** `catalog.CacheInvalidator.tagsFor(before, after)`
**When** một Sheet được publish, sửa, đổi Level/Composer/Genre/Series, archive hoặc xoá
**Then** tập tag trả về gồm `sheet:{id}` cùng các list tag của **cả giá trị cũ lẫn mới**, `search` và `sitemap`; có unit test cho các trường hợp đổi Level và đổi Composer

**Given** commit DB thành công
**When** API gọi `POST {WEB}/api/revalidate` với secret
**Then** route handler gọi `revalidateTag(tag, { expire: 0 })` cho từng tag
**And** gọi thất bại thì retry 3 lần rồi log lỗi; không ảnh hưởng thao tác admin (vẫn còn lưới an toàn `revalidate: 600`)

**Given** request tới `/api/revalidate` sai secret
**When** xử lý
**Then** trả 401 và không revalidate gì

**Given** CRUD Composer, Genre hoặc Series (Story 1.4)
**When** commit
**Then** các tag list liên quan cũng được revalidate

### Story 2.4: Tim kiem toan van voi bo loc

As a người dùng,
I want tìm bài theo tên, tác giả, lời bài hát hoặc ID và lọc thêm,
So that tôi tìm đúng bài mình nghĩ tới dù chỉ nhớ một phần.

**Acceptance Criteria:**

**Given** migration SQL tay tạo cột `tsvector` generated trên title + tên composer + lyrics với `unaccent` và config `simple`, kèm GIN index
**When** gọi `GET /sheets?q=...`
**Then** từ khoá khớp tiêu đề, tên Composer hoặc lyrics đều trả kết quả; gõ không dấu vẫn khớp nội dung tiếng Việt có dấu (FR2)
**And** query toàn số thì khớp `public_id`
**And** SQL thô chỉ nằm trong repository của `catalog`

**Given** `/[locale]/search?q=&level=&genre=&composer=&format=`
**When** kết hợp từ khoá với các bộ lọc
**Then** các bộ lọc kết hợp kiểu AND; Genre dùng `tag-genre`; kết quả SSR và phân trang như lưới Level

**Given** không có kết quả
**When** hiển thị
**Then** hiện `headline-sm` "Không tìm thấy bài nào khớp." kèm gợi ý bỏ bớt bộ lọc hoặc xem theo Level (UX-DR15)

**Given** kết quả có Sheet ở trạng thái DRAFT hoặc ARCHIVED
**When** tìm kiếm
**Then** các Sheet đó không bao giờ xuất hiện

### Story 2.5: Trang Composer va Genre

As a người dùng,
I want xem mọi bài của một tác giả hoặc một thể loại,
So that tôi khám phá thêm bài tương tự bài mình thích.

**Acceptance Criteria:**

**Given** `/[locale]/composer/[slug]`
**When** render SSR
**Then** hiển thị tên, bio và avatar của Composer, cùng lưới Sheet `PUBLISHED` chỉ của Composer đó (FR3)
**And** fetch gắn tag `list:composer:{id}`

**Given** `/[locale]/genre/[slug]`
**When** render
**Then** hiển thị tên và icon của Genre, cùng lưới Sheet `PUBLISHED` thuộc Genre đó, tag `list:genre:{id}`

**Given** slug không tồn tại
**When** truy cập
**Then** trả 404

**Given** tên Composer hoặc tag Genre hiển thị ở thẻ Sheet hay trang chi tiết
**When** click
**Then** chuyển tới trang tương ứng

### Story 2.6: Trang chi tiet Sheet

As a người dùng,
I want xem đầy đủ thông tin và ảnh từng trang của một bản nhạc,
So that tôi quyết định bài này có hợp với mình không.

**Acceptance Criteria:**

**Given** `GET /sheets/:slug` với Sheet `PUBLISHED`
**When** gọi
**Then** trả title, composer, series, level, difficulty_score + note, page_count, view_count, updated_at, genres, is_hot, URL public của page image và note-JSON, youtube_url, lyrics_chords, danh sách Sheet cùng Series và danh sách liên quan (cùng composer/series/level) (FR4)
**And** Sheet DRAFT hoặc ARCHIVED trả 404 và không lộ trạng thái (UX-DR15)

**Given** `/[locale]/sheet/[slug]`
**When** render SSR
**Then** bố cục là breadcrumb → H1 "{Title} PDF, MIDI, MP4 & Tutorial" → meta (có badge Level, badge HOT, "15/100 — ghi chú độ khó") → vị trí player → ảnh từng trang (alt "tên bài – trang N") → Lyrics & Chords (nếu có); sidebar hiển thị bài liên quan (UX-DR22, UX-DR16)
**And** `≥ lg` hiển thị 2 cột; `md` chuyển sidebar xuống dưới (UX-DR17)
**And** trong epic này các nút Download chưa hiển thị

**Given** Sheet có `youtube_url`
**When** trang render
**Then** video được nhúng lazy-load kèm ghi chú nguồn bên thứ ba và không tự phát; Sheet không có `youtube_url` thì không có khối video (FR6)

**Given** toàn bộ phần xem ảnh, video và lyrics
**When** người dùng chưa đăng nhập hay thanh toán
**Then** mọi nội dung đều truy cập được (NFR5)

### Story 2.7: Dem luot xem chong trung

As a founder,
I want lượt xem phản ánh đúng số người xem thật,
So that số liệu "xem nhiều nhất" và dashboard đáng tin.

**Acceptance Criteria:**

**Given** migration tạo `SheetViewDedupe(sheet_id, visitor_hash, hour_bucket)` UNIQUE
**When** client trang chi tiết gửi beacon `POST /sheets/:id/view`
**Then** `catalog` chèn một dòng với `visitor_hash = sha256(clientIp + ua + VIEW_SALT)`; chỉ khi chèn thành công mới `view_count + 1` (AD-11, FR4)
**And** không lưu IP thô

**Given** cùng một người refresh trang nhiều lần trong một giờ
**When** beacon gửi lặp lại
**Then** `view_count` chỉ tăng 1

**Given** endpoint view
**When** bị gọi dồn dập
**Then** có throttle; Sheet không PUBLISHED thì không đếm

### Story 2.8: MIDI player voi phim dan ao

As a người học piano,
I want nghe thử bản nhạc ngay trên trang với phím đàn ảo hiện nốt đang phát,
So that tôi biết bài có vừa tay không và luyện đúng nốt.

**Acceptance Criteria:**

**Given** Sheet có note-JSON (`has_midi`)
**When** người dùng bấm "Play & Practice this piece"
**Then** Tone.js phát theo note-JSON, không tải file `.mid` gốc và không cần đăng nhập (AD-7, FR5)
**And** player không bao giờ tự phát khi vào trang (UX-DR13)

**Given** player đang phát
**When** thao tác
**Then** có Play/Pause, thanh tua kéo được và dropdown tốc độ 0.5x–2x hoạt động đúng
**And** các nốt rơi xuống phím đàn ảo; phím trắng `surface-bright`, phím đen `on-surface`, nốt đang phát highlight brass **kèm tên nốt dạng chữ**; không có animation bounce hay màu neon (UX-DR13, UX-DR16)

**Given** khu vực player
**When** hiển thị
**Then** có ghi chú "bản mô phỏng, chỉ để tham khảo"
**And** script player được tải lazy, không chặn render SSR của trang, và trang tải mượt trên kết nối di động (NFR6)

**Given** trình duyệt không có Web Audio API hoặc Sheet không có MIDI
**When** trang render
**Then** thay player bằng thông báo phù hợp (với trình duyệt không hỗ trợ), hoặc không hiển thị khối player (khi Sheet không có MIDI)

### Story 2.9: Nghe nhanh ngay tren the Sheet

As a người dùng đang duyệt nhiều bài,
I want bấm icon play trên thẻ để nghe 10–15 giây,
So that tôi chọn nhanh mà không phải mở từng trang.

**Acceptance Criteria:**

**Given** thẻ Sheet có `has_midi`
**When** bấm icon play trên thumbnail
**Then** phát 10–15 giây đầu của note-JSON rồi tự dừng; click icon không điều hướng sang trang chi tiết (UX-DR6)

**Given** một mini-preview đang phát
**When** bấm play ở thẻ khác
**Then** preview cũ dừng; tại mỗi thời điểm chỉ một preview phát

**Given** thiết bị cảm ứng
**When** xem lưới
**Then** icon play luôn hiển thị, không phụ thuộc hover

### Story 2.10: Xem truoc Sheet Draft tu admin

As a founder,
I want xem Sheet Draft đúng như người dùng sẽ thấy trước khi publish,
So that tôi phát hiện lỗi trình bày trước khi công khai.

**Acceptance Criteria:**

**Given** form Sheet ở admin
**When** bấm "Xem như người dùng"
**Then** admin xin `identity` một preview token (ký, hạn 10 phút, gắn `sheetId`) và mở tab mới tới `/[locale]/preview/sheet/[id]?token=` (AD-19, UX-DR23)

**Given** route preview với token hợp lệ
**When** render
**Then** dùng cùng layout trang chi tiết (kể cả MIDI player), render `no-store` với meta `noindex`, và không gửi beacon view

**Given** token thiếu, sai, hết hạn hoặc không khớp `sheetId`
**When** truy cập route preview
**Then** trả 404

### Story 2.11: SEO — metadata, JSON-LD va sitemap

As a founder,
I want các trang công khai được Google index tốt,
So that người dùng tìm thấy Piano Daily qua tìm kiếm tự nhiên.

**Acceptance Criteria:**

**Given** mọi trang công khai (Level, Search, Composer, Genre, chi tiết)
**When** view-source
**Then** nội dung chính có sẵn trong HTML SSR (không rỗng chờ JS), kèm meta title/description theo locale, Open Graph và `hreflang` (FR20, NFR4)

**Given** trang chi tiết Sheet
**When** view-source
**Then** có JSON-LD `MusicComposition` hợp lệ (tên, composer, …)

**Given** API `GET /sitemap-entries` (`@Public`)
**When** web sinh `sitemap.xml`
**Then** sitemap gồm mọi Sheet `PUBLISHED`, các trang Level, Composer, Genre cho cả 2 locale; fetch gắn tag `sitemap` nên publish Sheet mới cập nhật sitemap ngay (Story 2.3)
**And** có `robots.txt` trỏ tới sitemap; route preview bị `noindex`/disallow (route downloads của Epic 3 tự đặt `noindex`)

## Epic 3: Tải file và mua qua PayPal

Founder đặt giá lẻ, Bundle hoặc Miễn phí. Người dùng tải ngay Sheet FREE, hoặc mua qua modal PayPal, nhận trang tải, email và link tải lại. Webhook đồng bộ trạng thái một cách idempotent. Đây là epic rủi ro cao nhất: mọi luồng tiền đều được kiểm thử bằng PayPal sandbox.

### Story 3.1: Dat gia Sheet va danh dau Mien phi

As a founder,
I want đặt giá riêng cho PDF/MIDI/MP3, giá Bundle, hoặc đánh dấu Sheet Miễn phí,
So that tôi kiểm soát bài nào bán, bán giá bao nhiêu.

**Acceptance Criteria:**

**Given** migration thêm vào `Sheet` các cột `price_pdf_cents`, `price_midi_cents`, `price_mp3_cents`, `price_bundle_cents` (Int, cents USD) và `is_free`
**When** founder nhập giá dạng USD ở form Sheet
**Then** giá được lưu dạng số nguyên cents; không có float ở bất kỳ lớp nào (AD-3)

**Given** `catalog.PricingService.quote(sheetId)`
**When** tính báo giá
**Then** type mua được là type có file hiện hành và giá > 0; BUNDLE chỉ có khi có ít nhất 2 type mua được và gồm mọi type mua được; Sheet `is_free` trả quote "free" (AD-17)
**And** `GET /sheets/:id/quote` (`@Public`) trả đúng quote này; có unit test cho các trường hợp thiếu MP3, chỉ có 1 type, và free

**Given** Sheet không free
**When** publish (điều kiện của Story 1.8)
**Then** server còn kiểm tra thêm: phải có ít nhất 1 type mua được; không có thì báo rõ lý do

**Given** founder tick "Miễn phí"
**When** lưu
**Then** các ô giá bị vô hiệu trên form và giá riêng lẻ không còn ảnh hưởng luồng tải (FR14)
**And** cache của Sheet được revalidate (Story 2.3)

### Story 3.2: Tai ngay Sheet mien phi

As a người dùng,
I want bấm Download trên Sheet miễn phí và nhận file ngay,
So that tôi không phải qua bước thanh toán nào.

**Acceptance Criteria:**

**Given** migration tạo `DownloadLog(sheet_id, file_type, token_id nullable, ip_hash, ua, created_at)`
**When** gọi `GET /files/:sheetId/:fileType/download` với Sheet `is_free` và `PUBLISHED`
**Then** trong một transaction: ghi DownloadLog (không có token), rồi trả 302 tới signed GET URL của vùng private với TTL 5 phút (AD-6, AD-8, AD-20)
**And** endpoint có rate limit theo `getClientIp()`

**Given** Sheet không free, không PUBLISHED, hoặc file type không tồn tại
**When** gọi endpoint free
**Then** trả lỗi 4xx, không có signed URL

**Given** trang chi tiết Sheet free
**When** hiển thị
**Then** có nhóm nút `button-download` (brass) chỉ cho định dạng thực sự có; định dạng không có thì ẩn hẳn (UX-DR4, UX-DR14); ngoài ra có khối call-out riêng cho MIDI/MP3 và nút Download PDF ở sidebar (UX-DR22)
**And** bấm nút thì trình duyệt tải file ngay, không có modal (FR7)
**And** Sheet không free chưa hiển thị nút Download ở story này

### Story 3.3: Tao don hang PayPal phia server

As a người mua,
I want hệ thống tạo đơn đúng giá hiện tại khi tôi chọn mua,
So that tôi không bao giờ bị tính sai tiền.

**Acceptance Criteria:**

**Given** migration tạo `Order` với các cột: id, order_code (`PD-` + 6 ký tự base32), email, sheet_id (FK RESTRICT), items (json snapshot type + giá), amount_cents, currency, status, paypal_order_id, paypal_capture_id, payer_email, payer_name, paid_at, refunded_at, review_required, email_sent_at, created_at
**And** migration tạo `SiteSetting` (module `settings`) có seed `payments_enabled`, `token_default_days = 7` và `token_default_max_downloads = 5`
**When** kiểm tra `packages/shared`
**Then** có enum `OrderStatus`, bảng chuyển trạng thái (AD-4) và danh mục mã lỗi thanh toán; chỉ `commerce.OrderService` được đổi `Order.status`

**Given** port `PaymentProvider` (`createOrder / getOrder / capture / refund / verifyWebhook`) cùng adapter `paypal` (là nơi duy nhất import `@paypal/paypal-server-sdk`), chế độ chọn qua `PAYPAL_MODE` (AD-5)
**When** gọi `POST /payments/paypal/create-order { sheetId, fileTypes[] | bundle, email, expectedTotalCents }`
**Then** server lấy giá từ `PricingService.quote()`, tạo Order PENDING với `items` là các type đã resolve (không lưu chuỗi 'BUNDLE'), gọi PayPal tạo order USD và trả `paypalOrderId` (FR8, NFR1)

**Given** `expectedTotalCents` lệch với quote hiện tại
**When** tạo order
**Then** trả `PRICE_CHANGED` kèm quote mới và không tạo Order

**Given** `payments_enabled = false`, Sheet free, hoặc type không mua được
**When** tạo order
**Then** trả lần lượt `PAYMENTS_DISABLED` hoặc lỗi validate tương ứng; email sai định dạng bị từ chối

**Given** bảng Order đã có (nối hook của Story 1.8)
**When** founder "xoá" một Sheet đã từng có Order
**Then** Sheet chuyển ARCHIVED thay vì hard delete

### Story 3.4: Capture thanh toan va cap DownloadToken idempotent

As a người mua,
I want thanh toán xong là có ngay quyền tải file,
So that tôi không bị trừ tiền mà không nhận được hàng.

**Acceptance Criteria:**

**Given** migration tạo `DownloadToken(id, order_id, token random unique, expires_at, max_downloads, used_downloads, revoked_at)`
**When** gọi `POST /payments/paypal/capture-order { paypalOrderId }`
**Then** server gọi PayPal capture, rồi gọi `fulfil()`: xác minh `COMPLETED` và amount/currency khớp Order; trong **cùng transaction** chạy `UPDATE … WHERE status IN (allowed)`, set `paid_at` và tạo DownloadToken với hạn dùng và số lượt chụp từ settings (AD-4, FR8, FR9)
**And** response trả `{orderCode, token, files}`

**Given** `fulfil()` được gọi hai lần đồng thời (capture chạy đua với webhook)
**When** lần thứ hai cập nhật 0 dòng
**Then** đọc lại Order: đã PAID thì không làm gì, capture vẫn trả `{orderCode, token, files}`; chỉ có đúng 1 token (có test chạy đồng thời)

**Given** amount hoặc currency từ PayPal không khớp Order
**When** fulfil
**Then** không chuyển PAID, đặt `review_required = true` và log error; không bao giờ bỏ qua trong im lặng

**Given** Order đang CANCELLED hoặc FAILED nhưng PayPal xác nhận capture khớp
**When** fulfil
**Then** chuyển PAID và log `LATE_CAPTURE`

**Given** PayPal từ chối thanh toán
**When** capture
**Then** Order chuyển FAILED và API trả `PAYMENT_DECLINED` kèm lý do đủ để UI hiển thị

**Given** bảng DownloadToken đã có (nối hook GC của Story 1.8)
**When** cron GC chạy
**Then** không xoá object của file còn được một token chưa hết hạn và chưa bị vô hiệu tham chiếu

### Story 3.5: Tai file da mua qua token va trang tai

As a người mua,
I want một trang liệt kê file đã mua và tải được trong thời hạn,
So that tôi tải lại file khi cần mà không phải trả tiền lần hai.

**Acceptance Criteria:**

**Given** token hợp lệ (Order PAID, chưa bị vô hiệu, chưa hết hạn, file type thuộc Order)
**When** gọi `GET /downloads/:token/:fileType`
**Then** chạy một câu `UPDATE … SET used_downloads = used_downloads + 1 WHERE id = ? AND used_downloads < max_downloads AND expires_at > now()`, ghi DownloadLog (có token_id) trong cùng transaction, rồi trả 302 tới signed URL 5 phút (AD-8)
**And** file vẫn tải được bất kể `Sheet.status` (kể cả ARCHIVED)

**Given** token hết hạn, hết lượt hoặc đã bị vô hiệu
**When** tải
**Then** trả lần lượt `TOKEN_EXPIRED`, `TOKEN_EXHAUSTED` hoặc lỗi tương ứng, không có signed URL; có test chạy đồng thời chứng minh không vượt `max_downloads`

**Given** `GET /downloads/:token`
**When** gọi
**Then** trả tên bài, danh sách file đã mua, số lượt còn lại, ngày hết hạn và trạng thái token

**Given** trang `/[locale]/downloads/[token]` (`noindex`, `no-store`)
**When** token còn hiệu lực
**Then** có thông điệp "Thanh toán thành công. File của bạn đã sẵn sàng.", nút `button-download` cho từng file đã mua và dòng "Link tải còn hiệu lực X ngày, Y lượt." (UX-DR18)
**And** khi token hết hiệu lực thì hiện "Link tải đã hết hiệu lực" kèm cách liên hệ, không tự đẩy người dùng sang mua lại (UX-DR15)

### Story 3.6: Modal thanh toan tren trang chi tiet

As a người mua,
I want bấm Download, chọn mua lẻ hoặc Bundle, nhập email và trả tiền bằng PayPal ngay trong trang,
So that tôi mua nhanh mà không phải tạo tài khoản.

**Acceptance Criteria:**

**Given** Sheet không free và `payments_enabled = true`
**When** bấm một nút Download (PDF/.mp3/.mid)
**Then** modal mở bằng hiệu ứng fade, fetch quote `no-store` và hiển thị tên bài, file đã chọn, giá, lựa chọn Bundle (nếu có) kèm giá và ô email có label (FR7, UX-DR12)
**And** mặc định chỉ chọn đúng file của nút vừa bấm; Bundle chỉ được chọn khi người dùng chủ động chọn

**Given** email hợp lệ
**When** bấm nút PayPal (SDK `@paypal/react-paypal-js`, giữ style gốc)
**Then** `createOrder` gọi API create-order kèm `expectedTotalCents`; `onApprove` gọi capture; khi thành công, client chuyển tới `/[locale]/downloads/[token]` (UJ-1)
**And** trong lúc xử lý, nút PayPal bị disable kèm spinner, không thể tạo trùng Order

**Given** API trả `PAYMENT_DECLINED`, `PRICE_CHANGED`, lỗi mạng, hoặc popup bị đóng
**When** hiển thị lỗi
**Then** dùng `form-error` với thông điệp cụ thể theo lý do cùng việc cần làm tiếp; giữ nguyên lựa chọn file/Bundle và email; thử lại được ngay (UX-DR11, UX-DR12)
**And** với `PRICE_CHANGED`, modal cập nhật giá mới trước khi cho thử lại

**Given** popup PayPal đang mở
**When** click nền overlay
**Then** modal không đóng; đóng modal bằng nút X không huỷ Order PENDING

**Given** màn hình `< md`
**When** mở modal
**Then** modal chiếm toàn màn hình (UX-DR17)

**Given** `payments_enabled = false`
**When** xem Sheet không free
**Then** nút Download ở trạng thái không khả dụng kèm chú thích; không mở modal (AD-8)

### Story 3.7: Email link tai va mua lai cung email

As a người mua,
I want nhận email chứa link tải lại, và không bị tính tiền lần hai khi mua lại bài đã mua,
So that tôi yên tâm tải file trên máy khác sau này.

**Acceptance Criteria:**

**Given** `notify.EmailPort` với adapter Resend
**When** Order chuyển PAID và transaction đã commit
**Then** gửi email (theo locale của lần mua) gồm order code, tên bài và link `/[locale]/downloads/[token]`; gửi thành công thì set `email_sent_at` (AD-14, FR9)

**Given** Resend trả lỗi
**When** gửi email
**Then** chỉ log lỗi (không log email đầy đủ hay token), `email_sent_at` giữ null, và thanh toán không bị ảnh hưởng (NFR9, NFR10)

**Given** email X đã có Order PAID cho Sheet S với token còn hiệu lực và bao phủ các type được yêu cầu
**When** create-order với cùng email X và Sheet S
**Then** không tạo Order mới; hệ thống gửi lại email link tải (có rate limit theo email) và trả `ALREADY_PURCHASED`; response không chứa token (AD-8)
**And** modal hiển thị "Bạn đã mua bài này — chúng tôi đã gửi lại link tải vào email."

### Story 3.8: Webhook PayPal

As a founder,
I want hệ thống tự đồng bộ trạng thái với PayPal qua webhook,
So that không mất đơn khi người mua đóng trình duyệt giữa chừng, và hoàn tiền từ PayPal được phản ánh đúng.

**Acceptance Criteria:**

**Given** migration tạo `PaymentEvent(id, provider_event_id UNIQUE, type, payload, processed_at)`, và API bật `rawBody: true`
**When** nhận `POST /webhooks/paypal` (`@Public`)
**Then** trước mọi xử lý, adapter gọi `POST /v1/notifications/verify-webhook-signature` với raw body và `PAYPAL_WEBHOOK_ID`; chữ ký sai thì trả 400 và không xử lý gì (AD-5, FR10)

**Given** chữ ký hợp lệ
**When** xử lý event
**Then** insert `PaymentEvent` trước; nếu `provider_event_id` trùng thì dừng và trả 200 (idempotent)

**Given** event `PAYMENT.CAPTURE.COMPLETED`
**When** xử lý
**Then** gọi cùng `fulfil()` như capture (Story 3.4), rồi gửi email nếu Order vừa chuyển PAID (Story 3.7)

**Given** event `PAYMENT.CAPTURE.REFUNDED`
**When** xử lý
**Then** `refund()` có điều kiện: set REFUNDED và `refunded_at`, vô hiệu hoá DownloadToken; tải lại bằng token đó thì bị từ chối

**Given** event `PAYMENT.CAPTURE.DENIED`
**When** xử lý
**Then** Order PENDING chuyển FAILED

**Given** cùng một event được gửi hai lần
**When** xử lý
**Then** không tạo hai token và không cộng trùng doanh thu (có test)

### Story 3.9: Tu huy don PENDING qua han

As a founder,
I want các đơn bỏ dở tự được dọn,
So that dữ liệu đơn hàng sạch mà không huỷ nhầm đơn đã thanh toán.

**Acceptance Criteria:**

**Given** cron `@nestjs/schedule` chạy định kỳ
**When** tìm thấy Order PENDING tạo quá 24h
**Then** gọi `PaymentProvider.getOrder()`; chỉ khi PayPal cho thấy order chưa APPROVED hoặc COMPLETED mới chuyển CANCELLED (AD-4)

**Given** PayPal cho thấy order đã COMPLETED
**When** cron xử lý
**Then** gọi `fulfil()` thay vì huỷ

**Given** PayPal trả lỗi hoặc timeout
**When** cron xử lý
**Then** bỏ qua Order đó ở lần chạy này và log cảnh báo

### Story 3.10: Dat gia hang loat

As a founder,
I want đặt giá cho nhiều Sheet cùng lúc theo Level, Composer hoặc Genre,
So that tôi không phải sửa từng bài.

**Acceptance Criteria:**

**Given** công cụ đặt giá hàng loạt ở admin
**When** founder chọn tiêu chí (Level, Composer và/hoặc Genre) và nhập giá PDF/MIDI/MP3/Bundle hoặc chọn Miễn phí
**Then** trước khi áp dụng, founder thấy danh sách và số lượng Sheet bị ảnh hưởng (FR14)

**Given** founder xác nhận áp dụng
**When** `catalog` cập nhật
**Then** mọi thay đổi chạy trong một transaction qua `catalog` (AD-1, AD-3); để trống một ô giá thì giữ nguyên giá cũ của ô đó
**And** tag cache của các Sheet bị ảnh hưởng được revalidate

**Given** Order PENDING đã tạo trước khi đổi giá
**When** người mua capture
**Then** vẫn dùng snapshot giá trong `Order.items`; còn create-order mới sau khi đổi giá sẽ nhận `PRICE_CHANGED` nếu client gửi giá cũ

## Epic 4: Founder vận hành kinh doanh

Founder quản lý đơn hàng (xem, gửi lại email, gia hạn token, hoàn tiền), cấu hình site, quản lý quảng cáo và theo dõi doanh thu cùng lượt dùng qua dashboard, tất cả mà không cần đụng code hay truy vấn DB.

### Story 4.1: Danh sach va chi tiet don hang

As a founder,
I want xem và lọc đơn hàng, xem chi tiết từng đơn kèm lịch sử tải,
So that tôi nắm được tình hình bán hàng và trả lời khiếu nại của người mua.

**Acceptance Criteria:**

**Given** trang Đơn hàng ở admin
**When** founder lọc theo trạng thái, khoảng ngày và email (tìm một phần)
**Then** bảng hiển thị order code, email, Sheet, file đã mua, số tiền (USD), trạng thái và ngày; có phân trang; click hàng để mở chi tiết (FR15, UX-DR20)
**And** ngày hiển thị theo `REPORT_TZ` (Asia/Ho_Chi_Minh)

**Given** trang chi tiết một Order
**When** mở
**Then** thấy items snapshot, thông tin PayPal (order id, capture id, payer), các mốc `paid_at`/`refunded_at`, trạng thái gửi email (`email_sent_at`), trạng thái token (hạn dùng, lượt đã dùng/tối đa, đã vô hiệu chưa) và lịch sử tải từ DownloadLog (thời điểm, file, UA)

**Given** Order có `review_required = true`
**When** xem danh sách hoặc chi tiết
**Then** Order được đánh dấu nổi bật, và có bộ lọc riêng để tìm các đơn cần xem xét

### Story 4.2: Gui lai email va gia han token

As a founder,
I want gửi lại email link tải và gia hạn token cho người mua,
So that tôi hỗ trợ người mua mất email hoặc hết lượt tải mà không bắt họ trả tiền lại.

**Acceptance Criteria:**

**Given** một Order PAID
**When** founder bấm "Gửi lại email"
**Then** email link tải được gửi qua `notify.EmailPort`; thành công thì cập nhật `email_sent_at`; lỗi thì hiện `form-error` với lý do cụ thể (AD-14)

**Given** một Order PAID có token hết hạn hoặc hết lượt
**When** founder gia hạn (thêm số ngày và/hoặc số lượt)
**Then** thay đổi chỉ đi qua `commerce.TokenService` (AD-8); trang tải của người mua phản ánh ngay hạn dùng và số lượt mới
**And** nút gia hạn dùng màu brass (UX-DR20)

**Given** Order không ở trạng thái PAID (ví dụ REFUNDED)
**When** thử gửi lại email hoặc gia hạn
**Then** thao tác bị từ chối với thông báo rõ ràng

### Story 4.3: Hoan tien tu admin

As a founder,
I want hoàn tiền một đơn ngay từ trang admin,
So that tôi xử lý khiếu nại mà không phải đăng nhập PayPal riêng.

**Acceptance Criteria:**

**Given** một Order PAID
**When** founder bấm "Hoàn tiền" (nút brass) và xác nhận trong trang
**Then** `commerce` gọi `PaymentProvider.refund()`; khi PayPal xác nhận, `refund()` có điều kiện set REFUNDED và `refunded_at`, rồi vô hiệu hoá DownloadToken (AD-4, FR15)
**And** người mua dùng lại token thì bị từ chối

**Given** webhook `PAYMENT.CAPTURE.REFUNDED` đến sau khi admin đã hoàn tiền (hoặc đến trước)
**When** cả hai luồng cùng chạy
**Then** Order chỉ chuyển REFUNDED một lần, không lỗi, và doanh thu không bị trừ hai lần (có test)

**Given** PayPal từ chối refund
**When** hoàn tiền
**Then** Order giữ nguyên trạng thái PAID, và admin thấy `form-error` với lý do PayPal trả về

### Story 4.4: Cai dat site

As a founder,
I want chỉnh tên site, logo, SEO mặc định, link YouTube, bật/tắt thanh toán và mặc định của token,
So that tôi vận hành site mà không cần sửa code hay env.

**Acceptance Criteria:**

**Given** trang Cài đặt ở admin
**When** founder sửa tên site, upload logo (qua `media`, vùng public), mô tả SEO mặc định và link kênh YouTube
**Then** giá trị lưu vào `SiteSetting` và tag `settings` được revalidate; header, footer và meta mặc định của web cập nhật ngay (FR18, AD-10)

**Given** founder tắt "Bật thanh toán"
**When** lưu
**Then** `create-order` trả `PAYMENTS_DISABLED`, nút tải của Sheet trả phí chuyển trạng thái không khả dụng, nhưng token đã phát vẫn tải được (AD-8)

**Given** founder đổi số ngày hiệu lực và số lượt tải mặc định
**When** lưu
**Then** chỉ token phát ra sau đó dùng giá trị mới; token cũ giữ nguyên giá trị đã chụp lúc phát
**And** giá trị không hợp lệ (≤ 0, không phải số) bị từ chối bằng `form-error`

### Story 4.5: Quan ly vi tri quang cao

As a founder,
I want tạo, sửa và bật/tắt quảng cáo theo từng vị trí,
So that tôi có thêm doanh thu mà vẫn kiểm soát trải nghiệm.

**Acceptance Criteria:**

**Given** migration tạo `AdSlot(id, position HEADER|SIDEBAR_LEFT|SIDEBAR_RIGHT|IN_LIST|STICKY_BOTTOM|IN_CONTENT, html_code | image + link, is_active)` (module `ads`)
**When** SUPER_ADMIN tạo, sửa, xoá hoặc bật/tắt AdSlot ở trang Quảng cáo
**Then** thay đổi được lưu và tag `ads` được revalidate (FR16)
**And** `GET /ads` (`@Public`) chỉ trả các slot `is_active`

**Given** form AdSlot
**When** founder nhập `html_code`
**Then** chỉ SUPER_ADMIN được lưu; form có preview render trong iframe sandbox (AD-21)

### Story 4.6: Hien thi quang cao tren site cong khai

As a người dùng,
I want quảng cáo tách biệt rõ ràng khỏi nội dung,
So that tôi không nhầm quảng cáo với bài nhạc và trải nghiệm vẫn sạch.

**Acceptance Criteria:**

**Given** AdSlot đang active
**When** trang công khai render
**Then** `html_code` chỉ render trong `<iframe sandbox="allow-scripts allow-popups" srcdoc>` không có `allow-same-origin`, và không bao giờ được chèn trực tiếp vào DOM (AD-21)
**And** khung `ad-slot` có nền trung tính, viền dashed, không dùng màu thương hiệu (UX-DR10)

**Given** vị trí `IN_LIST`
**When** render lưới Sheet
**Then** quảng cáo đặt ở vị trí cố định ngoài lưới (ví dụ dưới lưới, trên phân trang), không chèn giữa các thẻ Sheet (UX-DR10)

**Given** founder tắt một AdSlot
**When** tải lại trang công khai
**Then** vị trí đó biến mất và không chiếm không gian (layout co lại tự nhiên), không cần deploy (FR16)

**Given** modal thanh toán đang mở
**When** có quảng cáo trên trang
**Then** script quảng cáo không truy cập được document chứa PayPal SDK

### Story 4.7: Dashboard doanh thu va luot dung

As a founder,
I want một dashboard tổng quan về doanh thu, đơn hàng, lượt xem và lượt tải,
So that tôi biết bài nào hiệu quả và kinh doanh đang đi đến đâu.

**Acceptance Criteria:**

**Given** module `analytics` (chỉ đọc, không sở hữu bảng) (AD-1)
**When** founder mở Dashboard và chọn khoảng thời gian
**Then** thấy:
- số Sheet theo Level;
- tổng lượt xem theo Level;
- lượt tải theo Level, tính từ DownloadLog gồm cả free và paid;
- doanh thu theo ngày/tháng;
- số đơn hàng;
- top Sheet bán chạy và xem nhiều;
- các Sheet cập nhật gần đây (FR17).

**Given** tập Order có cả PAID lẫn REFUNDED trong khoảng thời gian
**When** tính doanh thu
**Then** doanh thu = tổng `amount_cents` theo `paid_at`, trừ các Order có `refunded_at`; ngày được tính theo `REPORT_TZ=Asia/Ho_Chi_Minh` (AD-20)
**And** có test dùng dữ liệu mẫu chứng minh số liệu khớp với tổng Order PAID trừ REFUNDED

**Given** tiền hiển thị trên dashboard
**When** format
**Then** hiển thị USD từ cents, không có sai số làm tròn

## Epic 5: Ra mắt production

Piano Daily chạy thật trên domain qua Cloudflare, có backup hằng đêm, giám sát tối thiểu và sẵn sàng bật `PAYPAL_MODE=live`. Stories 5.1–5.3 có thể làm ngay sau Epic 2 để go-live phần xem/nghe miễn phí trước; Story 5.4 cần Epic 3 và Epic 4.

### Story 5.1: Trien khai production tren VPS sau Cloudflare

As a founder,
I want site chạy trên domain thật với TLS, CDN và cấu hình an toàn,
So that người dùng thật truy cập được Piano Daily.

**Acceptance Criteria:**

**Given** `docker-compose.prod.yml` gồm web, admin, api, postgres và caddy
**When** deploy lên VPS
**Then** Caddy route `pianodaily.<tld>` → web :3000, `admin.` → admin :3001 và `api.` → api :4000; postgres không expose ra ngoài
**And** api chạy `prisma migrate deploy` trước khi listen, và chỉ chạy một instance (AD-15)

**Given** Cloudflare proxy đứng trước origin
**When** cấu hình
**Then** Caddy đặt `trusted_proxies` = dải IP Cloudflare, và firewall origin chỉ nhận kết nối từ Cloudflare (AD-18)
**And** Cloudflare IP Geolocation được bật; request từ IP Việt Nam vào `/` được redirect về `/vi` (kiểm chứng bằng header `cf-ipcountry`)

**Given** R2 production
**When** cấu hình storage
**Then** có vùng public phục vụ qua custom domain `cdn.` với cache immutable, và vùng private không có quyền đọc public; signed URL tải được file (AD-6)

**Given** env production
**When** app khởi động
**Then** mọi secret (JWT, `X-Internal-Secret`, revalidate secret, `VIEW_SALT`, PayPal, Resend, R2) được đặt, validate bằng zod và không có trong repo
**And** CORS allowlist chỉ gồm domain thật, cookie refresh hoạt động với `SameSite=Strict` giữa `admin.` và `api.`

**Given** site đã chạy
**When** kiểm tra khói (smoke check)
**Then** trang Level, Search và chi tiết render SSR; admin đăng nhập được; upload PDF tạo được ảnh; `sitemap.xml` truy cập được

### Story 5.2: Backup hang dem va kiem tra khoi phuc

As a founder,
I want database được backup tự động và biết chắc khôi phục được,
So that tôi không mất dữ liệu đơn hàng và nội dung khi có sự cố.

**Acceptance Criteria:**

**Given** service `backup` riêng trong compose prod
**When** tới lịch hằng đêm
**Then** chạy `pg_dump` và đẩy file lên vùng private của R2, tên file có timestamp
**And** backup cũ được xoay vòng theo chính sách giữ lại (ví dụ 14 bản)

**Given** một bản backup
**When** làm theo hướng dẫn khôi phục trong README
**Then** khôi phục được vào một DB trống ở local và app chạy được với dữ liệu đó (đã thử ít nhất một lần)

**Given** backup thất bại
**When** job kết thúc
**Then** job thoát với mã lỗi và ghi log mức error, đủ để hệ thống cảnh báo bắt được

### Story 5.3: CI va giam sat toi thieu

As a founder,
I want CI chặn code hỏng và có cảnh báo khi hệ thống gặp sự cố,
So that tôi phát hiện vấn đề trước người mua.

**Acceptance Criteria:**

**Given** một push hoặc PR
**When** CI chạy
**Then** chạy lint, typecheck, build và test cho mọi workspace (kể cả test allowlist `@Public()` và test so khớp enum shared/Prisma); fail thì chặn merge

**Given** site production
**When** uptime check chạy định kỳ vào web và `api/health`
**Then** gửi cảnh báo (email hoặc kênh founder chọn) khi down

**Given** log có sự kiện `review_required`, `LATE_CAPTURE`, backup thất bại hoặc lỗi webhook
**When** sự kiện xảy ra
**Then** founder nhận cảnh báo (Architecture — Deferred)

### Story 5.4: Checklist bat thanh toan that

As a founder,
I want một quy trình rõ ràng để chuyển PayPal từ sandbox sang live,
So that đơn thật đầu tiên chạy đúng và tôi không bán nội dung có rủi ro.

**Acceptance Criteria:**

**Given** Epic 3 và Epic 4 đã hoàn tất trên production ở chế độ sandbox
**When** chuẩn bị go-live
**Then** có checklist trong README gồm:
- rà soát bản quyền danh sách Sheet trả phí (PRD Q1);
- tạo app PayPal live cùng `PAYPAL_CLIENT_ID/SECRET`;
- đăng ký webhook live cho 3 event và cập nhật `PAYPAL_WEBHOOK_ID`;
- đặt `PAYPAL_MODE=live`;
- xác minh domain gửi email của Resend.

**Given** checklist đã hoàn tất
**When** founder mua thật một Sheet giá nhỏ, rồi hoàn tiền từ admin
**Then** Order chuyển PAID → REFUNDED; email link tải đến nơi; webhook được ghi `PaymentEvent`; dashboard phản ánh đúng số liệu (SM-1)

**Given** có sự cố ngay sau go-live
**When** founder tắt "Bật thanh toán" trong Cài đặt
**Then** thanh toán mới dừng ngay, còn token đã phát vẫn tải được (phương án rollback)
