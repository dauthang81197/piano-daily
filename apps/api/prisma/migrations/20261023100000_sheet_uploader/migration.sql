-- Bài do khách đăng: người đăng. Xoá khách thì bài còn lại, `uploader_id` về NULL (bài của hệ thống).
ALTER TABLE "sheets" ADD COLUMN "uploader_id" UUID;
CREATE INDEX "sheets_uploader_id_idx" ON "sheets"("uploader_id");
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_uploader_id_fkey" FOREIGN KEY ("uploader_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
