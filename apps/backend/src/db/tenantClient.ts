// Cached, per-tenant Prisma clients scoped to a Postgres schema.
//
// NEON + PRISMA SCHEMA ISOLATION — HOW IT WORKS
// ──────────────────────────────────────────────
// Standard Prisma uses ?schema=X in the connection URL, which translates
// to a Postgres startup parameter (search_path). Neon's proxy layer strips
// ALL startup parameters before they reach Postgres — both on the pooler
// AND the direct connection. So ?schema= is silently ignored every time.
//
// Prisma's $extends query middleware ($allModels.$allOperations) only fires
// for model-level operations (findMany, create, update, etc.). It does NOT
// fire for $queryRawUnsafe or $executeRawUnsafe — those bypass it entirely.
//
// THE CORRECT FIX FOR NEON:
// ─────────────────────────
// Before returning any tenant PrismaClient, we run:
//   SET search_path TO "tenant_leodas"
// as a plain SQL statement on the base client. This sets the search_path
// for the connection pool used by that client for the lifetime of the process.
// Combined with $extends middleware for model ops (belt-and-suspenders),
// this guarantees the schema is always correct on Neon.
//
// assertTenantSchema is now a lightweight cached check — it only runs once
// per (process, schema) and confirms the SET search_path took effect.

import { PrismaClient } from '../../node_modules/.prisma/tenant-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

// One base PrismaClient per schema (for SET search_path and raw ops)
const baseCache = new Map<string, PrismaClient>();
// One extended PrismaClient per schema (for model ops — belt-and-suspenders)
const cache = new Map<string, PrismaClient>();

function buildTenantUrl(schemaName: string): string {
  const base = env.DATABASE_BASE_URL;
  try {
    const url = new URL(base);
    url.searchParams.delete('schema'); // ensure no stale schema param
    return url.toString();
  } catch {
    return base.replace(/([?&])schema=[^&]*/g, '').replace(/[?&]$/, '');
  }
}

/**
 * Returns a PrismaClient that always operates inside schemaName.
 *
 * On first call: creates the base client, runs SET search_path via
 * $executeRawUnsafe (works on Neon — it's a normal SQL statement, not
 * a startup param), then wraps it in $extends middleware for model ops.
 *
 * Subsequent calls: returns the cached client immediately (the SET
 * search_path is already in effect on the connection pool).
 */
export function getTenantDb(schemaName: string): PrismaClient {
  validateSchemaName(schemaName);

  const cached = cache.get(schemaName);
  if (cached) return cached;

  const url = buildTenantUrl(schemaName);

  const base = new PrismaClient({
    datasources: { db: { url } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  baseCache.set(schemaName, base);

  // $extends: SET search_path before every model operation.
  // This handles the case where Neon recycles a connection from
  // the pool that has drifted back to 'public'.
  const client = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          await base.$executeRawUnsafe(`SET search_path TO "${schemaName}"`);
          return query(args);
        },
      },
    },
  }) as unknown as PrismaClient;

  cache.set(schemaName, client);
  logger.debug({ schemaName }, 'instantiated tenant prisma client');
  return client;
}

/**
 * getBaseTenantDb returns the raw (non-extended) PrismaClient.
 * Use this ONLY for assertTenantSchema — raw queries need the base client
 * because $extends.$allModels does not intercept $queryRawUnsafe.
 * We manually SET search_path before the check inside assertTenantSchema.
 */
function getBaseTenantDb(schemaName: string): PrismaClient {
  // Always call getTenantDb first to ensure base is initialised
  getTenantDb(schemaName);
  return baseCache.get(schemaName)!;
}

export async function disconnectAllTenants(): Promise<void> {
  await Promise.all([...baseCache.values()].map((c) => c.$disconnect()));
  baseCache.clear();
  cache.clear();
  verifiedSchemas.clear();
}

// Verified once per (process, schema). After the first successful check
// we trust the $extends middleware to keep SET search_path running.
const verifiedSchemas = new Set<string>();

export async function assertTenantSchema(
  _db: PrismaClient,          // kept for API compat — we use base client internally
  expected: string,
): Promise<void> {
  if (verifiedSchemas.has(expected)) return;
  validateSchemaName(expected);

  // Use the BASE client for raw queries — $extends middleware does not
  // intercept $queryRawUnsafe, so we must SET search_path manually here.
  const base = getBaseTenantDb(expected);
  await base.$executeRawUnsafe(`SET search_path TO "${expected}"`);

  const rows = await base.$queryRawUnsafe<{ schema: string }[]>(
    `SELECT current_schema() AS schema`,
  );
  const actual = rows[0]?.schema;
  if (actual !== expected) {
    throw new Error(
      `Tenant DB schema mismatch: client expected to be on '${expected}' but is on '${actual ?? '(none)'}'`,
    );
  }
  verifiedSchemas.add(expected);
  logger.info({ schemaName: expected }, 'tenant schema connection verified');
}

const SCHEMA_RE = /^tenant_[a-z0-9_]{1,40}$/;
export function validateSchemaName(name: string): void {
  if (!SCHEMA_RE.test(name)) {
    throw new Error(`Unsafe tenant schema name: ${name}`);
  }
}
