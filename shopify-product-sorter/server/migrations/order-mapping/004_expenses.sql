CREATE TABLE IF NOT EXISTS __SCHEMA__.expense_bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('META', 'SHIPROCKET', 'SHOPIFY')),
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  billing_month TEXT NOT NULL, -- YYYY-MM
  subtotal NUMERIC(15, 2) NOT NULL,
  tax NUMERIC(15, 2) NOT NULL,
  total NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  document_source TEXT NOT NULL, -- 'MANUAL' | 'API'
  document_url TEXT,
  document_storage_key TEXT,
  source_reference TEXT,
  status TEXT NOT NULL, -- 'AVAILABLE' | 'MISSING_DOCUMENT' | 'FAILED' | 'UNKNOWN'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT expense_bills_provider_invoice_number_key UNIQUE (provider, invoice_number)
);

CREATE INDEX IF NOT EXISTS expense_bills_billing_month_idx ON __SCHEMA__.expense_bills(billing_month);
CREATE INDEX IF NOT EXISTS expense_bills_provider_idx ON __SCHEMA__.expense_bills(provider);
CREATE INDEX IF NOT EXISTS expense_bills_invoice_date_idx ON __SCHEMA__.expense_bills(invoice_date);
CREATE INDEX IF NOT EXISTS expense_bills_source_reference_idx ON __SCHEMA__.expense_bills(source_reference);

CREATE TABLE IF NOT EXISTS __SCHEMA__.provider_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('META', 'SHIPROCKET', 'SHOPIFY')),
  expense_date DATE NOT NULL,
  amount NUMERIC(15, 2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR',
  reference TEXT,
  expense_type TEXT,
  raw_source_reference TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT provider_expenses_provider_raw_source_ref_key UNIQUE (provider, raw_source_reference)
);

CREATE INDEX IF NOT EXISTS provider_expenses_provider_date_idx ON __SCHEMA__.provider_expenses(provider, expense_date);
