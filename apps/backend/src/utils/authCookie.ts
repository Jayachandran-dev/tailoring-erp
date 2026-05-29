// Cookie helpers for the JWT session.
//
// We deliberately put the JWT in an httpOnly cookie instead of localStorage so
// an XSS payload can't read it. CSRF is mitigated by:
//   1. SameSite=lax (default modern protection)
//   2. The tenantContext middleware requires an X-Tenant-Id header to match the
//      JWT — forging a custom header cross-origin requires a CORS preflight,
//      which our backend won't grant to attacker origins.

import type { CookieOptions, Response } from 'express';
import { env } from '../config/env';

export const AUTH_COOKIE = 'terp_sid';

// Convert JWT_EXPIRES_IN (e.g. "7d", "12h", "3600") to milliseconds for the
// cookie's maxAge. Keep this tiny; jsonwebtoken parses the same forms.
function parseDurationMs(input: string): number {
  const m = /^(\d+)\s*(ms|s|m|h|d)?$/i.exec(input.trim());
  if (!m) return 7 * 24 * 60 * 60 * 1000; // sensible default: 7 days
  const n = Number(m[1]);
  const unit = (m[2] ?? 's').toLowerCase();
  switch (unit) {
    case 'ms': return n;
    case 's':  return n * 1000;
    case 'm':  return n * 60_000;
    case 'h':  return n * 3_600_000;
    case 'd':  return n * 86_400_000;
    default:   return n * 1000;
  }
}

function baseCookieOpts(): CookieOptions {
  const isProd = env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure:   isProd,
    path:     '/',
  };
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(AUTH_COOKIE, token, {
    ...baseCookieOpts(),
    maxAge: parseDurationMs(env.JWT_EXPIRES_IN),
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(AUTH_COOKIE, baseCookieOpts());
}
