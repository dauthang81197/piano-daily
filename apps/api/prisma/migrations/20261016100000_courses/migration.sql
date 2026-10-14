-- Khoá học C1: Nhánh -> Level -> Section -> Bài học. Viết tay theo mẫu các migration trước.
CREATE TABLE "course_tracks" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_tracks_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_tracks_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "course_tracks_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX "course_tracks_slug_key" ON "course_tracks"("slug");
CREATE INDEX "course_tracks_sort_order_idx" ON "course_tracks"("sort_order");

CREATE TABLE "course_levels" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "track_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_levels_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_levels_track_id_fkey" FOREIGN KEY ("track_id") REFERENCES "course_tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "course_levels_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "course_levels_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120)
);
CREATE INDEX "course_levels_track_id_sort_order_idx" ON "course_levels"("track_id", "sort_order");

CREATE TABLE "course_sections" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "level_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_sections_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_sections_level_id_fkey" FOREIGN KEY ("level_id") REFERENCES "course_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "course_sections_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "course_sections_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120)
);
CREATE INDEX "course_sections_level_id_sort_order_idx" ON "course_sections"("level_id", "sort_order");

CREATE TABLE "course_lessons" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "section_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "youtube_url" TEXT,
    "content" TEXT NOT NULL DEFAULT '',
    "duration_minutes" INTEGER,
    "midi_storage_key" TEXT,
    "note_json_key" TEXT,
    "midi_original_name" TEXT,
    "midi_duration_seconds" DOUBLE PRECISION,
    "midi_note_count" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_published" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_lessons_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_lessons_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "course_sections"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "course_lessons_sort_order_check" CHECK ("sort_order" >= 0),
    CONSTRAINT "course_lessons_title_check" CHECK (char_length(btrim("title")) BETWEEN 1 AND 120),
    CONSTRAINT "course_lessons_duration_check" CHECK ("duration_minutes" IS NULL OR "duration_minutes" BETWEEN 1 AND 600),
    -- Nhạc: file gốc và note-JSON luôn đi cùng nhau.
    CONSTRAINT "course_lessons_midi_pair_check" CHECK (("midi_storage_key" IS NULL) = ("note_json_key" IS NULL)),
    -- Bài đang công khai phải có ít nhất một trong video, nhạc, nội dung.
    CONSTRAINT "course_lessons_published_has_part_check" CHECK (
        NOT "is_published" OR "youtube_url" IS NOT NULL OR btrim("content") <> '' OR "midi_storage_key" IS NOT NULL
    )
);
CREATE INDEX "course_lessons_section_id_sort_order_idx" ON "course_lessons"("section_id", "sort_order");
