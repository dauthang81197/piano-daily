-- C4: đánh giá sao và bình luận bài học (kiểm duyệt sau: admin ẩn/xoá).
CREATE TABLE "course_ratings" (
    "customer_id" UUID NOT NULL,
    "lesson_id" UUID NOT NULL,
    "stars" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "course_ratings_pkey" PRIMARY KEY ("customer_id", "lesson_id"),
    CONSTRAINT "course_ratings_stars_check" CHECK ("stars" BETWEEN 1 AND 5),
    CONSTRAINT "course_ratings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_ratings_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "course_ratings_lesson_id_idx" ON "course_ratings"("lesson_id");

CREATE TABLE "course_comments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "lesson_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "is_hidden" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "edited_at" TIMESTAMPTZ(6),

    CONSTRAINT "course_comments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "course_comments_body_check" CHECK (char_length("body") BETWEEN 1 AND 1000),
    CONSTRAINT "course_comments_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "course_lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_comments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "course_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "course_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "course_comments_lesson_id_parent_id_created_at_idx" ON "course_comments"("lesson_id", "parent_id", "created_at" DESC);
CREATE INDEX "course_comments_parent_id_idx" ON "course_comments"("parent_id");
CREATE INDEX "course_comments_customer_id_idx" ON "course_comments"("customer_id");
CREATE INDEX "course_comments_created_at_idx" ON "course_comments"("created_at" DESC);
