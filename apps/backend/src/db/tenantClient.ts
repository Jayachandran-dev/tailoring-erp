// Cached, per-tenant Prisma clients. Each tenant points at its own Postgres schema.
// We append `?schema=<tenant_schema>` to DATABASE_BASE_URL and cache the client.
//
// Rationale: a single Node process keeps one connection pool PER SCHEMA. For an MVP
// this is fine (dozens of tenants). At scale, switch to a shared pool + `SET search_path`
// per query, or use Prisma's $extends + connection pooler (PgBouncer / Prisma Accelerate).

import { PrismaClient } from '../../node_modules/.prisma/tenant-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

const cache = new Map<string, PrismaClient>();

export function getTenantDb(schemaName: string): PrismaClient {
  validateSchemaName(schemaName);

  const cached = cache.get(schemaName);
  if (cached) return cached;

  const url = `${env.DATABASE_BASE_URL}?schema=${encodeURIComponent(schemaName)}`;
  const client = new PrismaClient({
    datasources: { db: { url } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
  cache.set(schemaName, client);
  logger.debug({ schemaName }, 'instantiated tenant prisma client');
  return client;
}

export async function disconnectAllTenants(): Promise<void> {
  await Promise.all([...cache.values()].map((c) => c.$disconnect()));
  cache.clear();
}

// Identifier safety: only allow tenant_<lowercase letters, digits, underscores>
// This is enforced everywhere a schema name is interpolated into raw SQL.
const SCHEMA_RE = /^tenant_[a-z0-9_]{1,40}$/;
export function validateSchemaName(name: string): void {
  if (!SCHEMA_RE.test(name)) {
    throw new Error(`Unsafe tenant schema name: ${name}`);
  }
}
