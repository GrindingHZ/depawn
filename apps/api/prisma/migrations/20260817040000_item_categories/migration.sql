-- The vault will take more than bullion. Adding values only: every existing
-- row is already BULLION, so nothing needs backfilling. Postgres forbids
-- using a value added inside a transaction within that same transaction,
-- which is why nothing here writes a row.
ALTER TYPE "item_category" ADD VALUE IF NOT EXISTS 'WATCH';
ALTER TYPE "item_category" ADD VALUE IF NOT EXISTS 'JEWELLERY';
ALTER TYPE "item_category" ADD VALUE IF NOT EXISTS 'COLLECTIBLE';
ALTER TYPE "item_category" ADD VALUE IF NOT EXISTS 'ART';
