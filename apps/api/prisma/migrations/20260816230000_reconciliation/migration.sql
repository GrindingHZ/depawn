-- CreateTable
CREATE TABLE "reconciliation_run" (
    "id" TEXT NOT NULL,
    "vault_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_run_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reconciliation_drift" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "expected" TEXT NOT NULL,
    "observed" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reconciliation_drift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reconciliation_run_vault_id_started_at_idx" ON "reconciliation_run"("vault_id", "started_at");

-- CreateIndex
CREATE INDEX "reconciliation_drift_run_id_idx" ON "reconciliation_drift"("run_id");

-- AddForeignKey
ALTER TABLE "reconciliation_drift" ADD CONSTRAINT "reconciliation_drift_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "reconciliation_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

