-- Khoá học song ngữ: trường tiếng Anh tuỳ chọn (null = web tiếng Anh dùng bản tiếng Việt) và mức của level.
ALTER TABLE "course_tracks" ADD COLUMN "title_en" TEXT, ADD COLUMN "description_en" TEXT;
ALTER TABLE "course_levels" ADD COLUMN "title_en" TEXT, ADD COLUMN "description_en" TEXT, ADD COLUMN "preset" TEXT;
ALTER TABLE "course_sections" ADD COLUMN "title_en" TEXT, ADD COLUMN "description_en" TEXT;
ALTER TABLE "course_lessons" ADD COLUMN "title_en" TEXT, ADD COLUMN "content_en" TEXT;

ALTER TABLE "course_tracks"
  ADD CONSTRAINT "course_tracks_title_en_check" CHECK (title_en IS NULL OR char_length(title_en) BETWEEN 1 AND 120),
  ADD CONSTRAINT "course_tracks_description_en_check" CHECK (description_en IS NULL OR char_length(description_en) <= 500);
ALTER TABLE "course_levels"
  ADD CONSTRAINT "course_levels_title_en_check" CHECK (title_en IS NULL OR char_length(title_en) BETWEEN 1 AND 120),
  ADD CONSTRAINT "course_levels_description_en_check" CHECK (description_en IS NULL OR char_length(description_en) <= 500),
  ADD CONSTRAINT "course_levels_preset_check" CHECK (preset IS NULL OR preset IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED', 'EXPERT'));
ALTER TABLE "course_sections"
  ADD CONSTRAINT "course_sections_title_en_check" CHECK (title_en IS NULL OR char_length(title_en) BETWEEN 1 AND 120),
  ADD CONSTRAINT "course_sections_description_en_check" CHECK (description_en IS NULL OR char_length(description_en) <= 500);
ALTER TABLE "course_lessons"
  ADD CONSTRAINT "course_lessons_title_en_check" CHECK (title_en IS NULL OR char_length(title_en) BETWEEN 1 AND 120),
  ADD CONSTRAINT "course_lessons_content_en_check" CHECK (content_en IS NULL OR char_length(content_en) <= 20000);
