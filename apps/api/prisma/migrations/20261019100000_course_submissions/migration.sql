-- C3: bài nộp của khách cho bài học (link YouTube/Drive). Mỗi (khách, bài) tối đa một dòng.
CREATE TABLE "course_submissions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "note" TEXT,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_submissions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_submissions_kind_check" CHECK ("kind" IN ('YOUTUBE', 'DRIVE')),
    CONSTRAINT "course_submissions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_submissions_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "course_submissions_customer_id_lesson_id_key" ON "course_submissions"("customer_id", "lesson_id");
CREATE INDEX "course_submissions_lesson_id_created_at_idx" ON "course_submissions"("lesson_id", "created_at" DESC);
