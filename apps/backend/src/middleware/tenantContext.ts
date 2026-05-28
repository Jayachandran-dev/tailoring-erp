// Resolves the active tenant for an authenticated request and exposes a per-tenant
// PrismaClient on req.tenantDb. Tenant identity comes from BOTH the JWT (source of truth)
// AND the X-Tenant-Id header; they MUST match — this blocks a stolen-token-cross-tenant attack
// where a token from tenant A is replayed against tenant B with a different header.

import type { Request, Response, NextFunction } from 'express';
import type { PrismaClient } from '../../node_modules/.prisma/tenant-client';
import { getTenantDb } from '../db/tenantClient';
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

    // Re-confirm tenant still exists and is active (cheap; could be cached later).
    const tenant = await platformDb.tenant.findUnique({ where: { id: req.auth.tenantId } });
    if (!tenant) return next(forbidden('Tenant not found'));
    if (tenant.status !== 'ACTIVE') return next(forbidden(`Tenant is ${tenant.status}`));
    if (tenant.schemaName !== req.auth.schemaName) {
      return next(forbidden('Tenant schema mismatch'));
    }

    req.tenantId = tenant.id;
    req.tenantSchema = tenant.schemaName;
    req.tenantDb = getTenantDb(tenant.schemaName);
    next();
  } catch (err) {
    next(err);
  }
}
