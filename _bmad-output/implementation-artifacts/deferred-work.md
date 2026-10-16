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

- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-tu-lam-moi-cache.md`
  summary: Khi làm trang Composer (Story 2.5), việc sửa `composerId` của một Series phải làm mới cả `list:composer:{cũ}` lẫn `list:composer:{mới}` (hiện `SeriesService.update` chỉ phát `list:series:{id}` và 4 tag level).
  evidence: Review Story 2.3 (Blind Hunter, Edge Case Hunter): trang Composer liệt kê Series sẽ cũ tới 10 phút sau khi Series đổi Composer; chưa có hậu quả vì trang Composer chưa tồn tại.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-trang-composer-va-genre.md`
  summary: Gắn link tới trang Genre (tag Genre) ở trang chi tiết Sheet để trang `/genre/[slug]` không bị mồ côi.
  evidence: Chỉ thẻ Sheet link tới Composer; không có đường vào `/genre/[slug]` ngoài gõ URL. Spec 2.5 loại tag Genre trên thẻ; trang chi tiết thuộc Story 2.6.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-5-trang-composer-va-genre.md`
  summary: Kiểm tra thủ công/e2e hành vi stretched link của `SheetCard` (click thân thẻ mở chi tiết, click tên Composer mở trang Composer).
  evidence: Test hiện chỉ kiểm tên class Tailwind; jsdom không dựng layout nên không chứng minh vùng bấm.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-10-xem-truoc-sheet-draft-tu-admin.md`
  summary: Trả HTTP 404 thật (thay vì 200 kèm giao diện 404 và `noindex`) cho Sheet, Composer, Genre và route preview không tồn tại hoặc sai token.
  evidence: Đã chạy server standalone và `curl`: `/vi/sheet/khong-co`, `/vi/composer/khong-co`, `/vi/genre/khong-co`, `/vi/preview/sheet/<id>?token=sai` đều trả 200 (body là trang 404 và có `<meta name="robots" content="noindex">`), trong khi `/vi/level/zzz` trả 404 vì `LevelLayout` kiểm tra ở layout (xem comment ở `level/[level]/layout.tsx`). Cờ `htmlLimitedBots: /.*/` và việc bỏ `loading.tsx` đều không đổi kết quả. Cách sửa: kiểm tra ở layout; riêng preview cần `proxy.ts` chuyển token vào header vì layout không đọc được `searchParams`. Nên làm cùng Story 2.11 (SEO).

- source_spec: `_bmad-output/implementation-artifacts/spec-2-11-seo-metadata-json-ld-va-sitemap.md`
  summary: Cập nhật mục "HTTP 404 thật" ở Story 2.10: đã xử lý cho Sheet, Composer, Genre (kiểm tra ở `layout.tsx`, đã `curl` xác nhận 404 và Draft không lộ); còn lại **chỉ route preview** (`/{locale}/preview/sheet/[id]?token=`) vẫn trả 200 kèm giao diện 404 và `noindex` khi token sai.
  evidence: Layout không đọc được `searchParams` nên không kiểm token được; cần `proxy.ts` chuyển `token` vào request header để layout xác minh. Rủi ro thấp: không lộ dữ liệu, có `noindex` và `X-Robots-Tag`.

