CREATE SCHEMA IF NOT EXISTS __SCHEMA__;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS __SCHEMA__.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shopify_order_id TEXT NOT NULL UNIQUE,
  shopify_order_name TEXT NOT NULL,
  shopify_order_number TEXT,
  order_date TIMESTAMPTZ NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  shopify_fulfillment_status TEXT,
  cancellation_status TEXT,
  shopify_updated_at TIMESTAMPTZ,
  last_shopify_sync_at TIMESTAMPTZ,
  latest_fulfillment JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS order_mapping_orders_order_date_idx
  ON __SCHEMA__.orders (order_date DESC);

CREATE INDEX IF NOT EXISTS order_mapping_orders_order_number_idx
  ON __SCHEMA__.orders (shopify_order_number);

CREATE INDEX IF NOT EXISTS order_mapping_orders_customer_name_idx
  ON __SCHEMA__.orders (customer_name);

CREATE INDEX IF NOT EXISTS order_mapping_orders_customer_phone_idx
  ON __SCHEMA__.orders (customer_phone);

CREATE TABLE IF NOT EXISTS __SCHEMA__.shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES __SCHEMA__.orders(id) ON DELETE CASCADE,
  shopify_fulfillment_id TEXT,
  shopify_tracking_number TEXT,
  awb TEXT,
  courier TEXT,
  shiprocket_order_reference TEXT,
  shiprocket_channel_reference TEXT,
  shiprocket_response_id TEXT,
  normalized_status TEXT NOT NULL DEFAULT 'PENDING_TRACKING',
  raw_status TEXT,
  status_source TEXT NOT NULL DEFAULT 'SHOPIFY',
  status_timestamp TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  last_shiprocket_sync_at TIMESTAMPTZ,
  terminal_status BOOLEAN NOT NULL DEFAULT FALSE,
  manual_override BOOLEAN NOT NULL DEFAULT FALSE,
  manual_override_lock BOOLEAN NOT NULL DEFAULT FALSE,
  manual_override_reason TEXT,
  sync_error TEXT,
  latest_provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS order_mapping_shipments_shiprocket_response_id_key
  ON __SCHEMA__.shipments (shiprocket_response_id)
  WHERE shiprocket_response_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS order_mapping_shipments_awb_key
  ON __SCHEMA__.shipments (awb)
  WHERE awb IS NOT NULL AND BTRIM(awb) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS order_mapping_shipments_order_fulfillment_key
  ON __SCHEMA__.shipments (order_id, shopify_fulfillment_id)
  WHERE shopify_fulfillment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS order_mapping_shipments_order_id_idx
  ON __SCHEMA__.shipments (order_id);

CREATE INDEX IF NOT EXISTS order_mapping_shipments_status_idx
  ON __SCHEMA__.shipments (normalized_status);

CREATE INDEX IF NOT EXISTS order_mapping_shipments_source_idx
  ON __SCHEMA__.shipments (status_source);

CREATE INDEX IF NOT EXISTS order_mapping_shipments_sync_idx
  ON __SCHEMA__.shipments (terminal_status, manual_override_lock, last_shiprocket_sync_at);

CREATE INDEX IF NOT EXISTS order_mapping_shipments_status_timestamp_idx
  ON __SCHEMA__.shipments (status_timestamp DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS __SCHEMA__.tracking_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id UUID NOT NULL REFERENCES __SCHEMA__.shipments(id) ON DELETE CASCADE,
  normalized_status TEXT NOT NULL,
  raw_status TEXT,
  event_location TEXT,
  event_timestamp TIMESTAMPTZ,
  source TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipment_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS order_mapping_tracking_events_shipment_idx
  ON __SCHEMA__.tracking_events (shipment_id, event_timestamp DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS __SCHEMA__.status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES __SCHEMA__.orders(id) ON DELETE CASCADE,
  shipment_id UUID REFERENCES __SCHEMA__.shipments(id) ON DELETE CASCADE,
  previous_status TEXT,
  next_status TEXT NOT NULL,
  raw_status TEXT,
  source TEXT NOT NULL,
  effective_at TIMESTAMPTZ,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  remarks TEXT,
  import_batch_id UUID,
  actor TEXT,
  manual_override_lock BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS order_mapping_status_history_shipment_idx
  ON __SCHEMA__.status_history (shipment_id, recorded_at DESC);

CREATE INDEX IF NOT EXISTS order_mapping_status_history_order_idx
  ON __SCHEMA__.status_history (order_id, recorded_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.import_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_hash TEXT NOT NULL UNIQUE,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER NOT NULL DEFAULT 0,
  unmatched_rows INTEGER NOT NULL DEFAULT 0,
  invalid_rows INTEGER NOT NULL DEFAULT 0,
  updated_rows INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'preview',
  error_summary TEXT,
  mapping JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS __SCHEMA__.import_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_batch_id UUID NOT NULL REFERENCES __SCHEMA__.import_batches(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  row_hash TEXT NOT NULL,
  raw_row JSONB NOT NULL,
  matched_order_id UUID REFERENCES __SCHEMA__.orders(id) ON DELETE SET NULL,
  matched_shipment_id UUID REFERENCES __SCHEMA__.shipments(id) ON DELETE SET NULL,
  matching_method TEXT,
  normalized_status TEXT,
  validation_status TEXT NOT NULL DEFAULT 'valid',
  validation_errors JSONB NOT NULL DEFAULT '[]'::jsonb,
  processing_result TEXT,
  status_timestamp TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (import_batch_id, row_hash)
);

CREATE INDEX IF NOT EXISTS order_mapping_import_rows_batch_idx
  ON __SCHEMA__.import_rows (import_batch_id, row_number);

CREATE TABLE IF NOT EXISTS __SCHEMA__.sync_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sync_type TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  processed_count INTEGER NOT NULL DEFAULT 0,
  updated_count INTEGER NOT NULL DEFAULT 0,
  skipped_terminal_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS order_mapping_sync_runs_type_idx
  ON __SCHEMA__.sync_runs (sync_type, started_at DESC);

CREATE TABLE IF NOT EXISTS __SCHEMA__.migration_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key TEXT NOT NULL,
  reason TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
