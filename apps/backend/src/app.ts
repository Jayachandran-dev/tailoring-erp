import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { errorMiddleware } from './middleware/error';
import { auditMiddleware } from './middleware/audit';
import { sentryTagMiddleware, setupSentryErrorHandler } from './observability/sentry';
import { UPLOADS_ROOT } from './utils/uploads';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      // The API serves JSON and static image uploads — never HTML that would
      // execute scripts in a browser. Locking everything down means that even
      // if a response slips through as text/html, it can't bootstrap an XSS.
      // `frame-ancestors 'none'` also blocks click-jacking of any errant HTML.
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          imgSrc: ["'self'", 'data:'],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      // Block iframing the API entirely (defense-in-depth on top of CSP).
      frameguard: { action: 'deny' },
      // Don't leak referrers from API responses (most clients are non-browser
      // anyway, but tighten where we can).
      referrerPolicy: { policy: 'no-referrer' },
      // Allow cross-origin static assets (frontend on :5173 fetching images from :4000).
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));

  // Global, gentle rate limit. Tighter limits live in the OTP service itself.
  app.use(
    rateLimit({
      windowMs: 60_000,
      max: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );

  // Static uploads (customer images, etc.). Files live under apps/backend/uploads/<tenantSchema>/...
  app.use(
    '/uploads',
    express.static(UPLOADS_ROOT, {
      maxAge: '7d',
      fallthrough: true,
      index: false,
    }),
  );

  // Audit log: must come AFTER cookie/body parsing and rate-limiting (so we
  // record the actual served status code) but BEFORE the routes so it can
  // attach the res.on('finish') listener once.
  app.use(auditMiddleware);

  // Tag the per-request Sentry scope with tenantId / userId / role pulled
  // from the JWT (no-op when SENTRY_DSN is unset).
  app.use(sentryTagMiddleware);

  app.use('/api', routes);

  // Sentry's express error handler must run BEFORE our errorMiddleware so it
  // gets a chance to capture the exception. It then calls next(err) and our
  // errorMiddleware sends the JSON response.
  setupSentryErrorHandler(app);
  app.use(errorMiddleware);

  return app;
}
