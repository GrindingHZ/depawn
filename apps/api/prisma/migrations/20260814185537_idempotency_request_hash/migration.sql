-- AlterTable
ALTER TABLE "idempotency_record" ADD COLUMN     "request_hash" TEXT NOT NULL DEFAULT '';
