-- CreateEnum
CREATE TYPE "funds_hold_status" AS ENUM ('HELD', 'RELEASED', 'REFUNDED');

-- CreateTable
CREATE TABLE "funds_hold" (
    "id" TEXT NOT NULL,
    "account_id" TEXT NOT NULL,
    "minor_units" BIGINT NOT NULL,
    "currency" TEXT NOT NULL,
    "status" "funds_hold_status" NOT NULL,
    "hold_transaction_id" TEXT NOT NULL,
    "settled_transaction_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "funds_hold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "funds_hold_account_id_status_idx" ON "funds_hold"("account_id", "status");

-- Second enforcement layer for the balance invariant (docs/03-ledger-and-money.md):
-- a deferred constraint trigger rejects any commit whose transaction does not
-- balance per currency. The domain assertion and the property test are the
-- other two layers.
ALTER TABLE "ledger_entry" ADD CONSTRAINT "ledger_entry_minor_units_positive" CHECK ("minor_units" > 0);

CREATE FUNCTION assert_ledger_transaction_balanced() RETURNS trigger AS $$
DECLARE unbalanced_count integer;
BEGIN
  SELECT COUNT(*) INTO unbalanced_count FROM (
    SELECT currency FROM "ledger_entry" WHERE "transaction_id" = NEW."transaction_id"
    GROUP BY currency
    HAVING SUM(CASE WHEN direction = 'DEBIT' THEN "minor_units" ELSE -"minor_units" END) <> 0
  ) AS unbalanced;
  IF unbalanced_count > 0 THEN
    RAISE EXCEPTION 'ledger transaction % is unbalanced', NEW."transaction_id";
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER ledger_transaction_balanced
AFTER INSERT ON "ledger_entry"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION assert_ledger_transaction_balanced();
