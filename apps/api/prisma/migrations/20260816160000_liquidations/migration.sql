-- CreateEnum
CREATE TYPE "liquidation_status" AS ENUM ('SCHEDULED', 'BIDDING', 'SETTLED', 'CANCELLED');

-- CreateTable
CREATE TABLE "liquidation" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "reserve_price_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "liquidation_status" NOT NULL,
    "opens_at" TIMESTAMP(3),
    "closes_at" TIMESTAMP(3),
    "winning_bid_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidation_bid" (
    "id" TEXT NOT NULL,
    "liquidation_id" TEXT NOT NULL,
    "bidder_account_id" TEXT NOT NULL,
    "minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "funds_hold_id" TEXT NOT NULL,
    "placed_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "liquidation_bid_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "liquidation_loan_id_key" ON "liquidation"("loan_id");

-- CreateIndex
CREATE INDEX "liquidation_status_idx" ON "liquidation"("status");

-- CreateIndex
CREATE INDEX "liquidation_bid_liquidation_id_idx" ON "liquidation_bid"("liquidation_id");

-- CreateIndex
CREATE INDEX "liquidation_bid_bidder_account_id_idx" ON "liquidation_bid"("bidder_account_id");

-- AddForeignKey
ALTER TABLE "liquidation_bid" ADD CONSTRAINT "liquidation_bid_liquidation_id_fkey" FOREIGN KEY ("liquidation_id") REFERENCES "liquidation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

