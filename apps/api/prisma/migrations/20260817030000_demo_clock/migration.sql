-- A demo spreads its loan book across weeks by moving the clock in the seed
-- process, then serves it from another. The offset has to survive the gap.
CREATE TABLE "demo_clock" (
  "id" TEXT NOT NULL,
  "offset_ms" BIGINT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "demo_clock_pkey" PRIMARY KEY ("id")
);
