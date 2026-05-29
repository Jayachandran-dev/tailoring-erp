// Append-only audit log middleware. Records every state-changing HTTP request
// (POST / PUT / PATCH / DELETE) and every /auth/* request regardless of verb,
// so the operator can answer "who did what, when" without trawling app logs.
//
// Properties:
//   * Best-effort: insertion failures are logged but never bubble up to the
//     client. We must never break a real request because the audit table is
//     down.
//   * Async: writes happen on `res.on('finish')`, off the response path, so
//     they add zero latency to the user-visible round trip.
//   * Privacy: we DO NOT capture request or response bodies (they may contain
//     OTPs, mobile numbers in plain text we don't want duplicated, image
//     bytes, etc.). Only method/path/status/actor are recorded.
//   * Path: query string is stripped to avoid persisting tokens that
//     occasionally show up as URL params.
//   * UA: truncated to 255 chars.

import type { Request, Response, NextFunction } from 'express';
import { platformDb } from '../db/platformClient';
import { logger } from '../config/logger';

const AUDITED_VERBS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const UA_MAX = 255;
const PATH_MAX = 512;

function shouldAudit(req: Request): boolean {
  if (req.method === 'OPTIONS') return false;
  if (req.path === '/api/health' || req.path === '/health') return false;
  if (AUDITED_VERBS.has(req.method)) return true;
  // Always audit auth surface (signup/login start, /me, etc.) even on GET so we
  // can spot reconnaissance / credential-stuffing patterns.
  return req.path.startsWith('/api/auth') || req.path.startsWith('/auth');
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!shouldAudit(req)) return next();

  const startedAt = Date.now();

  res.on('finish', () => {
    const durationMs = Date.now() - startedAt;
    // Strip query string + cap length to keep the column predictable.
    const path = (req.originalUrl.split('?')[0] || req.path).slice(0, PATH_MAX);
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      null;
    const userAgent = (req.headers['user-agent'] || '').toString().slice(0, UA_MAX) || null;

    // `req.auth` is set by requireAuth (may be undefined on public routes).
    // `res.locals.errorCode` is set by errorMiddleware when an AppError fires.
    const auth = req.auth;
    const errorCode = (res.locals?.errorCode as string | undefined) ?? null;

    // Fire-and-forget. Never await on the response path.
    platformDb.auditLog
      .create({
        data: {
          tenantId: auth?.tenantId ?? null,
          userId: auth?.sub ?? null,
          role: auth?.role ?? null,
          method: req.method,
          path,
          status: res.statusCode,
          durationMs,
          ip,
          userAgent,
          errorCode,
        },
      })
      .catch((err) => {
        // Audit failures must not impact request handling, but they ARE worth
        // alerting on — log loudly so the operator notices.
        logger.error({ err, path, method: req.method }, 'audit log insert failed');
      });
  });

  next();
}
