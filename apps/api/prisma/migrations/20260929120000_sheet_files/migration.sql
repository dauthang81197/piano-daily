
-- CreateEnum
CREATE TYPE "FileType" AS ENUM ('PDF', 'MIDI', 'MP3', 'THUMBNAIL', 'PAGE_IMAGE');

-- CreateTable
CREATE TABLE "sheet_files" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "sheet_id" UUID NOT NULL,
    "type" "FileType" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "original_name" TEXT,
    "size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "page_number" INTEGER,
    "source_file_id" UUID,
    "superseded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sheet_files_sheet_id_idx" ON "sheet_files"("sheet_id");

-- CreateIndex
CREATE INDEX "sheet_files_source_file_id_idx" ON "sheet_files"("source_file_id");

-- AddForeignKey
ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_source_file_id_fkey" FOREIGN KEY ("source_file_id") REFERENCES "sheet_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;



-- Mỗi (sheet_id, type) của PDF/MIDI/MP3 chỉ có một file hiện hành (Prisma không quản lý partial index).
CREATE UNIQUE INDEX "sheet_files_current_source_key" ON "sheet_files"("sheet_id", "type")
    WHERE "type" IN ('PDF', 'MIDI', 'MP3') AND "superseded_at" IS NULL;

-- Kích thước không âm; page_number (nếu có) từ 1.
ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_size_check" CHECK ("size" >= 0);
ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_page_number_check" CHECK ("page_number" IS NULL OR "page_number" >= 1);
