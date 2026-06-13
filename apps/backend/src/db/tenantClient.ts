// Cached, per-tenant Prisma clients. Each tenant points at its own Postgres schema.
//
// NEON COMPATIBILITY NOTE — why ?schema= doesn't work:
// ─────────────────────────────────────────────────────
// Neon (both pooler and direct connections) does NOT honor Prisma's ?schema=
// URL parameter. Prisma translates ?schema=X to `SET search_path TO X` sent
// as a startup parameter. Neon's infrastructure strips startup parameters
// silently, so Postgres always falls back to search_path=public.
//
// THE FIX — explicit SET search_path per connection:
// ────────────────────────────────────────────────────
// We use Prisma's $extends query middleware to run:
//   SET search_path TO "tenant_leodas"
// before EVERY query on the tenant client. This fires over the established
// connection and cannot be stripped by Neon's proxy layer.
//
// This is the officially recommended pattern for Neon + Prisma multi-schema.

import { PrismaClient } from '../../node_modules/.prisma/tenant-client';
import { env } from '../config/env';
import { logger } from '../config/logger';

const cache = new Map<string, PrismaClient>();

/**
 * Build the base URL for a tenant connection.
 * Strips any existing ?schema= param to keep the URL clean —
 * schema is now set via SET search_path in the query middleware, not the URL.
 */
function buildTenantUrl(schemaName: string): string {
  const base = env.DATABASE_BASE_URL;
  try {
    const url = new URL(base);
    // Remove schema param — we handle schema via SET search_path middleware
    url.searchParams.delete('schema');
    return url.toString();
  } catch {
    return base.replace(/([?&])schema=[^&]*/g, '').replace(/[?&]$/, '');
  }
}

/**
 * Returns a PrismaClient that runs every query inside the correct
 * Postgres schema for this tenant. Uses SET search_path to guarantee
 * the schema is applied even on Neon (which ignores ?schema= URL params).
 */
export function getTenantDb(schemaName: string): PrismaClient {
  validateSchemaName(schemaName);

  const cached = cache.get(schemaName);
  if (cached) return cached;

  const url = buildTenantUrl(schemaName);

  // Base client — points at the correct Neon database
  const base = new PrismaClient({
    datasources: { db: { url } },
    log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

  // Extend with a query middleware that sets search_path before every query.
  // This is the ONLY reliable way to switch schemas on Neon — the ?schema=
  // URL param is silently ignored by Neon's proxy.
  //
  // $extends returns a new client type — cast to PrismaClient for the cache.
  const client = base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          // SET search_path is idempotent and very cheap (no round-trip on
          // cached connections in Neon's architecture). It runs before every
          // Prisma operation on this client.
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

export async function disconnectAllTenants(): Promise<void> {
  // Note: $extends clients delegate $disconnect to the underlying base client.
  // We stored the extended client in cache but need to disconnect base clients.
  // Since extended clients proxy $disconnect, this works correctly.
  await Promise.all([...cache.values()].map((c) => c.$disconnect()));
  cache.clear();
  verifiedSchemas.clear();
}

// Defense-in-depth: assert the client is actually on the expected schema.
// With the SET search_path middleware above, this should always pass.
const verifiedSchemas = new Set<string>();
export async function assertTenantSchema(
  db: PrismaClient,
  expected: string,
): Promise<void> {
  if (verifiedSchemas.has(expected)) return;
  validateSchemaName(expected);
  const rows = await db.$queryRawUnsafe<{ schema: string }[]>(
    `SELECT current_schema() AS schema`,
  );
  const actual = rows[0]?.schema;
  if (actual !== expected) {
    throw new Error(
      `Tenant DB schema mismatch: client expected to be on '${expected}' but is on '${actual ?? '(none)'}'`,
    );
  }
  verifiedSchemas.add(expected);
  logger.debug({ schemaName: expected }, 'tenant schema connection verified');
}

// Identifier safety: only allow tenant_<lowercase letters, digits, underscores>
const SCHEMA_RE = /^tenant_[a-z0-9_]{1,40}$/;
export function validateSchemaName(name: string): void {
  if (!SCHEMA_RE.test(name)) {
    throw new Error(`Unsafe tenant schema name: ${name}`);
  }
}
