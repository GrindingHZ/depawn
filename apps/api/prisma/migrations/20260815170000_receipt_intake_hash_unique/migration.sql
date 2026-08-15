-- Database backstop for rule C2: one receipt per sealed intake record. The
-- use case also serialises through the vault lock; this index is the layer
-- that survives any future code path.
CREATE UNIQUE INDEX "custody_receipt_intake_record_hash_key" ON "custody_receipt"("intake_record_hash");
