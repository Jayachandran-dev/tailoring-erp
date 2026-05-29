// Role-based access control middleware.
//
// `requireAuth` puts the JWT payload on `req.auth`, including the user's role
// (OWNER / MANAGER / STAFF). This guard rejects requests whose role isn't in
// the allow-list. Always chain it AFTER `requireAuth`.
//
// Usage:
//   router.delete('/:id', requireRole('OWNER', 'MANAGER'), handler);

import type { Request, Response, NextFunction } from 'express';
import { forbidden, unauthorized } from '../utils/errors';

export type Role = 'OWNER' | 'MANAGER' | 'STAFF';

export function requireRole(...allowed: Role[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) return next(unauthorized('Not authenticated'));
    if (!allowed.includes(req.auth.role)) {
      return next(forbidden(`This action requires one of: ${allowed.join(', ')}`));
    }
    next();
  };
}

// Convenience aliases for the two policies used across the app.
//
//   ownerOnly    — destructive / configuration changes (delete payments, etc.)
//   ownerOrAdmin — settings & catalog management; OWNER + MANAGER
//
// Staff can perform day-to-day operations (customers, orders, payments) without
// an explicit guard since they share the default `requireAuth` chain.
export const ownerOnly = requireRole('OWNER');
export const ownerOrManager = requireRole('OWNER', 'MANAGER');