- source_spec: `_bmad-output/implementation-artifacts/spec-2-11-seo-metadata-json-ld-va-sitemap.md`
  summary: Điều tra test tích hợp API chập chờn khi chạy cả bộ (`pnpm exec turbo run test --concurrency=1`).
  evidence: Ba lần (Story 2.8, 2.10, 2.11) có đúng một test thuộc nhóm `catalog-*` fail ở lần chạy cả bộ đầu tiên (`catalog-sheets.spec.ts`: timeout 20 giây và một ca `genreIds`; `catalog-taxonomy.spec.ts`: "xoá Composer không có Series -> 204"), nhưng chạy riêng file đó hoặc chạy lại cả bộ đều qua. Nghi do tải máy sau bước build/lint, hoặc dữ liệu còn sót giữa các file dùng chung một DB test. Chưa có bằng chứng nguyên nhân; cần chạy lặp nhiều lần có ghi log để tìm.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-1-dat-gia-sheet-va-danh-dau-mien-phi.md`
  summary: Gỡ file (PDF/MIDI/MP3) cuối cùng làm Sheet PUBLISHED không free mất type mua được vẫn được phép.
  evidence: Story 3.1 chỉ kiểm tra khả năng bán khi publish và khi PATCH giá/Miễn phí; `removeFile` chưa kiểm tra, quote sẽ trả `items` rỗng cho tới khi founder sửa.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-2-tai-ngay-sheet-mien-phi.md`
  summary: Đưa kiểm tra quyền tải Sheet free và ghi DownloadLog vào cùng một transaction (AD-20), hiện là hai bước riêng.
  evidence: `DownloadsService.freeDownloadUrl` gọi `FreeDownloadSource.resolve` rồi `DownloadLogRepository.recordFree`; Sheet bị gỡ/đổi sang không free giữa hai bước vẫn nhận signed URL tối đa 5 phút. Không liên quan tiền; nên xử lý khi Story 3.5 hợp nhất đường tải.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-3-tao-don-hang-paypal-phia-server.md`
  summary: CI/deploy chưa truyền `PAYPAL_MODE`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET` cho API trên VPS.
  evidence: `docker-compose.yml` để trống mặc định; `payments_enabled` seed `true` nên production không cấu hình sẽ trả 503 mọi lần mua (xem workflow deploy).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-capture-thanh-toan-va-cap-downloadtoken-idempotent.md`
  summary: `sheet-file-gc.service` (catalog) xoá `download_token_files` bằng SQL thô, vi phạm quy tắc mỗi bảng một module chủ; chưa có integration test capture bundle nhiều type (tên file, thứ tự).
  evidence: sheet-file-gc.service.ts ~L77; `capture-order.spec.ts` chỉ dùng đơn một type PDF. Nên đưa việc xoá qua cổng của commerce và thêm test bundle khi chạm lại.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-6-modal-thanh-toan-tren-trang-chi-tiet.md`
  summary: Modal chưa có thao tác thử capture lại cho cùng `paypalOrderId`; người mua có thể đã trả tiền nhưng chưa có link tải khi capture lỗi, đường lấy lại duy nhất là liên hệ.
  evidence: `payment-modal.tsx` onApprove chỉ hiện thông điệp `captureUnknown`; email link tải ở Story 3.7. Nên thêm nút "xác nhận lại" gọi `capture-order` với cùng id hoặc lấy lại qua email/orderCode khi làm 3.7.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-7-email-link-tai-va-mua-lai-cung-email.md`
  summary: Email link tải sau thanh toán không có thử lại/outbox; gửi lại qua `ALREADY_PURCHASED` có thể bị lạm dụng (lộ việc đã mua, gửi dồn cho người mua) và bộ đếm 3 lần/giờ chỉ nằm trong bộ nhớ tiến trình.
  evidence: `order.service.ts` gửi bằng `void sendPurchaseEmail` một lần; endpoint create-order công khai chỉ throttle theo IP. Nên thêm job quét đơn PAID có `email_sent_at` null, và đưa bộ đếm sang DB khi chạy nhiều instance hoặc khi làm Story 4.2.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-webhook-paypal.md`
  summary: Webhook PayPal gọi OAuth + verify cho mỗi request (kể cả request chữ ký giả), không cache access token, không giới hạn tốc độ route công khai.
  evidence: `PaypalProvider.verifyWebhook` lấy token mới mỗi lần và `WebhooksController` không có ThrottlerGuard; người lạ có thể tạo lưu lượng ra PayPal. Cần cache token theo `expires_in` và/hoặc giới hạn theo IP phía Cloudflare.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-webhook-paypal.md`
  summary: `payment_events.payload` giữ nguyên JSON event vô thời hạn (có thể chứa tên/email người trả), chưa có job dọn.
  evidence: bảng chỉ có insert và `markProcessed`; cần chính sách giữ (vd. xoá payload sau 90 ngày) khi làm vận hành.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-9-tu-huy-don-pending-qua-han.md`
  summary: Dọn đơn PENDING quá hạn có thể đói khi hơn 100 đơn kẹt (APPROVED/lỗi PayPal) chiếm hết batch cũ nhất trước.
  evidence: `findStalePending` luôn lấy 100 đơn cũ nhất; đơn không xử lý được vẫn PENDING nên lượt sau lấy lại, đơn mới bị bỏ đói.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-9-tu-huy-don-pending-qua-han.md`
  summary: Đơn fulfil lệch số tiền/tiền tệ bị `markReviewRequired` và ném lỗi lặp lại mỗi giờ.
  evidence: Đơn giữ PENDING nên cron quét lại mỗi lượt; chỉ gây nhiễu log và ghi DB thừa.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-dat-gia-hang-loat.md`
  summary: Apply đặt giá hàng loạt chỉ so `expectedCount`, nên tập Sheet bị thay cùng số lượng giữa preview và apply vẫn qua.
  evidence: `applyBulkPricing` so `locked.length` với `expectedCount`, không so danh sách id; cần gửi ids/hash trong hợp đồng apply.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-10-dat-gia-hang-loat.md`
  summary: Sheet PUBLISHED đã không bán được từ trước làm cả lô đặt giá hàng loạt bị 422, và danh sách vi phạm không giới hạn.
  evidence: Kiểm bất biến chạy trên mọi Sheet PUBLISHED trong lô sau update, không phân biệt lỗi có sẵn với lỗi do đợt này gây ra.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-danh-sach-va-chi-tiet-don-hang.md`
  summary: Chuyển helper đổi ngày REPORT_TZ sang UTC (`dayStartUtc`, `reportRangeToUtc`) từ service `commerce` sang shared để Story 4.7 dùng.
  evidence: Dashboard doanh thu theo ngày/tháng ở `analytics` cần cùng quy tắc và không được import service nội bộ của module khác.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-1-danh-sach-va-chi-tiet-don-hang.md`
  summary: Chi tiết đơn cắt lịch sử tải ở 100 dòng nhưng UI không báo bị cắt hay hiện tổng.
  evidence: API trả tối đa 100 `downloads` và không có tổng hay cờ cắt bớt; token dùng nhiều sẽ bị hiển thị thiếu.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-gui-lai-email-va-gia-han-token.md`
  summary: Gửi lại email cho đơn có token hết hạn/hết lượt vẫn báo thành công dù người mua nhận link chết.
  evidence: `resendDownloadEmail` chỉ chặn đơn không PAID, chưa có token hoặc token bị vô hiệu; không xét `tokenStatus` EXPIRED/EXHAUSTED.
