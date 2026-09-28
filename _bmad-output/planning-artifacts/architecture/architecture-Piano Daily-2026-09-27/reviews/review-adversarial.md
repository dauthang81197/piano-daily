---
review: adversarial
target: ../ARCHITECTURE-SPINE.md
context: ../../../prds/prd-Piano-Daily-2026-09-27/prd.md
date: 2026-09-27
lens: "Hai unit ở tầng epic/feature, mỗi bên tuân thủ đúng từng chữ của mọi AD, nhưng vẫn build ra thứ không tương thích với nhau"
---

# Adversarial Review — Architecture Spine Piano Daily

## Kết luận

Spine rất chắc ở lõi thanh toán (AD-3/4/5/8): khoá đúng chỗ tiền dễ bị làm sai nhất. Nhưng nó gần như im lặng về **vòng đời** của các entity (xoá, thay thế, huỷ publish, đổi giá sau khi đã bán), về **ai tính "offer" (những gì mua được và giá bao nhiêu)**, và về **mặt phẳng HTTP giữa các app** (SSR so với trình duyệt, IP thật sau Cloudflare/Caddy, CORS/cookie, preview draft). Tôi dựng được 16 cặp unit, mỗi bên đều tuân thủ AD mà vẫn xung đột. Có 5 cặp mức Critical/High, và tất cả nên được đóng bằng AD mới hoặc AD được siết lại **trước** khi cắt epic.

Thang mức độ: **Critical**: mất tiền, lộ file hoặc hỏng dữ liệu không đảo ngược được · **High**: hai team chắc chắn build lệch nhau, phải làm lại · **Medium**: lệch nhau nhưng sửa được, hoặc sai số liệu · **Low**: mơ hồ nhỏ.

---

## H-1 — Order bị cron CANCELLED nhưng tiền vẫn bị capture (Critical)

**Cặp unit:** *Payment capture/webhook* với *Cron dọn Order PENDING* (cả hai nằm trong `commerce`, nhưng thường là hai story khác nhau).

- Cron tuân thủ AD-4: `PENDING` quá 24h → `CANCELLED`.
- Webhook `PAYMENT.CAPTURE.COMPLETED` đến muộn: PayPal có thể giữ capture ở trạng thái `PENDING` (eCheck, review) rồi mới COMPLETED sau nhiều ngày, hoặc người mua approve ở phút thứ 23:59 và capture chạy sau khi cron đã quét. `fulfil()` chạy `UPDATE … WHERE status='PENDING'`, cập nhật được 0 dòng, và theo AD-4 thì "đã xử lý rồi → không làm gì".
- **Kết quả:** tiền đã bị trừ, người mua không nhận được token, và không có cảnh báo nào. Hai unit đều đúng từng chữ của AD.

Cùng họ lỗi: `fulfil()` coi "0 dòng" là "đã PAID" mà không kiểm tra trạng thái thực. Một order đã `FAILED` (bị DENIED) rồi sau đó lại COMPLETED cũng bị nuốt im lặng.

**Rule đề xuất (siết AD-4):**
> `fulfil()` khi cập nhật được 0 dòng phải đọc lại `Order.status`: nếu là `PAID` thì no-op; nếu là `CANCELLED` hoặc `FAILED` mà PayPal đã xác nhận capture `COMPLETED` với amount/currency khớp, thì chuyển `CANCELLED|FAILED → PAID` (đây là chuyển trạng thái hợp lệ bổ sung, chỉ dành cho `fulfil()`), cấp token và ghi log `LATE_CAPTURE`. Cron chỉ huỷ Order `PENDING` **chưa có** `paypal_capture_id` và trước khi huỷ phải hỏi PayPal `GET order`: nếu PayPal order ở trạng thái `APPROVED` hoặc `COMPLETED` thì không huỷ. Mọi trường hợp amount/currency không khớp đều đặt `Order.flag = 'NEEDS_REVIEW'` và hiển thị trên danh sách đơn hàng admin; không bao giờ bỏ qua im lặng.

---

## H-2 — Xoá, huỷ publish hoặc thay file của Sheet đã có người mua (Critical)

