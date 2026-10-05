-- Tìm kiếm toàn văn (Story 2.4): unaccent + config 'simple' + GIN. SQL tay vì Prisma không mô tả cột generated.
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() mặc định chỉ STABLE nên không dùng được trong cột generated/index. Bọc với dictionary cố định
-- (schema-qualified) để khai báo IMMUTABLE; an toàn khi không đổi từ điển unaccent.
CREATE FUNCTION piano_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
    AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

-- Cột generated không tham chiếu được bảng khác: tên Composer nằm ở composers.search_vector,
-- truy vấn nối sheets với composers rồi OR hai vector.
ALTER TABLE "sheets" ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', piano_unaccent("title" || ' ' || coalesce("lyrics_chords", '')))) STORED;
CREATE INDEX "sheets_search_vector_idx" ON "sheets" USING GIN ("search_vector");

ALTER TABLE "composers" ADD COLUMN "search_vector" tsvector
    GENERATED ALWAYS AS (to_tsvector('simple', piano_unaccent("name"))) STORED;
CREATE INDEX "composers_search_vector_idx" ON "composers" USING GIN ("search_vector");