- source_spec: `_bmad-output/implementation-artifacts/spec-4-2-gui-lai-email-va-gia-han-token.md`
  summary: Thiếu test integration cho biên hạn năm 9999 của gia hạn và assertion rằng log gửi lại email không chứa email hay token.
  evidence: Test hiện chỉ phủ tràn INT4 của số lượt; log chỉ gồm mã đơn và tên lỗi nhưng không có test khoá lại.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-hoan-tien-tu-admin.md`
  summary: Kiểm chứng với PayPal sandbox xem `PayPal-Request-Id` cố định `refund-<mã đơn>` có phát lại kết quả từ chối cũ khiến không thể thử hoàn tiền lại.
  evidence: Nếu PayPal lưu cả phản hồi lỗi thì một lần bị từ chối tạm thời (vd thiếu số dư) không thể retry; cần id theo lần thử, vì refund thứ hai đã hoàn đủ được coi là thành công (`CAPTURE_FULLY_REFUNDED`).
- source_spec: `_bmad-output/implementation-artifacts/spec-4-3-hoan-tien-tu-admin.md`
  summary: Thêm test cho nhánh PayPal đã hoàn nhưng ghi DB lỗi, và test đua admin với webhook có kiểm soát thứ tự.
  evidence: Test đua hiện chấp nhận cả 200 và 409 cho admin nên không chứng minh nhánh webhook thắng đã chạy ở tầng tích hợp.

- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-cai-dat-site.md`
  summary: Đưa tên site đã lưu vào `og:siteName` và JSON-LD (hiện vẫn là hằng `SITE_NAME` trong `seo.ts`).
  evidence: Sau khi đổi tên site, tiêu đề tab đã đổi nhưng bản xem trước chia sẻ mạng xã hội vẫn hiện "Piano Daily".
