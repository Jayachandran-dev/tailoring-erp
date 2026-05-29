// Per-route rate limiters.
//
// The global limiter in app.ts is intentionally generous (120/min). This file
// holds tighter, purpose-built limiters that get mounted on sensitive routes
// (currently: the OTP / auth lifecycle).

import rateLimit from 'express-rate-limit';
import type { Request } from 'express';

// Combine caller IP with a per-route identifier (e.g. the mobile number being
// targeted). This way a single IP can't burn another user's quota and a single
// mobile can't be drained by a rotating IP pool.
function keyFor(req: Request): string {
  const ip = req.ip ?? 'unknown';
  const mobile =
    typeof (req.body as { mobile?: unknown } | undefined)?.mobile === 'string'
      ? ((req.body as { mobile: string }).mobile).trim().toLowerCase()
      : '';
  return mobile ? `${ip}|${mobile}` : ip;
}

// 5 attempts / 15 min per (ip, mobile). Covers both "start" and "verify"
// endpoints for signup + login so an attacker can't bypass by alternating
// routes.
export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: keyFor,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
