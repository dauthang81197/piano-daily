-- Thanh toán gói (S3 PayPal, dùng chung cho S4 VietQR) và ảnh chụp hạn mức trên Subscription. Viết tay theo mẫu trước.
CREATE TYPE "SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

CREATE TABLE "subscription_payments" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "code" TEXT NOT NULL,
    "customer_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "SubscriptionPaymentStatus" NOT NULL DEFAULT 'PENDING',
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "provider_ref" TEXT,
    "paypal_capture_id" TEXT,
    "payer_email" TEXT,
    "review_required" BOOLEAN NOT NULL DEFAULT false,
    "subscription_id" UUID,
    "paid_at" TIMESTAMPTZ(6),
    "refunded_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "subscription_payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "subscription_payments_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscription_payments_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscription_payments_subscription_id_fkey" FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "subscription_payments_provider_check" CHECK ("provider" IN ('PAYPAL', 'VIETQR')),
    CONSTRAINT "subscription_payments_currency_check" CHECK ("currency" IN ('USD', 'VND')),
    CONSTRAINT "subscription_payments_amount_check" CHECK ("amount" > 0),
    -- Thanh toán đã PAID luôn gắn Subscription và có thời điểm trả tiền.
    CONSTRAINT "subscription_payments_paid_check" CHECK ("status" <> 'PAID' OR ("subscription_id" IS NOT NULL AND "paid_at" IS NOT NULL)),
    -- PayPal tính bằng USD, VietQR bằng VND.
    CONSTRAINT "subscription_payments_provider_currency_check" CHECK (("provider" = 'PAYPAL' AND "currency" = 'USD') OR ("provider" = 'VIETQR' AND "currency" = 'VND'))
);

CREATE UNIQUE INDEX "subscription_payments_code_key" ON "subscription_payments"("code");
CREATE UNIQUE INDEX "subscription_payments_provider_ref_key" ON "subscription_payments"("provider_ref");
CREATE INDEX "subscription_payments_customer_id_created_at_idx" ON "subscription_payments"("customer_id", "created_at");
CREATE INDEX "subscription_payments_status_created_at_idx" ON "subscription_payments"("status", "created_at");

-- Hạn mức chụp trên Subscription; backfill từ gói hiện tại cho bản ghi S2 (cấp tay).
ALTER TABLE "subscriptions" ADD COLUMN "download_quota" INTEGER;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_download_quota_check" CHECK ("download_quota" IS NULL OR "download_quota" >= 1);
UPDATE "subscriptions" s SET "download_quota" = p."download_quota" FROM "plans" p WHERE p."id" = s."plan_id";
