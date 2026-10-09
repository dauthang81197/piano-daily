-- Đơn hàng và cấu hình site (Story 3.3, AD-20). Viết tay theo mẫu `download_log`.
CREATE TYPE "OrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "order_code" TEXT NOT NULL,
    "sheet_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "items" JSONB NOT NULL,
    "amount_cents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "OrderStatus" NOT NULL DEFAULT 'PENDING',
    "paypal_order_id" TEXT,
    "paypal_capture_id" TEXT,
    "payer_email" TEXT,
    "payer_name" TEXT,
    "paid_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "orders_amount_cents_check" CHECK ("amount_cents" > 0),
    CONSTRAINT "orders_currency_check" CHECK ("currency" = 'USD')
);

CREATE UNIQUE INDEX "orders_order_code_key" ON "orders"("order_code");
CREATE UNIQUE INDEX "orders_paypal_order_id_key" ON "orders"("paypal_order_id");
CREATE INDEX "orders_sheet_id_idx" ON "orders"("sheet_id");

-- RESTRICT: Sheet từng có đơn không xoá cứng được (xoá Sheet có đơn chuyển sang ARCHIVED).
ALTER TABLE "orders" ADD CONSTRAINT "orders_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "sheets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "site_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "site_settings_pkey" PRIMARY KEY ("key")
);

INSERT INTO "site_settings" ("key", "value") VALUES
    ('payments_enabled', 'true'),
    ('token_default_days', '7'),
    ('token_default_max_downloads', '5');
