-- CreateEnum
CREATE TYPE "Level" AS ENUM ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT');

-- CreateEnum
CREATE TYPE "SheetStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateTable
CREATE TABLE "sheets" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "public_id" SERIAL NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "subtitle" TEXT,
    "composer_id" UUID NOT NULL,
    "series_id" UUID,
    "level" "Level" NOT NULL,
    "difficulty_score" SMALLINT,
    "difficulty_note" TEXT,
    "description" TEXT,
    "lyrics_chords" TEXT,
    "youtube_url" TEXT,
    "has_sheet" BOOLEAN NOT NULL DEFAULT false,
    "has_chords" BOOLEAN NOT NULL DEFAULT false,
    "has_midi" BOOLEAN NOT NULL DEFAULT false,
    "has_mp3" BOOLEAN NOT NULL DEFAULT false,
    "has_video" BOOLEAN NOT NULL DEFAULT false,
    "page_count" INTEGER NOT NULL DEFAULT 0,
    "view_count" INTEGER NOT NULL DEFAULT 0,
    "is_hot" BOOLEAN NOT NULL DEFAULT false,
    "status" "SheetStatus" NOT NULL DEFAULT 'DRAFT',
    "first_published_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sheets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sheet_genres" (
    "sheet_id" UUID NOT NULL,
    "genre_id" UUID NOT NULL,

    CONSTRAINT "sheet_genres_pkey" PRIMARY KEY ("sheet_id","genre_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sheets_public_id_key" ON "sheets"("public_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheets_slug_key" ON "sheets"("slug");

-- CreateIndex
CREATE INDEX "sheets_status_idx" ON "sheets"("status");

-- CreateIndex
CREATE INDEX "sheets_composer_id_idx" ON "sheets"("composer_id");

-- CreateIndex
CREATE INDEX "sheets_series_id_idx" ON "sheets"("series_id");

-- CreateIndex
CREATE INDEX "sheets_level_idx" ON "sheets"("level");

-- CreateIndex
CREATE INDEX "sheet_genres_genre_id_idx" ON "sheet_genres"("genre_id");

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_composer_id_fkey" FOREIGN KEY ("composer_id") REFERENCES "composers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "series"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_genres" ADD CONSTRAINT "sheet_genres_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sheet_genres" ADD CONSTRAINT "sheet_genres_genre_id_fkey" FOREIGN KEY ("genre_id") REFERENCES "genres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Độ khó 0–100 (Prisma không quản lý CHECK constraint).
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_difficulty_score_check" CHECK ("difficulty_score" BETWEEN 0 AND 100);
