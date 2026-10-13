-- Gói thuê bao, Subscription và bộ đếm dùng thử (S2 thuê bao). Viết tay theo mẫu các migration trước.
CREATE TYPE "SubscriptionStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

CREATE TABLE "plans" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name_vi" TEXT NOT NULL,
    "name_en" TEXT NOT NULL,
    "description_vi" TEXT NOT NULL DEFAULT '',
    "description_en" TEXT NOT NULL DEFAULT '',
    "price_vnd" INTEGER NOT NULL,
    "price_usd_cents" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "download_quota" INTEGER,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "plans_prices_check" CHECK ("price_vnd" >= 0 AND "price_usd_cents" >= 0),
    CONSTRAINT "plans_duration_check" CHECK ("duration_days" >= 1),
    CONSTRAINT "plans_quota_check" CHECK ("download_quota" IS NULL OR "download_quota" >= 1),
    CONSTRAINT "plans_sort_order_check" CHECK ("sort_order" >= 0)
);

CREATE INDEX "plans_is_active_sort_order_idx" ON "plans"("is_active", "sort_order");

CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "current_period_start" TIMESTAMPTZ(6) NOT NULL,
    "current_period_end" TIMESTAMPTZ(6) NOT NULL,
    "downloads_used_in_period" INTEGER NOT NULL DEFAULT 0,
    "provider" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscriptions_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscriptions_period_check" CHECK ("current_period_end" > "current_period_start"),
    CONSTRAINT "subscriptions_used_check" CHECK ("downloads_used_in_period" >= 0),
    CONSTRAINT "subscriptions_provider_check" CHECK ("provider" IS NULL OR "provider" IN ('ADMIN', 'VIETQR', 'PAYPAL'))
);

CREATE INDEX "subscriptions_customer_id_status_idx" ON "subscriptions"("customer_id", "status");
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");
-- Mỗi khách tối đa một Subscription ACTIVE.
CREATE UNIQUE INDEX "subscriptions_one_active_per_customer" ON "subscriptions"("customer_id") WHERE "status" = 'ACTIVE';

ALTER TABLE "customers" ADD COLUMN "trial_downloads_used" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "customers" ADD CONSTRAINT "customers_trial_downloads_used_check" CHECK ("trial_downloads_used" >= 0);

-- Mặc định tắt cưỡng chế: production chưa có thanh toán thuê bao (S3/S4), bật ngay thì khách hết lượt không mua được gì.
INSERT INTO "site_settings" ("key", "value") VALUES
    ('subscriptions_enabled', 'false'),
    ('trial_days', '7'),
    ('trial_max_downloads', '2')
ON CONFLICT ("key") DO NOTHING;
