-- Dedupe lượt xem (Story 2.7, AD-11): mỗi (sheet, visitor_hash, giờ UTC) được đếm đúng một lần.
-- visitor_hash = sha256(ip + ua + VIEW_SALT) hex; không lưu IP/UA thô.
CREATE TABLE "sheet_view_dedupe" (
    "sheet_id" UUID NOT NULL,
    "visitor_hash" CHAR(64) NOT NULL,
    "hour_bucket" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sheet_view_dedupe_pkey" PRIMARY KEY ("sheet_id","visitor_hash","hour_bucket")
);

-- Phục vụ job dọn dòng cũ.
CREATE INDEX "sheet_view_dedupe_hour_bucket_idx" ON "sheet_view_dedupe"("hour_bucket");

-- Xoá Sheet thì xoá theo.
ALTER TABLE "sheet_view_dedupe" ADD CONSTRAINT "sheet_view_dedupe_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
