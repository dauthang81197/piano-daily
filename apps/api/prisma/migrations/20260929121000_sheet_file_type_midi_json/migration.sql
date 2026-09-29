-- AlterEnum
-- Postgres không cho dùng giá trị enum mới thêm trong CÙNG transaction đã ADD VALUE (trừ khi type cũng
-- được CREATE trong transaction đó). Vì migration sau cần dùng 'MIDI_JSON' ngay trong CREATE INDEX,
-- việc thêm giá trị này phải nằm ở một migration (transaction) riêng, chạy và commit trước.
ALTER TYPE "FileType" ADD VALUE 'MIDI_JSON';
