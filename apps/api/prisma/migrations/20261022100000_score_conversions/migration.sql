-- Chuyển PDF/ảnh/MusicXML bản nhạc sang MIDI (kết quả tạm của khách). File gốc không được lưu.
CREATE TABLE "score_conversions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "original_name" TEXT,
    "transpose" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "midi_key" TEXT,
    "note_json_key" TEXT,
    "duration_seconds" DOUBLE PRECISION,
    "note_count" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ(6),
    "expires_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "score_conversions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "score_conversions_customer_id_created_at_idx" ON "score_conversions"("customer_id", "created_at" DESC);
CREATE INDEX "score_conversions_expires_at_idx" ON "score_conversions"("expires_at");

ALTER TABLE "score_conversions" ADD CONSTRAINT "score_conversions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Prisma không quản lý CHECK constraint.
ALTER TABLE "score_conversions" ADD CONSTRAINT "score_conversions_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED'));
ALTER TABLE "score_conversions" ADD CONSTRAINT "score_conversions_transpose_check" CHECK ("transpose" BETWEEN -12 AND 12);
