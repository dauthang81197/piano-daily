-- Import Sheet hàng loạt của admin: đợt (batch) và các dòng (một PDF mỗi dòng), chạy nền trong API.
CREATE TABLE "sheet_import_batches" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "level" "Level" NOT NULL DEFAULT 'INTERMEDIATE',
    "composer_id" UUID,
    "genre_ids" UUID[] DEFAULT ARRAY[]::UUID[],
    "publish" BOOLEAN NOT NULL DEFAULT false,
    "cancelled_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_import_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sheet_import_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "batch_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "step" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" TEXT,
    "error_message" TEXT,
    "sheet_id" UUID,
    "run_after" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(6),
    "finished_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sheet_import_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sheet_import_batches_created_at_idx" ON "sheet_import_batches"("created_at" DESC);
CREATE INDEX "sheet_import_items_batch_id_created_at_id_idx" ON "sheet_import_items"("batch_id", "created_at", "id");
CREATE INDEX "sheet_import_items_status_run_after_idx" ON "sheet_import_items"("status", "run_after");
CREATE INDEX "sheet_import_items_sheet_id_idx" ON "sheet_import_items"("sheet_id");

ALTER TABLE "sheet_import_batches" ADD CONSTRAINT "sheet_import_batches_composer_id_fkey" FOREIGN KEY ("composer_id") REFERENCES "composers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sheet_import_items" ADD CONSTRAINT "sheet_import_items_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "sheet_import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sheet_import_items" ADD CONSTRAINT "sheet_import_items_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Prisma không quản lý CHECK constraint.
ALTER TABLE "sheet_import_items" ADD CONSTRAINT "sheet_import_items_status_check" CHECK ("status" IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED', 'CANCELLED'));
ALTER TABLE "sheet_import_items" ADD CONSTRAINT "sheet_import_items_step_check" CHECK ("step" IS NULL OR "step" IN ('CONVERTING', 'CREATING', 'ATTACHING'));
