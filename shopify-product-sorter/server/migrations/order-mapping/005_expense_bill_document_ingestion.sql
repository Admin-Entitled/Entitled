ALTER TABLE __SCHEMA__.expense_bills
  ALTER COLUMN subtotal DROP NOT NULL;

ALTER TABLE __SCHEMA__.expense_bills
  ALTER COLUMN tax DROP NOT NULL;

ALTER TABLE __SCHEMA__.expense_bills
  ADD COLUMN IF NOT EXISTS document_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS expense_bills_document_hash_key
  ON __SCHEMA__.expense_bills(document_hash)
  WHERE document_hash IS NOT NULL;
