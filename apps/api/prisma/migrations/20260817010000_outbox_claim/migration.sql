-- DropIndex
DROP INDEX "outbox_event_published_at_idx";

-- AlterTable
ALTER TABLE "outbox_event" ADD COLUMN     "claimed_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "outbox_event_published_at_claimed_at_idx" ON "outbox_event"("published_at", "claimed_at");

