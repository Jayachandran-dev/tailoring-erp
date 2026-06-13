// Resolves the active tenant for an authenticated request and exposes a per-tenant
// PrismaClient on req.tenantDb. Tenant identity comes from BOTH the JWT (source of truth)
// AND the X-Tenant-Id header; they MUST match — this blocks a stolen-token-cross-tenant attack
// where a token from tenant A is replayed against tenant B with a different header.
//
// NEON search_path strategy:
// Neon ignores ?schema= URL params entirely. We call SET search_path on the
// client explicitly on EVERY request — this is the only reliable way to ensure
// all subsequent queries in this request hit the correct tenant schema.

import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '../../node_modules/.prisma/tenant-client';
import { getTenantDb, assertTenantSchema, setTenantSearchPath } from '../db/tenantClient';
import { platformDb } from '../db/platformClient';
import { forbidden, unauthorized } from '../utils/errors';

declare module 'express-serve-static-core' {
  interface Request {
    tenantDb?: PrismaClient;
    tenantId?: string;
    tenantSchema?: string;
  }
}

export async function tenantContext(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.auth) return next(unauthorized());

    const headerTenant = (req.header('x-tenant-id') || '').trim();
    if (!headerTenant) return next(forbidden('Missing X-Tenant-Id header'));
    if (headerTenant !== req.auth.tenantId) {
      return next(forbidden('Tenant mismatch between token and X-Tenant-Id'));
    }

    // Re-confirm tenant still exists and is active.
    const tenant = await platformDb.tenant.findUnique({ where: { id: req.auth.tenantId } });
    if (!tenant) return next(forbidden('Tenant not found'));
    if (tenant.status !== 'ACTIVE') return next(forbidden(`Tenant is ${tenant.status}`));
    if (tenant.schemaName !== req.auth.schemaName) {
      return next(forbidden('Tenant schema mismatch'));
    }

    req.tenantId = tenant.id;
    req.tenantSchema = tenant.schemaName;
    const db = getTenantDb(tenant.schemaName);

    // CRITICAL for Neon: SET search_path on EVERY request before any query runs.
    // Neon does not persist search_path between requests — connections are pooled
    // and search_path resets to 'public' on each pool checkout. Without this,
    // model queries (order.count, customer.findMany etc.) hit public.* and fail.
    await setTenantSearchPath(db, tenant.schemaName);

    // First-time schema verification (cached after first success).
    await assertTenantSchema(db, tenant.schemaName);

    req.tenantDb = db;
    next();
  } catch (err) {
    next(err);
  }
}
