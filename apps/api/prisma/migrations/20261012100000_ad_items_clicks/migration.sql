-- Sản phẩm quảng cáo (nhiều sản phẩm mỗi vị trí) và đếm lượt bấm theo ngày. Viết tay theo mẫu `ad_slots`.
CREATE TYPE "AdPlatform" AS ENUM ('SHOPEE', 'TIKTOK', 'LAZADA', 'OTHER');

CREATE TABLE "ad_items" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "slot_id" UUID NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "image" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "label" TEXT,
    "sort_order" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_items_slot_id_fkey" FOREIGN KEY ("slot_id") REFERENCES "ad_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    -- Ảnh và link phải là URL https (chặn javascript:, chuỗi rỗng khi bỏ qua tầng ứng dụng).
    CONSTRAINT "ad_items_urls_check" CHECK ("image" ~ '^https://[^[:space:]]' AND "link" ~ '^https://[^[:space:]]'),
    CONSTRAINT "ad_items_label_check" CHECK ("label" IS NULL OR char_length("label") <= 120)
);

CREATE INDEX "ad_items_slot_id_sort_order_idx" ON "ad_items"("slot_id", "sort_order");

CREATE TABLE "ad_clicks" (
    "item_id" UUID NOT NULL,
    "day" DATE NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_clicks_pkey" PRIMARY KEY ("item_id", "day"),
    CONSTRAINT "ad_clicks_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "ad_items"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ad_clicks_count_check" CHECK ("count" >= 0)
);

-- Dữ liệu cũ: mỗi slot có ảnh + link thành một sản phẩm nền tảng OTHER. Slot có cả mã HTML thì trước đây chỉ hiện HTML
-- (ảnh + link bị bỏ qua), nên không chuyển để slot hiển thị y như trước.
INSERT INTO "ad_items" ("slot_id", "platform", "image", "link", "sort_order", "updated_at")
SELECT "id", 'OTHER', "image", "link", 0, CURRENT_TIMESTAMP
FROM "ad_slots"
WHERE "image" IS NOT NULL AND "link" IS NOT NULL AND ("html_code" IS NULL OR btrim("html_code") = '');

-- Bỏ hai CHECK cũ và hai cột đã chuyển sang `ad_items`.
ALTER TABLE "ad_slots" DROP CONSTRAINT "ad_slots_content_check";
ALTER TABLE "ad_slots" DROP CONSTRAINT "ad_slots_urls_check";
ALTER TABLE "ad_slots" DROP COLUMN "image";
ALTER TABLE "ad_slots" DROP COLUMN "link";
