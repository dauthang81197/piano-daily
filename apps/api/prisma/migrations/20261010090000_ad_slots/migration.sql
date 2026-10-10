-- Vị trí quảng cáo (Story 4.5). Viết tay theo mẫu `orders_site_settings`.
CREATE TYPE "AdPosition" AS ENUM ('HEADER', 'SIDEBAR_LEFT', 'SIDEBAR_RIGHT', 'IN_LIST', 'STICKY_BOTTOM', 'IN_CONTENT');

CREATE TABLE "ad_slots" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "position" "AdPosition" NOT NULL,
    "html_code" TEXT,
    "image" TEXT,
    "link" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "ad_slots_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ad_slots_content_check" CHECK (
        ("html_code" IS NOT NULL AND btrim("html_code") <> '')
        OR ("image" IS NOT NULL AND "link" IS NOT NULL)
    ),
    -- Ảnh và link, nếu có, phải là URL https (chặn javascript:, chuỗi rỗng khi bỏ qua tầng ứng dụng).
    CONSTRAINT "ad_slots_urls_check" CHECK (
        ("image" IS NULL OR "image" ~ '^https://[^[:space:]]')
        AND ("link" IS NULL OR "link" ~ '^https://[^[:space:]]')
    )
);

CREATE UNIQUE INDEX "ad_slots_position_key" ON "ad_slots"("position");
