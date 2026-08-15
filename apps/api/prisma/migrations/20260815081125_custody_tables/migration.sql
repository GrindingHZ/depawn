-- CreateEnum
CREATE TYPE "intake_status" AS ENUM ('DRAFT', 'SEALED');

-- CreateEnum
CREATE TYPE "receipt_status" AS ENUM ('IN_VAULT', 'ENCUMBERED', 'RELEASED', 'LIQUIDATED');

-- CreateEnum
CREATE TYPE "item_category" AS ENUM ('BULLION');

-- CreateTable
CREATE TABLE "vault" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "insured_limit_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vault_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "intake_record" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "borrower_account_id" TEXT NOT NULL,
    "item_category" "item_category" NOT NULL,
    "item_description" TEXT NOT NULL,
    "serial_numbers" TEXT[],
    "seal_number" TEXT,
    "evidence" JSONB NOT NULL,
    "status" "intake_status" NOT NULL,
    "sealed_hash" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "intake_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appraisal" (
    "id" TEXT NOT NULL,
    "intake_id" TEXT NOT NULL,
    "appraiser_id" TEXT NOT NULL,
    "value_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "comparable_references" TEXT NOT NULL,
    "appraised_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custody_receipt" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT NOT NULL,
    "holder_account_id" TEXT NOT NULL,
    "intake_record_hash" TEXT NOT NULL,
    "appraised_value_minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "appraised_at" TIMESTAMP(3) NOT NULL,
    "appraiser_id" TEXT NOT NULL,
    "item_category" "item_category" NOT NULL,
    "insurance_policy_reference" TEXT NOT NULL,
    "status" "receipt_status" NOT NULL,
    "encumbered_by_loan_id" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "custody_receipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "intake_record_vault_id_status_idx" ON "intake_record"("vault_id", "status");

-- CreateIndex
CREATE INDEX "appraisal_intake_id_idx" ON "appraisal"("intake_id");

-- CreateIndex
CREATE INDEX "custody_receipt_vault_id_status_idx" ON "custody_receipt"("vault_id", "status");

-- CreateIndex
CREATE INDEX "custody_receipt_holder_account_id_status_idx" ON "custody_receipt"("holder_account_id", "status");

-- AddForeignKey
ALTER TABLE "intake_record" ADD CONSTRAINT "intake_record_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "intake_record"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custody_receipt" ADD CONSTRAINT "custody_receipt_vault_id_fkey" FOREIGN KEY ("vault_id") REFERENCES "vault"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
