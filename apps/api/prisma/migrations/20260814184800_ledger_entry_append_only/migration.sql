-- Deletion of a financial record is an event, not a side effect
-- (docs/09-conventions.md). The ledger is append only; the balance trigger
-- fires on INSERT, so UPDATE and DELETE must be closed off too.
CREATE FUNCTION forbid_ledger_entry_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ledger entries are append only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER ledger_entry_append_only
BEFORE UPDATE OR DELETE ON "ledger_entry"
FOR EACH ROW EXECUTE FUNCTION forbid_ledger_entry_mutation();
