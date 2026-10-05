import test, { before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from 'pg';
import { createApp } from '../src/app.js';

const databaseUrl = process.env.TEST_DATABASE_URL;
const integration = databaseUrl ? {} : { skip: 'Set TEST_DATABASE_URL to an isolated database after running npm run migrate' };
const phones = new Set();
let pool;
let server;
let baseUrl;

const valid = (phone, overrides = {}) => ({
  name: 'Shivam',
  age: 28,
  phone,
  city: 'Pune',
  preferredTypes: ['Polos', 'T-Shirts'],
  preferredBrand: 'Ralph Lauren',
  marketingConsent: true,
  ...overrides,
});

test('health and subscriber failures return generic responses without leaking database errors', async () => {
  const failingServer = createApp({ query: async () => { throw new Error('sensitive SQL and connection details'); } }).listen(0);
  await new Promise((resolve, reject) => {
    failingServer.once('listening', resolve);
    failingServer.once('error', reject);
  });
  const url = `http://127.0.0.1:${failingServer.address().port}`;
  try {
    const health = await fetch(`${url}/health`);
    assert.equal(health.status, 503);
    assert.deepEqual(await health.json(), { status: 'error', database: 'unavailable' });

    const response = await fetch(`${url}/api/subscribers`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(valid('9876543210')),
    });
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.equal(body.includes('sensitive SQL'), false);
    assert.equal(body.includes('connection details'), false);
  } finally {
    await new Promise(resolve => failingServer.close(resolve));
  }
});

test('allows the two public origins and requests without Origin, and rejects other origins', async () => {
  const previous = process.env.ALLOWED_ORIGINS;
  process.env.ALLOWED_ORIGINS = 'https://www.entitledclub.com,https://entitledclub.com';
  const testServer = createApp({ query: async () => ({ rows: [] }) }).listen(0);
  await new Promise((resolve, reject) => {
    testServer.once('listening', resolve);
    testServer.once('error', reject);
  });
  const url = `http://127.0.0.1:${testServer.address().port}/health`;
  try {
    for (const origin of ['https://www.entitledclub.com', 'https://entitledclub.com']) {
      const response = await fetch(url, { headers: { origin } });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('access-control-allow-origin'), origin);
    }
    assert.equal((await fetch(url)).status, 200);
    const rejected = await fetch(url, { headers: { origin: 'https://unlisted.example' } });
    assert.equal(rejected.status, 403);
    assert.equal((await rejected.json()).error.code, 'ORIGIN_NOT_ALLOWED');
  } finally {
    if (previous === undefined) delete process.env.ALLOWED_ORIGINS;
    else process.env.ALLOWED_ORIGINS = previous;
    await new Promise(resolve => testServer.close(resolve));
  }
});

test('trusts one Render proxy hop and rate-limits each forwarded client IP separately', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const testServer = createApp({ query: async () => ({ rows: [{ id: 'test-id', created: true }] }) }).listen(0);
  await new Promise((resolve, reject) => {
    testServer.once('listening', resolve);
    testServer.once('error', reject);
  });
  const url = `http://127.0.0.1:${testServer.address().port}/api/subscribers`;
  try {
    assert.equal(createApp({ query: async () => ({ rows: [] }) }).get('trust proxy'), 1);
    const submit = ip => fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(valid('9876543210')),
    });
    const sameIp = await Promise.all(Array.from({ length: 11 }, () => submit('203.0.113.10')));
    assert.deepEqual(sameIp.map(response => response.status), [...Array(10).fill(201), 429]);
    assert.equal((await submit('203.0.113.11')).status, 201);
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousNodeEnv;
    await new Promise(resolve => testServer.close(resolve));
  }
});

async function unusedPhone() {
  for (;;) {
    const phone = `+91${9}${Math.floor(100000000 + Math.random() * 899999999)}`;
    if (phones.has(phone)) continue;
    const existing = await pool.query('SELECT 1 FROM marketing_subscribers WHERE phone = $1', [phone]);
    if (existing.rowCount === 0) {
      phones.add(phone);
      return phone;
    }
  }
}