- source_spec: `_bmad-output/implementation-artifacts/spec-4-4-cai-dat-site.md`
  summary: Thêm cách gỡ logo, và xoá file logo cũ sau khi revalidate xong.
  evidence: Chỉ có `POST admin/settings/logo`; file cũ bị xoá ngay nên trang web đã cache có thể hiện ảnh hỏng đến khi revalidate xong.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-trien-khai-production-tren-vps-sau-cloudflare.md`
  summary: Script firewall chỉ dùng `ufw` nên cổng 80/443 do Docker publish vẫn có thể truy cập trực tiếp, cần luật `DOCKER-USER` (hoặc bind giao diện) và kiểm bằng probe ngoài.
  evidence: Docker thêm luật NAT iptables bỏ qua chuỗi INPUT của ufw; tài liệu chỉ cảnh báo, chưa có tự động hoá nên IP gốc còn truy cập trực tiếp và giả mạo `CF-Connecting-IP`.
- source_spec: `_bmad-output/implementation-artifacts/spec-5-1-trien-khai-production-tren-vps-sau-cloudflare.md`
  summary: Thêm healthcheck cho web/admin, `depends_on: service_healthy` cho Caddy, và smoke check kiểm nội dung SSR cụ thể thay vì `<html`.
  evidence: `up --wait` hiện không chứng minh web/admin phục vụ được; smoke check chấp nhận mọi trang 2xx có thẻ `<html`.

- source_spec: `_bmad-output/implementation-artifacts/spec-5-2-backup-hang-dem-va-kiem-tra-khoi-phuc.md`
  summary: Vòng lặp backup không chạy bù khi container/VPS tắt đúng giờ, không bắt SIGTERM, và không có healthcheck/dấu hiệu lần thành công cuối (cần cho cảnh báo Story 5.3).
  evidence: Nếu container tắt lúc `BACKUP_AT`, lần backup bị bỏ tới hôm sau không có log; service lỗi liên tục vẫn trông khoẻ dưới `restart: unless-stopped`.

- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-webhook-paypal.md`
  summary: `PAYMENT.CAPTURE.REVERSED` (chargeback) và `CUSTOMER.DISPUTE.*` rơi vào nhánh "đã xử lý"; đơn vẫn PAID và token vẫn sống. Cần chọn chính sách thu hồi và ghi alert.
  evidence: `WebhookService.dispatch` chỉ xử lý COMPLETED, REFUNDED, DENIED rồi return; review Epic 3 (2026-10-12).
- source_spec: `_bmad-output/implementation-artifacts/spec-3-8-webhook-paypal.md`
  summary: Hai delivery đồng thời của cùng event id đều chạy `dispatch` (không có lease); an toàn nhờ `fulfil`/`refund`/`failIfPending` idempotent. `rawBody` bật toàn app; `payment_events.payload` lưu vô thời hạn (có thể chứa email/địa chỉ người mua); mỗi webhook xin OAuth token mới (tối đa 2 × 15 giây).
  evidence: `PaymentEventRepository.record` trả `created:false, processedAt:null` cho mọi bản trùng chưa xử lý; `PaypalProvider.verifyWebhook` không cache access token.
- source_spec: `_bmad-output/implementation-artifacts/spec-3-4-capture-thanh-toan-va-cap-downloadtoken-idempotent.md`
  summary: Capture lặp lại với đơn PAID trả token đã hết hạn/revoked/hết lượt kèm `files: []` (GC đã xoá `download_token_files`) mà vẫn 200; trang tải (3.5) và UI phải xử lý danh sách rỗng. Lost-race `fulfil` khi người thắng rollback trả 404 thay vì 503 chung.
  evidence: `OrderService.existingFulfilment` không kiểm trạng thái token; `fulfil` ném `notFound` khi đọc lại không thấy PAID; review Epic 3 (2026-10-12).

- source_spec: `_bmad-output/implementation-artifacts/spec-ads-affiliate-nhieu-san-pham.md`
  summary: Ảnh quảng cáo đã tải lên R2 (`public/ads/<hash>.webp`) không bị xoá khi thay ảnh hoặc gỡ sản phẩm; cần cách dọn ảnh mồ côi.
  evidence: `AdImageService.store` chỉ ghi, `AdsService.update/remove` không đụng R2 (theo Never của spec), nên bucket public chỉ lớn lên.
