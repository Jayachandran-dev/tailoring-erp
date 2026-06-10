// Sentry wiring for the backend.
//
// Why a dedicated module:
//   * `Sentry.init` should run exactly once, before any other module loads
//     instrumentation. We export an `initSentry()` that is called from
//     `server.ts` as the very first line.
//   * If `SENTRY_DSN` isn't set we make every export a no-op so local dev,
//     CI, and self-hosters without Sentry pay zero cost and never see
//     "Sentry not configured" warnings.
//   * We tag every event with the actor's `tenantId`, `userId`, and `role`
//     so on-call can filter by tenant in the Sentry UI without us having to
//     parse audit_logs.

import type { NextFunction, Request, Response } from 'express';
import * as Sentry from '@sentry/node';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AUTH_COOKIE } from '../utils/authCookie';

const DSN = process.env.SENTRY_DSN?.trim();
const ENABLED = Boolean(DSN);

export function isSentryEnabled(): boolean {
  return ENABLED;
}

export function initSentry(): void {
  if (!ENABLED) return;
  Sentry.init({
    dsn: DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    // Conservative defaults: errors only. Traces opt-in via env so we don't
    // ship surprise bandwidth bills.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? '0'),
    // 4xx are usually user errors (bad input, no auth) — don't page on those.
    // We still capture 5xx via the express error handler below.
    sendDefaultPii: false,
  });
}

// Decode the JWT WITHOUT verifying. Tagging is informational; the real
// security check happens in requireAuth. If decode fails for any reason we
// just leave the scope untagged.
function extractActor(req: Request):
  | { sub: string; tenantId: string; role: string }
  | null {
  try {
    const cookieToken =
      (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE] ?? null;
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const token = cookieToken || bearer;
    if (!token) return null;
    const decoded = jwt.decode(token);
    if (!decoded || typeof decoded !== 'object') return null;
    const sub = (decoded as Record<string, unknown>).sub;
    const tenantId = (decoded as Record<string, unknown>).tenantId;
    const role = (decoded as Record<string, unknown>).role;
    if (typeof sub !== 'string' || typeof tenantId !== 'string' || typeof role !== 'string') {
      return null;
    }
    return { sub, tenantId, role };
  } catch {
    return null;
  }
}

/**
 * Middleware that tags the per-request Sentry isolation scope with the actor.
 * Mount globally (after cookieParser, before routes). No-op when DSN unset.
 */
export function sentryTagMiddleware(req: Request, _res: Response, next: NextFunction): void {
  if (!ENABLED) return next();
  const actor = extractActor(req);
  const scope = Sentry.getIsolationScope();
  if (actor) {
    scope.setUser({ id: actor.sub });
    scope.setTag('tenantId', actor.tenantId);
    scope.setTag('role', actor.role);
  }
  scope.setTag('route', `${req.method} ${req.path}`);
  next();
}

/**
 * Wire the v8 express error handler onto the app. Must be called AFTER all
 * routes are mounted but BEFORE your own errorMiddleware. No-op when DSN unset.
 */
export function setupSentryErrorHandler(app: Parameters<typeof Sentry.setupExpressErrorHandler>[0]): void {
  if (!ENABLED) return;
  Sentry.setupExpressErrorHandler(app);
}
