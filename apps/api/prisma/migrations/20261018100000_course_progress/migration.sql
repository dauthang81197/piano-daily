-- C2: tiến độ học khoá học. Có dòng = khách đã hoàn thành bài; bỏ đánh dấu = xoá dòng.
CREATE TABLE "course_lesson_progress" (
    "customer_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "completed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_lesson_progress_pkey" PRIMARY KEY ("customer_id", "lesson_id"),
    CONSTRAINT "course_lesson_progress_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "course_lesson_progress_lesson_id_idx" ON "course_lesson_progress"("lesson_id");
