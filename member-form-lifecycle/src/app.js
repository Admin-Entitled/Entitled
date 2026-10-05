import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { validateSubmission } from './validation.js';

const upsert = `
  INSERT INTO marketing_subscribers (
    name, age, phone, city, preferred_types, preferred_brand,
    email, heard_about_us, marketing_consent, consented_at
  ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
  ON CONFLICT (phone) DO UPDATE SET
    name = EXCLUDED.name,
    age = EXCLUDED.age,
    city = EXCLUDED.city,
    preferred_types = EXCLUDED.preferred_types,
    preferred_brand = EXCLUDED.preferred_brand,
    email = COALESCE(EXCLUDED.email, marketing_subscribers.email),
    heard_about_us = COALESCE(EXCLUDED.heard_about_us, marketing_subscribers.heard_about_us),
    marketing_consent = EXCLUDED.marketing_consent,
    consented_at = now(),
    updated_at = now()
  RETURNING id, (xmax = 0) AS created
`;

export function createApp(pool) {
  const app = express();
  const allowedOrigins = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map(origin => origin.trim()).filter(Boolean));
  const originAllowed = origin => !origin || allowedOrigins.has(origin);

  // Render terminates TLS and forwards the original client IP through one proxy hop.
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);

  app.use(helmet());
  app.use((req, res, next) => {
    if (!originAllowed(req.get('origin'))) {
      return res.status(403).json({ success: false, error: { code: 'ORIGIN_NOT_ALLOWED', message: 'Origin not allowed' } });
    }
    next();
  });
  app.use(cors({ origin: (origin, callback) => callback(null, originAllowed(origin)) }));
  app.use(express.json({ limit: '20kb' }));

  app.get('/health', async (req, res) => {
    try {
      await pool.query('SELECT 1');
      res.json({ status: 'ok', database: 'connected' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable' });
    }
  });

  // ponytail: in-memory limits are per process; use a shared store if running multiple instances.
  const submissionLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message: 'Too many submissions. Try again later.' },
    }),
  });

  app.post('/api/subscribers', submissionLimit, async (req, res) => {
    const { value, fields } = validateSubmission(req.body);
    if (Object.keys(fields).length) {
      return res.status(400).json({
        success: false,
        error: { code: 'VALIDATION_ERROR', message: 'Invalid submission', fields },
      });
    }

    const result = await pool.query(upsert, [
      value.name,
      value.age,
      value.phone,
      value.city,
      value.preferredTypes,
      value.preferredBrand,
      value.email ?? null,
      value.heardAboutUs ?? null,
      value.marketingConsent,
    ]);
    const { id, created } = result.rows[0];
    res.status(created ? 201 : 200).json({
      success: true,
      subscriber: { id, status: created ? 'created' : 'updated' },
    });
  });

  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    if (error.type === 'entity.too.large') {
      return res.status(413).json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' } });
    }
    if (error.type === 'entity.parse.failed') {
      return res.status(400).json({ success: false, error: { code: 'INVALID_JSON', message: 'Request body must be valid JSON' } });
    }
    return res.status(500).json({ success: false, error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
  });

  return app;
}
