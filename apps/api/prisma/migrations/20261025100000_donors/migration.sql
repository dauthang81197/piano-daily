-- Người ủng hộ dự án (admin nhập tay).
CREATE TABLE "donors" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "name" TEXT NOT NULL,
    "amount" INTEGER,
    "message" TEXT,
    "donated_at" DATE NOT NULL DEFAULT CURRENT_DATE,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "donors_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "donors_is_visible_donated_at_idx" ON "donors"("is_visible", "donated_at" DESC);