**Cặp unit:** *Catalog admin CRUD* (FR-12 "xoá Sheet") với *Payment & download* (FR-9 token 7 ngày).

- Catalog tuân thủ AD-1 vì nó sở hữu Sheet và SheetFile, nên nó xoá. Nếu dùng hard delete: FK `Order → Sheet` sẽ lỗi (team catalog thêm `onDelete: Cascade` để "cho chạy được"), khiến Order, DownloadToken và DownloadLog cùng biến mất, doanh thu trên dashboard (FR-17) bị giảm theo, và người mua đang trong 7 ngày mất quyền tải.
- **Ai xoá object S3?** AD-6 nói chỉ `media` nói chuyện với S3, AD-9 chỉ nói về rollback khi upload. Team catalog gọi `media.deletePrefix(sheets/{id})`, còn team commerce giả định file private vẫn tồn tại khi token còn hạn.
- **Unpublish/DRAFT:** AD-10 quy định "Draft trả 404 ở mọi route public". `GET /downloads/:token/:fileType` là route public (có `@Public()`), vậy nó trả 404 hay vẫn phục vụ file? Team download đọc AD-10 và chặn, team commerce đọc FR-9 và cho qua.
- **Thay file (re-upload PDF):** AD-9 ghi SheetFile mới với key có hash mới. SheetFile cũ và các PAGE_IMAGE cũ có bị xoá không? Nếu xoá trong transaction thì rollback không khôi phục được S3; nếu không xoá thì có object mồ côi và `page_count` có thể lệch với số PAGE_IMAGE còn lại.

**Rule đề xuất (AD mới "Vòng đời Sheet & file"):**
> Sheet không bao giờ bị hard delete khi đã có Order nào tham chiếu; "Xoá" trong admin là `status = ARCHIVED` (thêm vào enum `SheetStatus`). Chỉ Sheet chưa từng có Order mới được hard delete. `ARCHIVED` và `DRAFT` trả 404 trên mọi route public **ngoại trừ** `/downloads/:token/*`: token hợp lệ luôn tải được bất kể `Sheet.status`. `/files/:sheetId/*` (tải miễn phí) yêu cầu `PUBLISHED`. Thay một file = ghi SheetFile mới và đánh dấu bản cũ `superseded_at` trong cùng transaction. Object S3 của bản cũ (private) chỉ được xoá bởi cron `media-gc` của `catalog` sau khi không còn DownloadToken còn hạn nào của Sheet đó; object public cũ được giữ 30 ngày (CDN immutable). Token luôn phục vụ bản **hiện tại** của FileType đã mua. Mọi thao tác xoá object S3 đều đi qua một hàm duy nhất `catalog.FileLifecycleService` → `media.delete(keys)`; không unit nào khác gọi `media.delete`.

---

## H-3 — "Offer" (mua được gì, giá bao nhiêu, bundle gồm gì) có hai người tính (High)

**Cặp unit:** *Sheet detail page / modal thanh toán* (web đọc DTO từ `catalog`) với *create-order* (`commerce` tự tính giá theo AD-3).

- AD-3 bảo `commerce` "tự tính giá từ Sheet hiện tại". AD-1 cấm frontend có logic giá. Nhưng modal cần biết loại file nào mua được, giá lẻ và giá bundle. Endpoint public của `catalog` trả `price_pdf_cents…`, còn modal tự suy ra "MP3 không có giá hoặc `has_mp3=false` thì ẩn", tức là có logic giá ở frontend. Trong khi đó `commerce` viết hàm tính giá thứ hai, và hai hàm này sẽ lệch nhau.
- **Bundle khi Sheet thiếu MP3:** `items: 'BUNDLE'`. Commerce A hiểu BUNDLE là {PDF, MIDI, MP3} và bán cả file không tồn tại; Commerce B hiểu BUNDLE là các file đang có. Khi admin thêm MP3 sau, người đã mua bundle có tải được MP3 không? AD-8 nói "file thuộc Order" nhưng không nói Order lưu FileType cụ thể hay chỉ lưu chữ `'BUNDLE'`.
- **Giá null hoặc 0:** `has_pdf=true` nhưng `price_pdf_cents=null` có nghĩa là miễn phí, không bán, hay lỗi?
- **Race đổi giá:** modal fetch `no-store` và hiển thị $3; admin đổi thành $5; `create-order` tính $5 và PayPal popup hiện $5. AD-3 được tuân thủ nhưng người mua thấy giá khác với modal (vi phạm tinh thần FR-7).

