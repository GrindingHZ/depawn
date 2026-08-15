-- CreateEnum
CREATE TYPE "listing_status" AS ENUM ('DRAFT', 'ACTIVE', 'MATCHED', 'CANCELLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "offer_status" AS ENUM ('PENDING', 'ACCEPTED', 'WITHDRAWN', 'EXPIRED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "listing" (
    "id" TEXT NOT NULL,
    "borrower_account_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "requested_principal_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "max_annual_percentage_rate_basis_points" INTEGER NOT NULL,
    "requested_duration_ms" BIGINT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "status" "listing_status" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offer" (
    "id" TEXT NOT NULL,
    "listing_id" TEXT NOT NULL,
    "lender_account_id" TEXT NOT NULL,
    "principal_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "annual_percentage_rate_basis_points" INTEGER NOT NULL,
    "duration_ms" BIGINT NOT NULL,
    "funds_hold_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "offered_at" TIMESTAMP(3) NOT NULL,
    "status" "offer_status" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "offer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listing_status_id_idx" ON "listing"("status", "id");

-- CreateIndex
CREATE INDEX "listing_borrower_account_id_idx" ON "listing"("borrower_account_id");

-- CreateIndex
CREATE INDEX "listing_receipt_id_idx" ON "listing"("receipt_id");

-- CreateIndex
CREATE INDEX "offer_listing_id_idx" ON "offer"("listing_id");

-- CreateIndex
CREATE INDEX "offer_lender_account_id_status_idx" ON "offer"("lender_account_id", "status");

-- AddForeignKey
ALTER TABLE "offer" ADD CONSTRAINT "offer_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Rule M2 stand in for Phase 1: a receipt can be in the control of at most
-- one live listing. Phase 3 enforces this by moving the receipt object into
-- the shared Listing.
CREATE UNIQUE INDEX "listing_receipt_active_key" ON "listing"("receipt_id") WHERE status IN ('DRAFT', 'ACTIVE');
