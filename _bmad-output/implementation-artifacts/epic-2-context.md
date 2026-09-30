# Epic 2 Context: Người dùng khám phá, xem và nghe thử Sheet

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Guest duyệt Sheet theo Level, tìm kiếm, vào trang Composer/Genre và trang chi tiết Sheet; xem ảnh từng trang, nghe MIDI player và xem YouTube hoàn toàn miễn phí, không cần đăng nhập hay thanh toán. Site song ngữ (vi/en) theo IP, render SSR đầy đủ để SEO tốt. Admin xem trước được Sheet Draft. Nút Download chưa hiển thị cho tới Epic 3.

## Stories

- Story 2.1: Khung site công khai song ngữ
- Story 2.2: Trang duyệt theo Level
- Story 2.3: Tự làm mới cache khi admin thay đổi nội dung
- Story 2.4: Tìm kiếm toàn văn với bộ lọc
- Story 2.5: Trang Composer và Genre
- Story 2.6: Trang chi tiết Sheet
- Story 2.7: Đếm lượt xem chống trùng
- Story 2.8: MIDI player với phím đàn ảo
- Story 2.9: Nghe nhanh ngay trên thẻ Sheet
- Story 2.10: Xem trước Sheet Draft từ admin
- Story 2.11: SEO: metadata, JSON-LD và sitemap

## Requirements & Constraints

- Chỉ Sheet `PUBLISHED` xuất hiện ở trang công khai, tìm kiếm và sitemap; Draft/Archived trả 404 và không lộ trạng thái.
- Lưới Sheet: mỗi thẻ có thumbnail, tiêu đề, Composer, lượt xem, định dạng có sẵn (theo `has_*`), số trang, badge Level/HOT. Phân trang theo số trang (URL riêng từng trang), sắp xếp mới nhất hoặc xem nhiều nhất.
- Tìm kiếm theo tên bài, Composer, lyrics hoặc ID (query toàn số khớp `public_id`); gõ không dấu vẫn khớp tiếng Việt có dấu; bộ lọc Level/Genre/Composer/định dạng kết hợp AND.
- Chi tiết Sheet: điểm và ghi chú độ khó, Series, Sheet liên quan, Lyrics & Chords (nếu có); YouTube nhúng lazy-load, không tự phát, kèm ghi chú bên thứ ba, ẩn nếu không có `youtube_url`.
- `view_count` chỉ tăng một lần cho mỗi người trong một giờ; không lưu IP thô.
- Locale: chọn theo IP (VN → vi, còn lại → en), đổi tay được, lựa chọn thủ công không bị IP ghi đè. Chỉ dịch UI chrome; nội dung Sheet chỉ có một bản.
- Nghe/xem/video luôn miễn phí (không sau xác thực hay thanh toán). Player không tự phát, có ghi chú "bản mô phỏng", tải lazy, mượt trên di động. Tiền tệ hiển thị USD.
- Mọi trang công khai SSR, có meta theo locale, Open Graph, hreflang; chi tiết Sheet có JSON-LD `MusicComposition`; `sitemap.xml` và `robots.txt`.

## Technical Decisions