**Rule đề xuất (AD mới "Offer do một hàm duy nhất tính"):**
> `catalog.PricingService.quote(sheet): Offer` là nguồn duy nhất trả về `{isFree, items: [{fileType, priceCents}], bundle: {fileTypes, priceCents} | null}`. Một FileType chỉ mua được khi có SheetFile hiện hành **và** `price_*_cents > 0`. Bundle chỉ tồn tại khi có ≥ 2 FileType mua được và `price_bundle_cents` nhỏ hơn tổng giá lẻ; khi đó nó gồm đúng các FileType mua được tại thời điểm quote. Endpoint public (modal) trả `Offer` và `commerce.createOrder` gọi đúng hàm này; frontend chỉ render `Offer`. `Order.items` lưu danh sách FileType đã được giải cụ thể cùng giá (không lưu chuỗi `'BUNDLE'`), kèm cờ `isBundle`. File thêm vào Sheet sau khi mua không thuộc Order. `create-order` nhận thêm `expectedTotalCents` (chỉ dùng để so khớp, không dùng làm giá); lệch thì trả `PRICE_CHANGED` kèm `Offer` mới. Đánh dấu Published yêu cầu `isFree` hoặc ít nhất một FileType mua được.

---

## H-4 — Mặt phẳng HTTP: SSR so với trình duyệt, IP thật, CORS, cookie (High)

**Cặp unit:** *Public web* (SSR + beacon + tải file) với *API platform* (throttler, AD-11 hash, AD-12 IP).

- **IP:** Request đi qua Cloudflare → Caddy → api. AD-11 tính `sha256(ip + ua …)` và AD-15/NFR throttle theo IP. Nếu không cấu hình `trust proxy` thì `ip` là IP của Caddy hoặc Cloudflare, dẫn đến (a) toàn bộ người dùng chung một bucket rate limit nên tải miễn phí bị chặn hàng loạt, (b) mọi lượt xem có cùng hash nên view_count gần như đứng yên. Nếu SSR của web gọi API thì IP là container `web`. Nếu API tin `X-Forwarded-For` từ bất kỳ đâu thì kẻ tấn công giả header để vượt rate limit.
- **URL API:** SSR trong container nên gọi `http://api:4000` (mạng nội bộ), còn trình duyệt gọi `https://api.<tld>`. Team web dùng một biến `NEXT_PUBLIC_API_URL` cho cả hai (SSR đi vòng ra Cloudflare, bị throttle theo IP của VPS), còn team admin dùng hai biến.
- **CORS/cookie:** refresh cookie `Path=/auth` nằm trên `api.<tld>`, admin ở `admin.<tld>` phải gọi `fetch(..., {credentials:'include'})`, và API phải bật CORS có credentials với origin tường minh. Spine không nói gì về CORS. Spine ghi "cả ba site" nhưng liệt kê bốn subdomain.
- **Admin SSR:** access JWT "giữ trong bộ nhớ admin app". Nếu team admin dùng React Server Components để fetch dữ liệu admin thì phía server không có token, và họ sẽ tự chuyển JWT sang cookie, phá AD-13.

**Rule đề xuất (AD mới "Ranh giới HTTP"):**
> API bật `trust proxy` đúng 2 hop (Cloudflare → Caddy). IP client **chỉ** lấy từ `CF-Connecting-IP`, do Caddy chuyển tiếp; Caddy xoá mọi `CF-*`/`X-Forwarded-*` không đến từ dải IP Cloudflare. Một helper `clientIp(req)` dùng chung cho throttler, AD-11 và DownloadLog. Web có hai biến: `API_INTERNAL_URL` (SSR/route handler, gọi `http://api:4000`, gắn header `X-Internal-Secret`, được miễn throttle) và `NEXT_PUBLIC_API_URL` (trình duyệt). Các lời gọi phụ thuộc người dùng (beacon view, create-order, capture, download) luôn đi từ trình duyệt, không bao giờ proxy qua SSR. CORS: API chỉ cho phép origin `https://<tld>` (không có credentials) và `https://admin.<tld>` (`credentials: true`); `/auth/*` chỉ nhận origin admin. Admin app render dữ liệu admin hoàn toàn phía client; không có Server Component hoặc route handler nào của admin gọi `/admin/*`.

