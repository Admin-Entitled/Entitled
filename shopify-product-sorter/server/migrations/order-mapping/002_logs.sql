CREATE TABLE IF NOT EXISTS __SCHEMA__.network_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  operation TEXT NOT NULL,
  provider TEXT NOT NULL,
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status TEXT NOT NULL,
  status_code INTEGER,
  started_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ NOT NULL,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_summary TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS order_mapping_network_logs_started_idx
  ON __SCHEMA__.network_logs (started_at DESC);

CREATE INDEX IF NOT EXISTS order_mapping_network_logs_operation_idx
  ON __SCHEMA__.network_logs (operation, started_at DESC);
