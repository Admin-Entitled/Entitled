import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const migrationsPath = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

try {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const files = (await readdir(migrationsPath)).filter(file => file.endsWith('.sql')).sort();

  for (const name of files) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const applied = await client.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
      if (applied.rowCount) {
        await client.query('COMMIT');
        continue;
      }
      await client.query(await readFile(join(migrationsPath, name), 'utf8'));
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`Applied ${name}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
} catch {
  console.error('Migration failed; check DATABASE_URL and database connectivity.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