---

## H-5 — Revalidate tag không phủ đủ các trang bị ảnh hưởng (High)

**Cặp unit:** *Catalog admin CRUD* (phát tag sau commit) với *Public web listing* (gắn tag cho fetch).

- AD-10 chỉ liệt kê `sheet:{id}`, `level:{level}`, `ads`, `settings`, `sitemap`. Trang `/composer/{slug}`, `/genre/{slug}`, trang search và danh sách cùng Series trên trang chi tiết không có tag nào. Team web tự đặt tag `composer:{slug}`, còn team API phát `composer:{id}`, nên không khớp và trang giữ nội dung cũ vô thời hạn.
- Đổi Level của Sheet phải phát cả `level:{old}` lẫn `level:{new}`; unit CRUD chỉ biết giá trị mới.
- Đổi tên Composer ảnh hưởng mọi `sheet:{id}` của Composer đó.
- Ai phát tag? Mỗi service tự gọi `fetch(WEB_URL/api/revalidate)`, dẫn đến N bản sao và N kiểu bắt lỗi khác nhau. Web down lúc API commit thì nội dung cũ tồn tại mãi vì không có TTL dự phòng.
- Có cần revalidate khi view_count thay đổi? Nếu có thì mỗi beacon gây một lần revalidate; nếu không thì con số hiển thị cũ. Spine không nói.

**Rule đề xuất (siết AD-10):**
> Tag chuẩn định nghĩa trong `packages/shared/cache-tags.ts` và dùng **ID** (không dùng slug): `sheet:{id}`, `level:{LEVEL}`, `composer:{id}`, `genre:{id}`, `series:{id}`, `sheets:list` (search, home), `ads`, `settings`, `sitemap`. Chỉ `catalog.CacheInvalidator.tagsFor(before, after)` được tính tag cho thay đổi Catalog (bao gồm cả giá trị cũ lẫn mới của level/composer/series/genres, và fan-out sang `sheet:*` khi đổi Composer/Series). `ads` và `settings` gọi cùng một client `WebRevalidateClient` (thuộc module `settings`). Gọi revalidate chạy sau commit, retry 3 lần; nếu thất bại thì ghi log `REVALIDATE_FAILED`. Mọi fetch ISR của web đặt `revalidate: 600` làm lưới an toàn. `view_count` và `download_count` không kích hoạt revalidate; chúng được làm mới theo TTL.

---

## H-6 — Ai lật `has_*` và `page_count` (High)

**Cặp unit:** *Upload pipeline* (AD-9: ghi `has_*` trong transaction upload) với *Sheet CRUD form* (sửa `lyrics`, `youtube_url`, xoá file).

- `has_chords` phụ thuộc vào lyrics và `has_video` phụ thuộc vào `youtube_url`, nhưng cả hai được ghi bởi form CRUD chứ không phải upload. `has_sheet` ↔ PDF. Khi xoá file (không có endpoint nào được nêu), ai đặt `has_mp3=false`? Form CRUD gửi `hasMp3: true` trong PATCH DTO vì DTO sinh từ zod bao gồm mọi cột, nên admin ghi đè cờ mà không có file.
- Upload PDF và upload MP3 chạy song song (admin kéo-thả nhiều file): hai transaction cùng đọc và ghi lại cả Sheet row, dẫn đến lost update trên `has_*`.
- Hai request upload PDF đồng thời (double click, retry) tạo hai SheetFile PDF và hai bộ PAGE_IMAGE xen kẽ nhau.