- source_spec: `_bmad-output/implementation-artifacts/spec-ads-affiliate-nhieu-san-pham.md`
  summary: Ở môi trường local (SeaweedFS, `S3_PUBLIC_BASE_URL` là `http://`), URL ảnh vừa tải lên không qua kiểm `https` của sản phẩm quảng cáo nên không lưu được slot.
  evidence: `adItemInputSchema` và CHECK `ad_items_urls_check` yêu cầu `https://`; `StorageService.publicUrl` trả base URL cấu hình; production (R2) là https nên không ảnh hưởng.

- source_spec: `_bmad-output/implementation-artifacts/spec-tay-piano-muot-va-tu-nhien.md`
  summary: `assignHands` chia tay theo cao độ nên quãng tám/hợp âm rộng quanh điểm chia (ví dụ C3+C4) bị tách sang hai tay thay vì một tay dang rộng.
  evidence: Phép thử `buildHandPath` với [48, 60] cho cả hai tay mỗi tay một nốt; chỉ [36, 48] (cùng vùng) mới dùng một tay dang rộng.
- source_spec: `_bmad-output/implementation-artifacts/spec-tay-piano-muot-va-tu-nhien.md`
  summary: Giai đoạn 3 của bàn tay chưa làm: model GLB chi tiết hơn, vật liệu da, cẳng tay thật, và xem lại bằng mắt dáng tay trên trình duyệt (các tiêu chí hiện chỉ là số đo ở Node).
  evidence: Môi trường làm việc không có WebGL; `hand-right.glb` 94 KB, màu da phẳng, cẳng tay là hình trụ.

- source_spec: `_bmad-output/implementation-artifacts/spec-tuy-chinh-goc-nhin-va-mau-canh-3d.md`
  summary: Mặc định góc nhìn và màu cho cả site chỉnh ở admin (phương án B) chưa làm; cài đặt hiện chỉ theo từng trình duyệt.
  evidence: Founder chọn phương án A (mọi người xem, lưu `localStorage`); muốn đổi giao diện mặc định cho mọi người cần cột `site_settings`, API, form admin và web đọc mặc định.

## Hoàn thiện bàn tay (feature/hoan-thien-ban-tay)

- Tay áo cẳng tay chưa chỉnh được màu trong ViewSettings.
- Hằng số cẳng tay (WRIST_*, FOREARM_START_Z) chưa có script đo lại khi đổi model hand-right.glb.
- Chưa có test winding mặt cho lathe cẳng tay; tên test "cổ tay không dời" trong hand-path.test.ts cần chỉnh cho khớp khẳng định.

## Tài khoản khách (feature/tai-khoan-khach)

- Cooldown gửi email xác minh/đặt lại theo từng email và throttle theo tài khoản (hiện chỉ throttle theo IP).
- Dùng lại refresh token đã thu hồi chưa thu hồi cả họ token; chưa có job dọn `customer_tokens`/`customer_refresh_tokens` hết hạn.
- CORS `credentials: true` đang áp cho mọi route với origin web; chỉ cần cho `/customer`.
- Chưa có: đổi mật khẩu khi đang đăng nhập, đặt mật khẩu cho tài khoản chỉ Google, xoá tài khoản, admin xem/khoá khách, chuẩn hoá alias Gmail.
- Quota tải miễn phí theo khách (S2); link tải ẩn danh cũ `/files/.../download` giờ 404 (cân nhắc 410/redirect).
- Google xác minh bằng `tokeninfo`; nếu lưu lượng đăng nhập tăng thì chuyển sang xác minh JWT bằng JWKS cục bộ.
- Test P2002 của `customer register` (đăng ký đồng thời).

## Gói thuê bao, dùng thử và paywall (feature/goi-thue-bao-dung-thu)

