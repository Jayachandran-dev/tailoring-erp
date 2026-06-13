// Cached, per-tenant Prisma clients scoped to a Postgres schema.
//
// NEON COMPATIBILITY:
// Neon ignores ?schema= URL params and Prisma $extends $allModels middleware
// does not fire for raw queries. The only reliable way to set search_path on
// Neon is to run SET search_path TO "schema" as an explicit SQL statement
// on the raw PrismaClient before every operation.
//
// This module exposes:
//   getTenantDb(schema)     → the raw PrismaClient for that schema
//   setTenantSearchPath(db, schema) → runs SET search_path on that client
//   assertTenantSchema(db, schema) → verifies search_path is correct

import { PrismaClient } from '../../node_modules/.prisma/tenant-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

const cache = new Map<string, PrismaClient>();

function buildTenantUrl(schemaName: string): string {
  const base = env.DATABASE_BASE_URL;
  try {
    const url = new URL(base);
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return base.replace(/([?&])schema=[^&]*/g, '').replace(/[?&]$/, '');
  }
}

export function getTenantDb(schemaName: string): PrismaClient {
  validateSchemaName(schemaName);
  const cached = cache.get(schemaName);
  if (cached) return cached;

  const url = buildTenantUrl(schemaName);
  const client = new PrismaClient({
    datasources: { db: { url } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  cache.set(schemaName, client);
  logger.debug({ schemaName }, 'instantiated tenant prisma client');
  return client;
}

/**
 * Explicitly sets the Postgres search_path on this client connection.
 * Must be called before any query on Neon — Neon strips startup params
 * so ?schema= in the URL is silently ignored.
 */
export async function setTenantSearchPath(
  db: PrismaClient,
  schemaName: string,
): Promise<void> {
  validateSchemaName(schemaName);
  await db.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);
}

const verifiedSchemas = new Set<string>();
export async function assertTenantSchema(
  db: PrismaClient,
  expected: string,
): Promise<void> {
  validateSchemaName(expected);
  // Always SET search_path first — never assume it's already set on Neon
  await db.$executeRawUnsafe(`SET search_path TO "${expected}"`);

  if (verifiedSchemas.has(expected)) return;

  const rows = await db.$queryRawUnsafe<{ schema: string }[]>(
    `SELECT current_schema() AS schema`,
  );
  const actual = rows[0]?.schema;
  if (actual !== expected) {
    throw new Error(
      `Tenant DB schema mismatch: expected '${expected}' but is on '${actual ?? '(none)'}'`,
    );
  }
  verifiedSchemas.add(expected);
  logger.info({ schemaName: expected }, 'tenant schema connection verified');
}

export async function disconnectAllTenants(): Promise<void> {
  await Promise.all([...cache.values()].map((c) => c.$disconnect()));
  cache.clear();
  verifiedSchemas.clear();
}

const SCHEMA_RE = /^tenant_[a-z0-9_]{1,40}$/;
export function validateSchemaName(name: string): void {
  if (!SCHEMA_RE.test(name)) {
    throw new Error(`Unsafe tenant schema name: ${name}`);
  }
}
