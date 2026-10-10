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