- Thanh toán gói (PayPal subscription S3, VietQR S4) chưa có: nút chọn gói ở `/pricing` là placeholder; cưỡng chế mặc định tắt.
- Gia hạn tự động và job chuyển `ACTIVE` quá hạn sang `EXPIRED` chưa có (hết hạn đang tính lười theo `current_period_end`).
- Chưa có trang tài khoản/lịch sử thanh toán, danh sách khách ở admin (S5) và chống tạo nhiều tài khoản để lấy thêm dùng thử (S6).
- Lượt dùng thử/gói đã trừ không được hoàn nếu ký URL tải thất bại sau khi commit (ký URL là tính toán cục bộ, hầu như không lỗi).
- (S2 review) Quota theo kỳ chưa tự đặt lại, `EXPIRED` chưa được ghi, Subscription chưa chụp giá/quota/thời hạn lúc mua: giải quyết cùng gia hạn ở S3/S4.
- (S2 review) Chưa có cửa sổ chống trùng/hoàn lượt khi tải lại cùng file hoặc nhấp đúp; chưa ghi người cấp gói; cấp gói chưa có chế độ gia hạn (đang thay gói cũ).
- (S2 review) Cân nhắc bắt đầu dùng thử từ lúc bật cưỡng chế cho khách cũ; từ chối bật cưỡng chế khi chưa có gói; cảnh báo sắp hết dùng thử; throttle `GET /plans` và `/customer/entitlement`.

## Thanh toán gói bằng PayPal (feature/thanh-toan-goi-paypal)

- PayPal Billing Subscriptions (tự gia hạn) chưa làm: hiện trả trước theo kỳ, hết hạn khách mua lại. Cần tạo gói bên PayPal cho từng `Plan` và webhook `BILLING.SUBSCRIPTION.*` nếu muốn tự gia hạn.
- Hoàn tiền gói từ admin (gọi PayPal refund) chưa có: hiện hoàn trên PayPal rồi webhook `REFUNDED` cập nhật trạng thái.
- Thanh toán PENDING bị bỏ dở chưa có job dọn như đơn mua lẻ (`pending-order-cleanup`).
- Giá gói USD và VND nhập riêng, PayPal luôn thu USD: khách tiếng Việt trả USD cho tới khi có VietQR (S4).
- (S3 review) Webhook `PAYMENT.CAPTURE.REVERSED` / `CUSTOMER.DISPUTE.*` và cộng dồn nhiều lần hoàn một phần chưa xử lý; thanh toán PENDING bỏ dở chưa có job dọn; chưa có email biên lai, chưa hiện mã `PS-` cho khách, chưa có công cụ capture lại cho admin; bảng thanh toán admin chưa phân trang/lọc; thay gói khác làm mất ngày còn lại (chưa cảnh báo/tỉ lệ); mã đơn mua lẻ `PD-` có ký tự lặp trong bảng chữ cái.

## Thanh toán gói bằng VietQR qua SePay (feature/thanh-toan-goi-vietqr)

- Chưa thử với tài khoản SePay thật: định dạng webhook theo tài liệu SePay, ảnh QR dùng `qr.sepay.vn` (tài liệu SePay có chỗ ghi `vietqr.app`); cần chuyển khoản thử một khoản nhỏ khi có tài khoản.
- Hoàn tiền VietQR là thủ công và chưa có thao tác admin đổi payment sang REFUNDED/huỷ gói.
- Thanh toán VietQR PENDING bỏ dở chưa có job dọn; chưa đối soát lại tự động các giao dịch SePay bị lỡ (chỉ có xác nhận thủ công).
- Khách quốc tế (locale en) chưa thấy VietQR dù có thể dùng ngân hàng Việt Nam.
- (S4 review) Chưa cộng dồn nhiều lần chuyển thiếu cùng một mã và chưa ghi số tiền thực nhận/mã tham chiếu ngân hàng từng giao dịch; chưa có thao tác admin hoàn tiền VietQR; panel VietQR dừng hỏi khi khách đổi sang PayPal hoặc đóng modal; chưa có bảng audit cho xác nhận thủ công (mới có log id admin).

## Khoá học C1 (feature/khoa-hoc-noi-dung)

