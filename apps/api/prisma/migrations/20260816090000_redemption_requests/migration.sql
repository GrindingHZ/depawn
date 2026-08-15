-- CreateEnum
CREATE TYPE "redemption_status" AS ENUM ('REQUESTED', 'VERIFIED', 'RELEASED');

-- CreateTable
CREATE TABLE "redemption_request" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "requested_by_account_id" TEXT NOT NULL,
    "requested_at" TIMESTAMP(3) NOT NULL,
    "status" "redemption_status" NOT NULL,
    "verified_at" TIMESTAMP(3),
    "verified_by_staff_id" TEXT,
    "released_at" TIMESTAMP(3),
    "released_by_staff_id" TEXT,
    "seal_number_broken" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "redemption_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "redemption_request_vault_id_status_idx" ON "redemption_request"("vault_id", "status");

-- CreateIndex
CREATE INDEX "redemption_request_requested_by_account_id_idx" ON "redemption_request"("requested_by_account_id");


-- One live request per receipt. The receipt burn at request time already
-- serialises this, but the index is the layer that survives any future code
-- path that forgets.
CREATE UNIQUE INDEX "redemption_request_live_receipt_key"
  ON "redemption_request"("receipt_id")
  WHERE status <> 'RELEASED';
