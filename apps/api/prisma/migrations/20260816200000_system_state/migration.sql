-- CreateTable
CREATE TABLE "system_state" (
    "id" TEXT NOT NULL,
    "paused_at" TIMESTAMP(3),
    "paused_by_account_id" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_state_pkey" PRIMARY KEY ("id")
);