- C1b: khuông nhạc (VexFlow) chạy nốt đồng bộ với player, khuông bên trái, bàn tay/phím bên phải; C1c: trình gõ nốt trong admin (+ nhập MIDI vào trình gõ), ghi cùng định dạng note-JSON.
- C2 tiến độ học (thanh "x/y bài · %" hiện đang là chỗ giữ 0%), C3 nộp bài bằng link YouTube/Drive, C4 đánh giá/bình luận công khai kiểm duyệt sau, C5 gắn thuê bao (bài miễn phí/trả phí).
- Admin chưa có xem trước bài nháp (player/video/nội dung như người học thấy); nội dung khoá chưa song ngữ; sắp xếp bằng nút lên/xuống, chưa kéo-thả.
- (C1 review) `PATCH /admin/courses/...` có ngữ nghĩa thay toàn bộ (trường vắng về mặc định, `isPublished` về false); admin UI luôn gửi đủ trường nên chưa ảnh hưởng, cần chuyển sang cập nhật từng phần nếu có client khác.
- (C1 review) Chưa từ chối MIDI 0 nốt; sort_order khi tạo đồng thời có thể trùng (chỉ thẩm mỹ, `move` chuẩn hoá lại); xoá/thay nhạc đồng thời với cùng nội dung có thể xoá nhầm object (khoá tất định); chưa GC object nhạc bài học mồ côi; nhánh/level/section công khai nhưng rỗng vẫn vào sitemap và hiện thẻ "0 bài"; sitemap chưa giới hạn 50k URL và lỗi khoá học làm hỏng cả sitemap; `lastmod` của nhánh không đổi khi bài đổi; cây admin chưa đánh dấu "ẩn do cha là nháp"; tạo bài mới không thể công khai chỉ với nhạc (cần lưu rồi upload); N+1 đếm bài ở danh sách nhánh; URL note-JSON của bài đã gỡ công khai vẫn truy cập được nếu biết đường dẫn.
- (C1 review) Test chưa phủ: 403 cho publish/gỡ nhạc/tạo level-section-lesson, move nhánh/level/section, đường rollback khi commit lỗi, `lib/courses.ts` và ba trang web, link header, bài chỉ có YouTube; spec ghi MIDI hỏng 400 nhưng code trả 422 `FILE_PROCESSING_FAILED` (theo pipeline Sheet).

## Khoá học song ngữ và level theo mức (feature/khoa-hoc-song-ngu)

- Chỉ hai ngôn ngữ vi/en, nhập tay; chưa có chỉ báo "mục nào còn thiếu bản tiếng Anh" ngoài dấu EN ở cây admin; level cũ (preset null) không tự chuyển sang mức có sẵn.
- Mô tả meta/SEO của trang bài `/en` dùng nội dung tiếng Anh nếu có; `hreflang` vẫn trỏ cặp URL vi/en như trước dù nội dung chưa dịch (trang `/en` hiện bản tiếng Việt).

- (song ngữ review) `PATCH` thay toàn bộ nên bỏ sót `titleEn/descriptionEn/contentEn/preset` sẽ xoá bản dịch/mức (admin UI luôn gửi đủ; chuyển sang cập nhật từng phần cùng mục PATCH của C1); level cũ chưa tự nhận mức; `hreflang` không phân biệt trang đã dịch/chưa dịch; chỉ báo thiếu bản dịch mới có ở tên bài/section/level; thiếu test: giới hạn `descriptionEn/contentEn`, CHECK DB, schema shared, trang web `[locale]/courses`.


## Khoá học C1b: khuông nhạc (feature/khoa-hoc-khuong-nhac)

- Khuông chỉ có ở trang bài học và chỉ dựng sau lần Play đầu tiên (chưa xem được khuông trước khi phát); chưa có tuplet, giọng/chiết âm, nốt chùm tinh chỉnh, ngón tay, in/xuất PDF; ô nhịp quá 120 chỉ hiển thị phần đầu.
- Màu khuông lấy theo chủ đề lúc vẽ (đổi chủ đề giữa chừng cần tải lại); dòng nhạc đã vẽ giữ trong bộ nhớ đến khi đổi bề rộng; dấu luyến giữa hai dòng chỉ vẽ phần đầu.
- Chưa có bàn phím/điều hướng bằng phím cho việc tua theo ô nhịp (thanh tua vẫn dùng được); chưa kiểm thử khuông trên trình duyệt thật trong CI (kiểm tay bằng ảnh chụp Chrome headless).

