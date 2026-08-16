-- CreateTable
CREATE TABLE "protocol_parameter_version" (
    "id" TEXT NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "written_by_account_id" TEXT NOT NULL,
    "parameters" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "protocol_parameter_version_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dead_letter_event" (
    "id" TEXT NOT NULL,
    "outbox_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "attempts" INTEGER NOT NULL,
    "last_error" TEXT NOT NULL,
    "dead_lettered_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dead_letter_event_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "protocol_parameter_version_effective_at_idx" ON "protocol_parameter_version"("effective_at");