**Rule đề xuất (AD mới hoặc siết AD-9):**
> `has_*` và `page_count` là **cột dẫn xuất**; không DTO nào nhận chúng. Chúng chỉ được ghi bởi `catalog.SheetService.recomputeDerived(sheetId, tx)`, được gọi ở cuối mọi transaction thay đổi SheetFile, `lyrics` hoặc `youtube_url`. Hàm này chạy `SELECT … FROM sheets WHERE id=$1 FOR UPDATE` trước. SheetFile có `UNIQUE(sheet_id, file_type) WHERE superseded_at IS NULL AND file_type IN (PDF,MIDI,MP3,THUMBNAIL)` và `UNIQUE(sheet_id, page_no) WHERE file_type=PAGE_IMAGE AND superseded_at IS NULL`. Xoá file đi qua `DELETE /admin/sheets/:id/files/:fileType` (đánh dấu superseded và recompute), không được làm bằng PATCH Sheet.

---

## H-7 — Bộ đếm lượt tải: hai nguồn, miễn phí không được đếm (Medium)

**Cặp unit:** *Download (commerce)* với *Dashboard (analytics)* và *thẻ lưới Sheet (catalog)*.

- AD-8 chỉ ghi DownloadLog cho tải qua token, còn tải miễn phí không để lại log nào. FR-17 cần "lượt tải theo Level" nên với sheet miễn phí số đếm luôn là 0.
- Nếu một team thêm `Sheet.download_count` (catalog sở hữu) thì commerce không được ghi vào (AD-1) và phải gọi `catalog.incrementDownload()` ngoài transaction của token, khiến hai con số lệch nhau.
- Doanh thu "PAID trừ REFUNDED theo ngày": theo ngày tạo, ngày paid hay ngày refund? Tính theo múi giờ UTC hay Việt Nam? Chưa có cột `paid_at`/`refunded_at`.

**Rule đề xuất:**
> Mọi lượt tải thành công (miễn phí hoặc qua token) đều ghi `DownloadLog(sheet_id, file_type, token_id NULL khi miễn phí, ip_hash, ua, at)` trong `commerce`. Không có cột `download_count` trên Sheet; `analytics` tổng hợp từ DownloadLog, và nếu cần hiển thị công khai thì `catalog` đọc một view hoặc materialized view refresh theo cron. `Order` có `paid_at` và `refunded_at`. Doanh thu của ngày D bằng Σ amount có `paid_at` ∈ D trừ Σ amount có `refunded_at` ∈ D, với D tính theo `REPORT_TZ` (mặc định `Asia/Ho_Chi_Minh`, cấu hình bằng env).

---

## H-8 — "Dùng lại cùng email thì tải luôn" không có đường đi (Medium)

**Cặp unit:** *Sheet detail page* (UJ-1 edge case: quay lại, bấm Download, không phải trả lần hai) với *commerce create-order*.

Spine chỉ có đường token (link trong email). Team web làm nút "Tôi đã mua" để tra theo email, nhưng không có endpoint nào cho việc đó. Team commerce thì cứ tạo Order mới, và người mua trả tiền hai lần. Nếu thêm endpoint tra theo email mà trả token ngay thì đó là lỗ hổng (biết email người khác là tải được).

**Rule đề xuất:**
> `create-order` kiểm tra xem đã có Order `PAID` với cùng `(email, sheetId)`, token còn hạn và bao phủ các FileType yêu cầu hay chưa. Nếu có thì trả `ALREADY_PURCHASED` và **gửi lại email chứa link token** (qua `notify`, throttle 3 lần/giờ theo email); không bao giờ trả token trong response. Không có endpoint nào tra đơn theo email mà trả dữ liệu đơn.

---

## H-9 — Preview Draft: AD-10 cấm, UJ-3 yêu cầu (Medium)

**Cặp unit:** *Admin app* ("lưu Draft, xem trước") với *Public web* (Draft trả 404 ở mọi route).

Team admin dựng lại toàn bộ trang chi tiết trong admin, gồm player và page images; team web thì thêm `?preview=1` để bỏ qua 404. Kết quả là hai bản trang chi tiết, hoặc một cửa hậu lộ Draft.

**Rule đề xuất:**
> Preview dùng route `/[locale]/preview/[sheetId]?t={previewToken}` của web: `dynamic`, `no-store`, `noindex`, không gắn tag, không gửi beacon view. `previewToken` là JWT 10 phút do `POST /admin/sheets/:id/preview-token` cấp; web SSR gọi `GET /sheets/:id?preview={token}` của API, và chỉ đường này được trả Draft. Admin không tự render trang chi tiết.

