-- Tài khoản khách (S1 thuê bao): tách khỏi `users` (admin). Viết tay theo mẫu các migration trước.
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "email" TEXT NOT NULL,
    "password_hash" TEXT,
    "google_sub" TEXT,
    "name" TEXT NOT NULL,
    "email_verified_at" TIMESTAMPTZ(6),
    "locale" TEXT NOT NULL DEFAULT 'vi',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customers_locale_check" CHECK ("locale" IN ('vi', 'en')),
    -- Phải có ít nhất một cách đăng nhập.
    CONSTRAINT "customers_login_method_check" CHECK ("password_hash" IS NOT NULL OR "google_sub" IS NOT NULL)
);

CREATE UNIQUE INDEX "customers_email_key" ON "customers"("email");
CREATE UNIQUE INDEX "customers_google_sub_key" ON "customers"("google_sub");

CREATE TABLE "customer_refresh_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_refresh_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_refresh_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_refresh_tokens_token_hash_key" ON "customer_refresh_tokens"("token_hash");
CREATE INDEX "customer_refresh_tokens_customer_id_idx" ON "customer_refresh_tokens"("customer_id");

CREATE TYPE "CustomerTokenPurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

CREATE TABLE "customer_tokens" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "customer_id" UUID NOT NULL,
    "purpose" "CustomerTokenPurpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "used_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "customer_tokens_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "customer_tokens_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "customer_tokens_token_hash_key" ON "customer_tokens"("token_hash");
CREATE INDEX "customer_tokens_customer_id_purpose_idx" ON "customer_tokens"("customer_id", "purpose");

ALTER TABLE "download_logs" ADD COLUMN "customer_id" UUID;
ALTER TABLE "download_logs" ADD CONSTRAINT "download_logs_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "download_logs_customer_id_idx" ON "download_logs"("customer_id");
