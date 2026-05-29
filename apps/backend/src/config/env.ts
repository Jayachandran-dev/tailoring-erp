import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  // Where the user-visible SPA is reachable. Used to build public links
  // (customer order share, invoice URL). Defaults to CORS_ORIGIN for dev.
  PUBLIC_APP_URL: z.string().optional(),

  DATABASE_URL: z.string().url(),
  DATABASE_BASE_URL: z.string().url(),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 chars'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_LENGTH: z.coerce.number().int().min(4).max(8).default(6),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
  SMS_PROVIDER: z.enum(['mock', 'twilio', 'msg91', 'fast2sms']).default('mock'),
  OTP_EXPOSE_IN_RESPONSE: z
    .string()
    .transform((v) => v === 'true')
    .default('false'),

  // Sentry (all optional - omit DSN to disable error reporting entirely).
  SENTRY_DSN: z.string().url().optional(),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = typeof env;
