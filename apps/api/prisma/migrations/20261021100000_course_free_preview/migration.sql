-- C5: bài xem thử miễn phí. Mặc định false: khi bật cưỡng chế thuê bao, bài chưa đánh dấu xem thử chỉ dành cho khách có gói.
ALTER TABLE "course_lessons" ADD COLUMN "is_free_preview" BOOLEAN NOT NULL DEFAULT false;
