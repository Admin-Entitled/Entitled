CREATE TABLE IF NOT EXISTS __SCHEMA__.migration_journal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  migration_id TEXT NOT NULL UNIQUE,
  source_fingerprint TEXT NOT NULL,
  source_table TEXT NOT NULL,
  target_table TEXT NOT NULL,
  planned_count INTEGER NOT NULL DEFAULT 0,
  inserted_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  conflict_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  checkpoint TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'running',
  error_summary TEXT
);

CREATE INDEX IF NOT EXISTS order_mapping_migration_journal_migration_id_idx
  ON __SCHEMA__.migration_journal (migration_id);
