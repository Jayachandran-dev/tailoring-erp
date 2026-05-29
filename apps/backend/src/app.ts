import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import routes from './routes';
import { errorMiddleware } from './middleware/error';
import { UPLOADS_ROOT } from './utils/uploads';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
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

  app.use('/api', routes);

  app.use(errorMiddleware);

  return app;
}
