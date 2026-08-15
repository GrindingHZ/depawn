-- CreateEnum
CREATE TYPE "loan_status" AS ENUM ('ACTIVE', 'REPAID', 'DEFAULTED', 'LIQUIDATED');

-- CreateTable
CREATE TABLE "loan" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "borrower_account_id" TEXT NOT NULL,
    "principal_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "annual_percentage_rate_basis_points" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "matures_at" TIMESTAMP(3) NOT NULL,
    "grace_ends_at" TIMESTAMP(3) NOT NULL,
    "lender_note_id" TEXT NOT NULL,
    "borrower_note_id" TEXT NOT NULL,
    "status" "loan_status" NOT NULL,
    "origination_settlement_kind" TEXT NOT NULL,
    "origination_settlement_reference" TEXT NOT NULL,
    "origination_settled_at" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lender_note" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "holder_account_id" TEXT NOT NULL,
    "transferable" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lender_note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "borrower_note" (
    "id" TEXT NOT NULL,
    "loan_id" TEXT NOT NULL,
    "holder_account_id" TEXT NOT NULL,
    "transferable" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "borrower_note_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "loan_lender_note_id_key" ON "loan"("lender_note_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_borrower_note_id_key" ON "loan"("borrower_note_id");

-- CreateIndex
CREATE INDEX "loan_receipt_id_status_idx" ON "loan"("receipt_id", "status");

-- CreateIndex
CREATE INDEX "loan_borrower_account_id_status_idx" ON "loan"("borrower_account_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "lender_note_loan_id_key" ON "lender_note"("loan_id");

-- CreateIndex
CREATE INDEX "lender_note_holder_account_id_idx" ON "lender_note"("holder_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "borrower_note_loan_id_key" ON "borrower_note"("loan_id");

-- CreateIndex
CREATE INDEX "borrower_note_holder_account_id_idx" ON "borrower_note"("holder_account_id");

