-- AlterTable: cột chỉ ghi cho dòng MIDI (duration_seconds giây, note_count tổng số nốt), null cho type khác.
ALTER TABLE "sheet_files" ADD COLUMN "duration_seconds" DOUBLE PRECISION;
ALTER TABLE "sheet_files" ADD COLUMN "note_count" INTEGER;

ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_duration_seconds_check" CHECK ("duration_seconds" IS NULL OR "duration_seconds" >= 0);
ALTER TABLE "sheet_files" ADD CONSTRAINT "sheet_files_note_count_check" CHECK ("note_count" IS NULL OR "note_count" >= 0);

-- Mở rộng partial unique index để gồm MIDI_JSON: mỗi sheet chỉ một MIDI_JSON hiện hành (đối xứng MIDI,
-- source_file_id trỏ về MIDI, supersede cùng lúc với MIDI) — tái dùng đúng cơ chế hiện có, không cần
-- ràng buộc one-to-one riêng.
DROP INDEX "sheet_files_current_source_key";
CREATE UNIQUE INDEX "sheet_files_current_source_key" ON "sheet_files"("sheet_id", "type")
    WHERE "type" IN ('PDF', 'MIDI', 'MP3', 'MIDI_JSON') AND "superseded_at" IS NULL;
