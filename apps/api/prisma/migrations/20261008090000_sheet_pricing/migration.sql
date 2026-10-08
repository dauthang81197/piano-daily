-- Giá Sheet (Story 3.1, AD-3): cents USD nguyên; null hoặc 0 = không bán. `is_free` bỏ qua giá riêng lẻ.
ALTER TABLE "sheets"
    ADD COLUMN "is_free" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN "price_pdf_cents" INTEGER,
    ADD COLUMN "price_midi_cents" INTEGER,
    ADD COLUMN "price_mp3_cents" INTEGER,
    ADD COLUMN "price_bundle_cents" INTEGER;

-- Trần 100000 cents (1000 USD) phải trùng MAX_PRICE_CENTS trong packages/shared.
ALTER TABLE "sheets" ADD CONSTRAINT "sheets_price_cents_range" CHECK (
    ("price_pdf_cents" IS NULL OR "price_pdf_cents" BETWEEN 0 AND 100000)
    AND ("price_midi_cents" IS NULL OR "price_midi_cents" BETWEEN 0 AND 100000)
    AND ("price_mp3_cents" IS NULL OR "price_mp3_cents" BETWEEN 0 AND 100000)
    AND ("price_bundle_cents" IS NULL OR "price_bundle_cents" BETWEEN 0 AND 100000)
);