- Locale nằm trên URL `/vi|/en`. `apps/web/src/proxy.ts` chỉ redirect path chưa có tiền tố theo thứ tự cookie `NEXT_LOCALE` (1 năm) → `cf-ipcountry` → `en`; URL đã có tiền tố không bị redirect.
- SSR web gọi API qua `API_INTERNAL_URL` kèm `X-Internal-Secret` (không bị throttle); browser dùng `NEXT_PUBLIC_API_URL`. API dùng `getClientIp()` (đọc `CF-Connecting-IP`). CORS allowlist thêm origin web, không bật `credentials`. Web có CSP cho PayPal, YouTube và CDN.
- Cache web: fetch `force-cache` với tag + `revalidate: 600`; tag sinh từ hàm trong `packages/shared` (ví dụ `list:level:{level}`, `list:composer:{id}`, `list:genre:{id}`, `sheet:{id}`, `search`, `sitemap`). Giá fetch `no-store`; không bật `cacheComponents`.
- `catalog.CacheInvalidator.tagsFor(before, after)` trả tag của cả giá trị cũ lẫn mới. Sau commit DB, API gọi `POST /api/revalidate` (có secret, retry 3 lần, lỗi chỉ log), handler gọi `revalidateTag(tag, {expire:0})`; sai secret trả 401. CRUD Composer/Genre/Series (Story 1.4) cũng phải revalidate.
- Search: Postgres FTS, cột `tsvector` generated (title + composer + lyrics), `unaccent` + config `simple`, GIN index, migration SQL tay. SQL thô chỉ nằm trong repository của `catalog`.
- View beacon `POST /sheets/:id/view`, bảng `SheetViewDedupe(sheet_id, visitor_hash, hour_bucket)` UNIQUE; `visitor_hash = sha256(ip + ua + VIEW_SALT)`; chỉ tăng khi insert thành công; có throttle; Sheet không PUBLISHED không đếm.
- MIDI player chỉ đọc note-JSON public sinh server-side (Tone.js), không bao giờ dùng file `.mid` gốc.
- Preview Draft: token ký 10 phút gắn `sheetId` do `identity` cấp; route `/[locale]/preview/sheet/[id]?token=` dùng chung layout chi tiết, render `no-store`, `noindex`, không gửi beacon; token sai/hết hạn/lệch id trả 404.
- Danh sách response `{items,page,pageSize,total}`; lỗi `{error:{code,message}}`. `@Public()` cho endpoint công khai (ví dụ `GET /sitemap-entries`). Font Playfair Display + Be Vietnam Pro có subset tiếng Việt; token "Ivory & Walnut" dùng chung từ `packages/tokens`.

## UX & Interaction Patterns

- Header: logo, Home, Search, 4 Level, nút đổi ngôn ngữ; `< md` dùng hamburger. Footer: about, link, disclaimer bản quyền. Focus ring brass 2px trên mọi phần tử bấm được; alt ảnh "tên bài – trang N".
- Lưới 3/2/1 cột (lg/md/sm), skeleton khi tải, không infinite scroll. Thẻ: click cả thẻ mở chi tiết, hover nâng nhẹ bằng shadow ấm, badge Level góc trên-trái, HOT góc trên-phải, nhãn định dạng `label-caps` chỉ cho định dạng có thật.
- Trang Level: hero `display-lg` kèm tổng số bài, ô tìm kiếm lớn, dòng "Sheet database updated on …", tag cloud Genre lọc tại chỗ (URL cập nhật query, tag chọn nền brass).
- Trang chi tiết: breadcrumb → H1 "{Title} PDF, MIDI, MP4 & Tutorial" → meta → player → ảnh trang → Lyrics & Chords; sidebar bài liên quan. `≥ lg` 2 cột, `md` sidebar xuống dưới.
- MIDI player: Play/Pause, thanh tua, tốc độ 0.5x–2x; phím trắng `surface-bright`, phím đen `on-surface`, nốt đang phát highlight brass kèm tên nốt bằng chữ; không bounce/neon. Không có Web Audio thì hiện thông báo; không có MIDI thì ẩn khối.
- Mini-preview trên thẻ: 10–15 giây đầu rồi tự dừng, chỉ một preview phát tại một thời điểm, click icon không điều hướng; icon luôn hiện trên thiết bị cảm ứng.
- Search rỗng: `headline-sm` "Không tìm thấy bài nào khớp." kèm gợi ý bỏ bớt bộ lọc hoặc xem theo Level. Microcopy trang trọng, không emoji.
- Nút Download ẩn hoàn toàn trong epic này.

## Cross-Story Dependencies

- Phụ thuộc Epic 1: dữ liệu Sheet/Composer/Genre/Series, `has_*`, page image và note-JSON public (Story 1.6, 1.7), vòng đời publish (1.8), seed (1.9), `getClientIp()` và guard `@Public()` (1.2), CRUD danh mục (1.4), form admin Sheet (1.5).
- 2.1 là nền cho mọi trang công khai (layout, locale, gọi API nội bộ); 2.2, 2.4, 2.5 dùng chung lưới/thẻ Sheet và cache tag.
- 2.3 (revalidate) phải hỗ trợ tag của 2.2/2.4/2.5/2.6/2.11; sitemap ở 2.11 phụ thuộc tag `sitemap` từ 2.3.
- 2.6 cần 2.8 (player) và 2.7 (beacon); 2.10 dùng lại layout 2.6 và cần preview token từ `identity`; 2.9 dùng lại logic note-JSON của 2.8.
- Epic 3 sẽ bật nút Download trên các trang này.
