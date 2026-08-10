CREATE TABLE IF NOT EXISTS __SCHEMA__.order_expense_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('SHIPROCKET')),
  source_file_name TEXT NOT NULL,
  source_file_hash TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  row_count INTEGER NOT NULL DEFAULT 0,
  financial_row_count INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  unmatched_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  duplicate_count INTEGER NOT NULL DEFAULT 0,
  gross_debits NUMERIC(15, 2) NOT NULL DEFAULT 0,
  gross_credits NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'preview',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_expense_imports_provider_uploaded_idx
  ON __SCHEMA__.order_expense_imports (provider, uploaded_at DESC);

CREATE INDEX IF NOT EXISTS order_expense_imports_file_hash_idx
  ON __SCHEMA__.order_expense_imports (source_file_hash);

CREATE TABLE IF NOT EXISTS __SCHEMA__.order_expense_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('SHIPROCKET')),
  matched_order_id UUID REFERENCES __SCHEMA__.orders(id) ON DELETE SET NULL,
  matched_shipment_id UUID REFERENCES __SCHEMA__.shipments(id) ON DELETE SET NULL,
  shopify_order_id TEXT,
  shopify_order_number TEXT,
  shiprocket_order_id TEXT,
  shiprocket_shipment_id TEXT,
  channel_order_id TEXT,
  awb TEXT,
  transaction_id TEXT,
  transaction_identity TEXT NOT NULL,
  transaction_date TIMESTAMPTZ,
  charge_type TEXT NOT NULL,
  description TEXT,
  transaction_type TEXT,
  debit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(15, 2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'INR',
  courier TEXT,
  source_file_hash TEXT NOT NULL,
  source_file_name TEXT NOT NULL,
  source_row_number INTEGER NOT NULL,
  source_reference TEXT,
  match_status TEXT NOT NULL,
  match_method TEXT,
  matched_value TEXT,
  import_id UUID REFERENCES __SCHEMA__.order_expense_imports(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT order_expense_transactions_provider_identity_key UNIQUE (provider, transaction_identity)
);

CREATE INDEX IF NOT EXISTS order_expense_transactions_order_idx
  ON __SCHEMA__.order_expense_transactions (matched_order_id, transaction_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS order_expense_transactions_shipment_idx
  ON __SCHEMA__.order_expense_transactions (matched_shipment_id, transaction_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS order_expense_transactions_awb_idx
  ON __SCHEMA__.order_expense_transactions (awb);

CREATE INDEX IF NOT EXISTS order_expense_transactions_shiprocket_order_idx
  ON __SCHEMA__.order_expense_transactions (shiprocket_order_id);

CREATE INDEX IF NOT EXISTS order_expense_transactions_shiprocket_shipment_idx
  ON __SCHEMA__.order_expense_transactions (shiprocket_shipment_id);

CREATE INDEX IF NOT EXISTS order_expense_transactions_transaction_id_idx
  ON __SCHEMA__.order_expense_transactions (transaction_id);

CREATE INDEX IF NOT EXISTS order_expense_transactions_transaction_date_idx
  ON __SCHEMA__.order_expense_transactions (transaction_date DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS order_expense_transactions_import_idx
  ON __SCHEMA__.order_expense_transactions (import_id, source_row_number);

CREATE INDEX IF NOT EXISTS order_expense_transactions_match_status_idx
  ON __SCHEMA__.order_expense_transactions (match_status);
