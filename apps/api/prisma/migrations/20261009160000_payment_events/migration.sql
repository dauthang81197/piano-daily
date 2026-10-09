-- Sự kiện webhook PayPal (Story 3.8). Viết tay theo mẫu `download_tokens`.
CREATE TABLE "payment_events" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "provider_event_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_events_pkey" PRIMARY KEY ("id")
);

-- Chặn xử lý trùng cùng một event PayPal.
CREATE UNIQUE INDEX "payment_events_provider_event_id_key" ON "payment_events"("provider_event_id");