- (C1b review) Gần đúng nhịp điệu: triplet/swing/nốt ngắn cùng đơn vị 1/16 trộn thành hợp âm, hợp âm nhiều độ dài vẽ theo nốt dài nhất, thời điểm tô lệch tới nửa móc kép; chia độ dài tham lam không theo phách; chưa có anacrusis hay đổi nhịp giữa ô; nốt ngoài dải khuông bị cắt; dấu luyến giữa hai dòng chỉ nửa; hiệu năng khung hình (ref callback/cấp phát); tab vào khung cuộn và tua theo ô nhịp bằng phím; nhấp nháy bật/tắt khuông sau hydration; phím 88 phím trong cột hẹp khi không có 3D; kiểm `style-src` với CSP production; chưa có test dùng VexFlow thật (renderSystem bị mock).

## Khoá học C1c: trình gõ nốt (feature/khoa-hoc-trinh-go-nhac)

- Chưa nghe thử/hiện khuông ngay trong trình gõ (phải lưu rồi xem ở trang bài); chưa kéo-thả/kéo giãn nốt, velocity, nhiều track, pedal, tuplet, undo/redo, phím tắt; lưới chỉ có dải A0–C8 với 4 ô nhịp mỗi trang, chưa có thu phóng.
- Nhập MIDI chỉ lấy tempo và nhịp đầu tiên, làm tròn về 1/16 và gộp track; không lưu nháp trên server (nguồn chân lý là file MIDI đã lưu); hai admin sửa cùng lúc là ghi đè (last write wins).
- Chưa kiểm thử trình gõ trên trình duyệt thật (kiểm bằng test jsdom); lưới dùng ~90 hàng DOM cho mỗi trang.
- (C1c review) Nút Back của trình duyệt khi còn thay đổi chưa lưu không hỏi; số ô nhịp trống ở cuối không lưu trong MIDI nên mở lại có thể ít ô hơn; file chỉ có kênh trống báo lỗi chung; nhập MIDI bỏ tempo/nhịp sau tick 0 (đã báo); `getObject` không giới hạn kích thước (trần upload 2MB); lưới A0–C8 (rộng hơn spec C2–C7) với `role="group"`; chưa test `MusicEditorPage`, phân trang, độ dài chấm, đường lỗi 404 của "Mở nhạc hiện tại", EDITOR với nốt có sẵn, `apiFetch` binary + 401, `getObject`, `attachment`, lưu đè bài công khai chỉ có nhạc.

## Khoá học C2: tiến độ học (feature/khoa-hoc-tien-do)

- Chỉ đánh dấu tay (chưa tự đánh dấu khi xem hết video/nghe hết nhạc); chưa chứng chỉ, huy hiệu, chuỗi ngày học, thống kê cho admin; chưa đồng bộ tiến độ giữa nhiều tab ngay lập tức (tải lại khi mở trang); chưa lưu tiến độ cho khách chưa đăng nhập.
- Tiến độ tải sau khi trang hiện (thẻ nhảy từ 0% lên giá trị thật khi phiên khôi phục xong); chưa có skeleton.
- (C2 review) Thẻ nhánh nhấp nháy 0% → giá trị thật khi phiên khôi phục; chưa tự thử lại khi tải tiến độ lỗi; cây cache cũ có thể trỏ tới bài vừa ẩn (404 tạm); "Tiếp tục học" luôn tới bài chưa học đầu tiên (không theo bài học gần nhất); `GET progress` chưa phân trang; số nhiều tiếng Anh "1/1 lessons"; chưa test throttle 429 và HTML SSR.

## Khoá học C3: nộp bài (feature/khoa-hoc-nop-bai)

- Mỗi bài chỉ một bài nộp mỗi khách (sửa là ghi đè, không giữ lịch sử); chưa nhiều lần nộp, chấm điểm/nhận xét của giáo viên, thông báo email khi có bài nộp, hiển thị bài nộp công khai hay bình luận (C4).
- Không kiểm tra link có thật hay có công khai (Drive riêng tư vẫn nộp được; chỉ có gợi ý chia sẻ); không nhúng/xem trước video; danh sách admin tối đa 200 bài mới nhất, chưa phân trang hay lọc theo khách.
- Admin chưa có trang tổng hợp bài nộp mọi bài (chỉ theo từng bài); ẩn bài nộp chưa gửi thông báo cho khách.
- Chưa kiểm thử khối nộp bài và trang admin trên trình duyệt thật (kiểm bằng test jsdom).

