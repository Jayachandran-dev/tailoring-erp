import type { Request, Response, NextFunction } from 'express';
import { verifyJwt, type JwtPayload } from '../utils/jwt';
import { unauthorized } from '../utils/errors';
import { touchSession } from '../modules/session/session.service';
import { AUTH_COOKIE } from '../utils/authCookie';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtPayload;
  }
}

// Prefer the httpOnly cookie (XSS-safe). Fall back to Authorization: Bearer
// so curl, tests, and any future server-to-server callers keep working.
function extractToken(req: Request): string | null {
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[AUTH_COOKIE];
  if (cookieToken) return cookieToken;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();
  return null;
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = extractToken(req);
  if (!token) {
    return next(unauthorized('Not signed in'));
  }

  let payload: JwtPayload;
  try {
    payload = verifyJwt(token);
  } catch {
    return next(unauthorized('Invalid or expired session'));
  }

  // Server-side session check. This is what makes "max 2 devices" + logout actually work.
  const check = await touchSession(payload.sid);
  if (!check.ok) {
    const msg =
      check.reason === 'REVOKED'
        ? 'Signed out on this device (logged in from another device)'
        : check.reason === 'EXPIRED'
        ? 'Session expired. Please sign in again.'
        : 'Session not found. Please sign in again.';
    return next(unauthorized(msg));
  }

  req.auth = payload;
  next();
}
