import type { Request, Response, NextFunction } from 'express';
import { verifyJwt, type JwtPayload } from '../utils/jwt';
import { unauthorized } from '../utils/errors';
import { touchSession } from '../modules/session/session.service';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: JwtPayload;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(unauthorized('Missing bearer token'));
  }
  const token = header.slice('Bearer '.length).trim();

  let payload: JwtPayload;
  try {
    payload = verifyJwt(token);
  } catch {
    return next(unauthorized('Invalid or expired token'));
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