---

## H-10 — Sitemap: ai sinh, lấy dữ liệu từ đâu (Medium)

**Cặp unit:** *SEO (web)* với *Catalog API*.

Tag `sitemap` có trong AD-10 nhưng không có endpoint nào liệt kê toàn bộ slug. Endpoint list phân trang có `pageSize` tối đa, nên web phải gọi N lần hoặc tự đặt `pageSize=100000`. Mỗi URL cần hai locale và `hreflang`, còn `lastmod` phải lấy từ `updated_at`.

**Rule đề xuất:**
> `apps/web/app/sitemap.ts` là chủ duy nhất của sitemap, gắn tag `sitemap`. Nó gọi `GET /sitemap-entries` (`@Public`, chỉ `PUBLISHED`), endpoint trả `{type, id, slug, updatedAt}[]` cho sheet, composer và genre, và mỗi entry được xuất cho cả `/vi` lẫn `/en` kèm `alternates`. `catalog` phát tag `sitemap` khi publish, unpublish, archive hoặc đổi slug. Khi vượt 50.000 URL thì chuyển sang sitemap index (lúc đó cần AD mới).

---

## H-11 — Slug, locale redirect và URL cũ (Low–Medium)

**Cặp:** *Catalog CRUD* (slug chỉ sửa được khi DRAFT) với *SEO*. Sheet `PUBLISHED → DRAFT → sửa slug → PUBLISHED` được phép theo đúng chữ của rule, nhưng URL cũ đã được index sẽ trả 404.

**Rule:** Slug bị khoá vĩnh viễn kể từ lần publish đầu tiên (`first_published_at IS NOT NULL`). Route public khớp slug thì dùng slug; nếu không khớp thì thử `public_id` rồi 301 về slug chuẩn.

---

## H-12 — Refund trong khi đang tải; gia hạn token phá "chụp lúc phát" (Low–Medium)

- FR-15 "gia hạn DownloadToken" có vẻ mâu thuẫn với AD-8 "hạn dùng chụp lúc phát". Team A nghĩ không được sửa token; team B UPDATE `expires_at` thẳng từ controller admin.
- `refund()` vô hiệu hoá token trong khi một request download đã qua bước kiểm tra, chỉ còn chờ `UPDATE used`.

**Rule:** Chỉ `commerce.DownloadTokenService.extend(tokenId, {days, extraUses})` được sửa token và mỗi lần sửa phải ghi audit. Điều kiện tải là **một câu UPDATE duy nhất**: `UPDATE download_tokens t SET used=used+1 FROM orders o WHERE t.id=$1 AND o.id=t.order_id AND o.status='PAID' AND t.revoked_at IS NULL AND t.expires_at>now() AND t.used<t.max_uses RETURNING …`. Kiểm tra quyền không bao giờ được tách thành SELECT rồi UPDATE.

---

## H-13 — `payments_enabled=false` giữa chừng một giao dịch (Low)

Người mua đã approve trên PayPal, admin tắt thanh toán, rồi capture đến. Commerce A từ chối capture (tiền bị giữ, order treo), commerce B cho qua.

**Rule:** `payments_enabled` chỉ chặn **`create-order`**. Capture, webhook, refund và download luôn hoạt động bất kể cờ này.

---

## H-14 — Upload endpoint thuộc module nào; giới hạn body qua proxy (Low)

`POST /admin/sheets/:id/files` là controller của `catalog` (chủ SheetFile) hay của `media` (chủ xử lý)? `media` "không có bảng" nhưng lại cần ghi SheetFile theo AD-9. Nếu admin upload qua route handler của Next thì bị giới hạn body của Next và Caddy.

**Rule:** Controller và transaction thuộc `catalog`; `media` chỉ cung cấp `processPdf/processMidi/putObject/delete/sign` dạng hàm thuần, không đụng Prisma. Trình duyệt admin upload thẳng lên `https://api.<tld>` (multipart). Caddy đặt `request_body max_size 25MB` cho `/admin/sheets/*/files`. Upload chạy trong transaction ngắn: xử lý file và `putObject` **ngoài** transaction, chỉ mở transaction để ghi DB (tránh giữ lock Postgres trong lúc `pdftoppm` chạy nhiều giây).