async function submit(body) {
  return fetch(`${baseUrl}/api/subscribers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

before(async () => {
  if (!databaseUrl) return;
  process.env.ALLOWED_ORIGINS = 'https://www.entitledclub.com,https://entitledclub.com,http://localhost:5173';
  pool = new Pool({ connectionString: databaseUrl });
  const result = await pool.query("SELECT to_regclass('public.marketing_subscribers') AS table_name");
  assert.equal(result.rows[0].table_name, 'marketing_subscribers', 'run npm run migrate against TEST_DATABASE_URL first');
});

beforeEach(async () => {
  if (!pool) return;
  server = createApp(pool).listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (server) await new Promise(resolve => server.close(resolve));
  server = undefined;
});

after(async () => {
  if (pool && phones.size) await pool.query('DELETE FROM marketing_subscribers WHERE phone = ANY($1::text[])', [[...phones]]);
  if (pool) await pool.end();
});

test('health reports the database connected', integration, async () => {
  const response = await fetch(`${baseUrl}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', database: 'connected' });
});

test('creates a subscriber with 201 and returns only id and status', integration, async () => {
  const phone = await unusedPhone();
  const response = await submit(valid(phone, { email: 'Test@Email.com', heardAboutUs: 'Instagram' }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.success, true);
  assert.equal(body.subscriber.status, 'created');
  assert.ok(body.subscriber.id);
  assert.deepEqual(Object.keys(body.subscriber).sort(), ['id', 'status']);
  const row = (await pool.query('SELECT * FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0];
  assert.equal(row.email, 'test@email.com');
  assert.equal(row.heard_about_us, 'Instagram');
  assert.deepEqual(row.preferred_types, ['Polos', 'T-Shirts']);
  assert.equal(row.marketing_consent, true);
});

test('duplicate normalized phone updates the same row atomically and preserves optional values', integration, async () => {
  const phone = await unusedPhone();
  const first = await (await submit(valid(phone, { email: 'keep@example.com', heardAboutUs: 'Instagram' }))).json();
  const original = (await pool.query('SELECT * FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0];
  await new Promise(resolve => setTimeout(resolve, 3));
  const updatedResponse = await submit(valid(phone, {
    name: 'Updated Name',
    email: '  ',
    heardAboutUs: undefined,
  }));
  const updated = await updatedResponse.json();
  assert.equal(updatedResponse.status, 200);
  assert.equal(updated.subscriber.status, 'updated');
  assert.equal(updated.subscriber.id, first.subscriber.id);
  const rows = await pool.query('SELECT * FROM marketing_subscribers WHERE phone = $1', [phone]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].name, 'Updated Name');
  assert.equal(rows.rows[0].email, 'keep@example.com');
  assert.equal(rows.rows[0].heard_about_us, 'Instagram');
  assert.equal(rows.rows[0].created_at.toISOString(), original.created_at.toISOString());
  assert.ok(rows.rows[0].updated_at > original.updated_at);
  assert.ok(rows.rows[0].consented_at > original.consented_at);

  const resubmitted = await submit(valid(phone, { email: 'new@example.com', heardAboutUs: 'Event' }));
  assert.equal(resubmitted.status, 200);
  const final = (await pool.query('SELECT * FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0];
  assert.equal(final.email, 'new@example.com');
  assert.equal(final.heard_about_us, 'Event');
  assert.equal(final.created_at.toISOString(), original.created_at.toISOString());
  assert.ok(final.updated_at > rows.rows[0].updated_at);
  assert.ok(final.consented_at > rows.rows[0].consented_at);
});

test('10 digit, 91 prefix and +91 prefix forms resolve to one subscriber', integration, async () => {
  const digits = String(Math.floor(6000000000 + Math.random() * 3999999999));
  const phone = `+91${digits}`;
  phones.add(phone);
  const one = await submit(valid(digits));
  const two = await submit(valid(`91${digits}`, { name: 'Second submission' }));
  const three = await submit(valid(phone, { name: 'Third submission' }));
  assert.equal(one.status, 201);
  assert.equal(two.status, 200);
  assert.equal(three.status, 200);
  const rows = await pool.query('SELECT id, name FROM marketing_subscribers WHERE phone = $1', [phone]);
  assert.equal(rows.rowCount, 1);
  assert.equal(rows.rows[0].name, 'Third submission');
});

test('concurrent submissions for one phone create one row', integration, async () => {
  const phone = await unusedPhone();
  const responses = await Promise.all([
    submit(valid(phone, { name: 'First concurrent submission' })),
    submit(valid(phone, { name: 'Second concurrent submission' })),
  ]);
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
  const ids = await Promise.all(responses.map(async response => (await response.json()).subscriber.id));
  assert.equal(ids[0], ids[1]);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0].count, 1);
});

test('omitted optional fields create successfully and blank email does not overwrite existing email', integration, async () => {
  const phone = await unusedPhone();
  const response = await submit(valid(phone, { email: '' }));
  assert.equal(response.status, 201);
  assert.equal((await pool.query('SELECT email FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0].email, null);
});

test('rejects invalid payload without writing a row', integration, async () => {
  const phone = await unusedPhone();
  const response = await submit(valid(phone, { marketingConsent: false }));
  assert.equal(response.status, 400);
  assert.equal((await pool.query('SELECT 1 FROM marketing_subscribers WHERE phone = $1', [phone])).rowCount, 0);
  assert.deepEqual((await response.json()).error.fields.marketingConsent, 'Consent is required');
});

test('rejects consent withdrawal on an update without changing the existing subscriber', integration, async () => {
  const phone = await unusedPhone();
  const created = await (await submit(valid(phone))).json();
  const response = await submit(valid(phone, { name: 'Must not update', marketingConsent: false }));
  assert.equal(response.status, 400);
  assert.equal((await pool.query('SELECT name FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0].name, 'Shivam');
  assert.equal(created.subscriber.status, 'created');
});

test('allows different subscribers to share an email address', integration, async () => {
  const email = 'shared@example.com';
  const one = await unusedPhone();
  const two = await unusedPhone();
  assert.equal((await submit(valid(one, { email }))).status, 201);
  assert.equal((await submit(valid(two, { email }))).status, 201);
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM marketing_subscribers WHERE email = $1', [email])).rows[0].count, 2);
});

test('stores SQL-injection-like input as ordinary text', integration, async () => {
  const phone = await unusedPhone();
  const marker = "'); DROP TABLE marketing_subscribers;--";
  const response = await submit(valid(phone, { name: marker }));
  assert.equal(response.status, 201);
  assert.equal((await pool.query('SELECT name FROM marketing_subscribers WHERE phone = $1', [phone])).rows[0].name, marker);
  assert.equal((await pool.query("SELECT to_regclass('public.marketing_subscribers') AS table_name")).rows[0].table_name, 'marketing_subscribers');
});

test('allows configured CORS origins and requests without an Origin header', integration, async () => {
  const allowed = await fetch(`${baseUrl}/health`, { headers: { origin: 'http://localhost:5173' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  const noOrigin = await fetch(`${baseUrl}/health`);
  assert.equal(noOrigin.status, 200);
});

test('does not grant CORS access to an unlisted origin', integration, async () => {
  const response = await fetch(`${baseUrl}/health`, { headers: { origin: 'https://unlisted.example' } });
  assert.equal(response.status, 200);
  assert.equal(response.headers.has('access-control-allow-origin'), false);
});

test('limits submissions to ten per IP in a fresh limiter window', integration, async () => {
  const rateServer = createApp(pool).listen(0);
  await new Promise((resolve, reject) => {
    rateServer.once('listening', resolve);
    rateServer.once('error', reject);
  });
  const rateUrl = `http://127.0.0.1:${rateServer.address().port}/api/subscribers`;
  try {
    const responses = [];
    for (let index = 0; index < 11; index += 1) {
      const phone = await unusedPhone();
      responses.push(await fetch(rateUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(valid(phone)),
      }));
    }
    assert.deepEqual(responses.map(response => response.status), [201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]);
    assert.equal((await responses[10].json()).error.code, 'RATE_LIMITED');
  } finally {
    await new Promise(resolve => rateServer.close(resolve));
  }
});

test('rejects malformed JSON and bodies over 20 KB with safe JSON errors', integration, async () => {
  const malformed = await fetch(`${baseUrl}/api/subscribers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });
  assert.equal(malformed.status, 400);
  assert.equal((await malformed.json()).error.code, 'INVALID_JSON');

  const large = await fetch(`${baseUrl}/api/subscribers`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data: 'x'.repeat(21 * 1024) }),
  });
  assert.equal(large.status, 413);
  assert.equal((await large.json()).error.code, 'PAYLOAD_TOO_LARGE');
});
