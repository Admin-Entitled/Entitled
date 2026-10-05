import { Pool } from 'pg';
import { createApp } from './app.js';

const requiredProductionEnv = ['DATABASE_URL', 'PORT', 'ALLOWED_ORIGINS', 'NODE_ENV'];
const productionOrigins = ['https://www.entitledclub.com', 'https://entitledclub.com'];
const port = Number(process.env.PORT || 4000);

function hasValidProductionConfig() {
  if (!['development', 'test', 'production'].includes(process.env.NODE_ENV)) return false;
  if (process.env.NODE_ENV !== 'production') return true;

  const origins = (process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean);
  let databaseUrl;
  try {
    databaseUrl = new URL(process.env.DATABASE_URL);
  } catch {
    return false;
  }

  return requiredProductionEnv.every(name => Boolean(process.env[name]))
    && Number.isInteger(port) && port > 0 && port <= 65535
    && origins.length === productionOrigins.length
    && productionOrigins.every(origin => origins.includes(origin))
    && new Set(origins).size === productionOrigins.length
    && ['postgres:', 'postgresql:'].includes(databaseUrl.protocol)
    && ['require', 'verify-full'].includes(databaseUrl.searchParams.get('sslmode'))
    && databaseUrl.hostname.includes('-pooler.')
    && databaseUrl.hostname.endsWith('.neon.tech');
}

if (!process.env.DATABASE_URL || !hasValidProductionConfig()) {
  console.error('Invalid server configuration; check required environment variables and the pooled Neon DATABASE_URL.');
  process.exit(1);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.on('error', () => console.error('Unexpected database connection error'));

const server = createApp(pool).listen(port, () => console.log(`API listening on port ${port}`));
server.once('error', async error => {
  console.error(`HTTP server failed to start (${error.code || 'unknown error'})`);
  await pool.end();
  process.exitCode = 1;
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => server.close(async () => {
    await pool.end();
  }));
}