---

## H-15 — Toàn vẹn Composer/Series/Genre khi xoá hoặc gán chéo (Low)

`Composer ||--o{ Series` và `Composer ||--o{ Sheet`: Sheet có thể thuộc Series của Composer X nhưng lại có `composer_id = Y`. Xoá Composer còn Sheet thì cascade hay restrict?

**Rule:** FK `onDelete: Restrict` cho Composer/Series → Sheet (xoá bị chặn với `IN_USE`); Genre → SheetGenre dùng `Cascade`. `SheetService` từ chối `series.composer_id ≠ sheet.composer_id`.

---

## H-16 — Hai bản "enum" cho `SheetStatus`/`OrderStatus` khi thêm trạng thái (Low)

H-1 và H-2 thêm trạng thái mới (`ARCHIVED`, chuyển `CANCELLED→PAID`). AD-2 có test đồng bộ giá trị enum, nhưng **ma trận chuyển trạng thái** chỉ nằm trong văn bản AD-4.

**Rule:** Ma trận chuyển trạng thái của Order và Sheet được khai báo dạng dữ liệu (`ORDER_TRANSITIONS`) trong `packages/shared`. `OrderService` và `SheetService` bắt buộc kiểm tra qua ma trận này, và admin UI dùng nó để bật/tắt nút.

---

## Tổng hợp theo mức độ

| # | Hole | Mức | Loại |
| --- | --- | --- | --- |
| H-1 | Late capture sau khi cron CANCELLED, bị nuốt im lặng | Critical | Race / state machine |
| H-2 | Xoá/unpublish/thay file khi đã bán; không có chủ xoá S3 | Critical | Vòng đời / hai chủ |
| H-3 | Offer/bundle/giá có hai người tính; bundle thiếu MP3; race đổi giá | High | Shape dữ liệu dùng chung |
| H-4 | IP thật, API URL SSR/browser, CORS/cookie, admin RSC | High | Ranh giới HTTP |
| H-5 | Tag revalidate không phủ composer/genre/series/level cũ | High | Hợp đồng cache |
| H-6 | `has_*`/`page_count` bị ghi từ nhiều nơi, lost update | High | Hai chủ / race |
| H-7 | Đếm tải thiếu free; định nghĩa doanh thu theo ngày | Medium | Counter owner |
| H-8 | "Mua lại cùng email" không có đường đi | Medium | Trách nhiệm mơ hồ |
| H-9 | Preview Draft mâu thuẫn AD-10 | Medium | Trách nhiệm mơ hồ |
| H-10 | Sitemap không có nguồn dữ liệu | Medium | Owner |
| H-11 | Slug đổi sau khi đã publish | Low–Med | Vòng đời |
| H-12 | Gia hạn token; kiểm tra token không nguyên tử | Low–Med | Race |
| H-13 | `payments_enabled` chặn capture? | Low | Mơ hồ |
| H-14 | Upload endpoint thuộc module nào; transaction dài | Low | Owner |
| H-15 | FK Composer/Series/Genre | Low | Toàn vẹn |
| H-16 | Ma trận chuyển trạng thái không nằm trong shared | Low | Hợp đồng |

## Ghi chú nhỏ khác

- Spine ghi "cả ba site cùng site" nhưng liệt kê bốn subdomain (web, admin, api, cdn). Nên sửa chữ và nói rõ `cdn.` không nhận cookie.
- AD-8: link trong email là `https://<tld>/...` (trang web) hay `api.<tld>/downloads/...`? Nên chốt link email trỏ tới trang web `/[locale]/download/{token}`, trang này liệt kê các file và mỗi nút gọi API, để lỗi hết hạn hoặc hết lượt được hiển thị bằng UI có dịch (đúng FR-9 "lỗi rõ ràng").
- AD-11: beacon gửi cho Sheet Draft hoặc Archived phải bị bỏ qua (`WHERE status='PUBLISHED'`).
- AD-13: cần endpoint đổi mật khẩu (FR-11), và đổi mật khẩu phải thu hồi mọi RefreshToken.
