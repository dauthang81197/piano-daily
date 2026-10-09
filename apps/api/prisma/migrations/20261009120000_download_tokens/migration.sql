-- Quyền tải của Order đã PAID (Story 3.4, AD-20). Viết tay theo mẫu `orders_site_settings`.
CREATE TABLE "download_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "max_downloads" INTEGER NOT NULL,
    "used_downloads" INTEGER NOT NULL DEFAULT 0,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "download_tokens_max_downloads_check" CHECK ("max_downloads" > 0),
    CONSTRAINT "download_tokens_used_downloads_check" CHECK ("used_downloads" >= 0)
);

-- Mỗi Order đúng một token: nền tảng cho fulfil() idempotent.
CREATE UNIQUE INDEX "download_tokens_order_id_key" ON "download_tokens"("order_id");
CREATE UNIQUE INDEX "download_tokens_token_key" ON "download_tokens"("token");

ALTER TABLE "download_tokens" ADD CONSTRAINT "download_tokens_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- File hiện hành tại lúc cấp token. RESTRICT: GC không xoá file còn token tham chiếu.
CREATE TABLE "download_token_files" (
    "token_id" UUID NOT NULL,
    "sheet_file_id" UUID NOT NULL,

    CONSTRAINT "download_token_files_pkey" PRIMARY KEY ("token_id", "sheet_file_id")
);

CREATE INDEX "download_token_files_sheet_file_id_idx" ON "download_token_files"("sheet_file_id");

ALTER TABLE "download_token_files" ADD CONSTRAINT "download_token_files_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "download_tokens"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "download_token_files" ADD CONSTRAINT "download_token_files_sheet_file_id_fkey" FOREIGN KEY ("sheet_file_id") REFERENCES "sheet_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dòng nhật ký cũ không có token (tải miễn phí) nên token_id vốn nullable; xoá token thì giữ log.
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_token_id_fkey" FOREIGN KEY ("token_id") REFERENCES "download_tokens"("id") ON DELETE SET NULL ON UPDATE CASCADE;
