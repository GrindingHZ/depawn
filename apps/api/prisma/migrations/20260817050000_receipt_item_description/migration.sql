-- A receipt should say what it is a receipt for. The description was only on
-- the intake record until now, which meant the marketplace could show a value
-- and a category but never the item. Existing rows are backfilled from the
-- intake they were sealed from; anything unmatched keeps a neutral placeholder
-- rather than blocking the migration.
ALTER TABLE "custody_receipt" ADD COLUMN "item_description" TEXT;

UPDATE "custody_receipt" AS r
SET "item_description" = i."item_description"
FROM "intake_record" AS i
WHERE i."sealed_hash" = r."intake_record_hash";

UPDATE "custody_receipt" SET "item_description" = 'Item on record' WHERE "item_description" IS NULL;

ALTER TABLE "custody_receipt" ALTER COLUMN "item_description" SET NOT NULL;
