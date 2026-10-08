-- Nhật ký tải (Story 3.2, AD-20): mỗi lượt tải thành công ghi một dòng; không có cột download_count.
-- ip_hash = sha256(ip + VIEW_SALT) hex; không lưu IP thô. token_id null cho tải miễn phí.
CREATE TABLE "download_logs" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "sheet_id" UUID NOT NULL,
    "file_type" "FileType" NOT NULL,
    "token_id" UUID,
    "ip_hash" CHAR(64) NOT NULL,
    "ua" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "download_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "download_logs_sheet_id_created_at_idx" ON "download_logs"("sheet_id", "created_at");

ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
