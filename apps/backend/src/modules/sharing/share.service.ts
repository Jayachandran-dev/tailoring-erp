// Share-token service for customer-facing order links.
//
// Tokens live in the PLATFORM schema (not per-tenant) so the unauthenticated
// public route can look them up without an X-Tenant-Id header. The token
// itself carries the tenant lookup (schemaName) so a successful lookup tells
// us which tenant Prisma client to use to fetch the order.
//
// Invariants:
//   * One active (non-revoked) token per orderId. Calling `getOrCreate` on an
//     order that already has an active token returns the existing one.
//   * Tokens are 32 bytes of randomBytes, base64url-encoded (~43 chars).
//   * Tokens are never reused once revoked.

import { randomBytes } from 'crypto';
import { platformDb } from '../../db/platformClient';

function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export interface ShareTokenView {
  token: string;
  createdAt: Date;
  lastViewedAt: Date | null;
  viewCount: number;
}

export async function getOrCreate(
  tenantId: string,
  schemaName: string,
  orderId: string,
): Promise<ShareTokenView> {
  const existing = await platformDb.orderShareToken.findFirst({
    where: { tenantId, orderId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return {
      token: existing.token,
      createdAt: existing.createdAt,
      lastViewedAt: existing.lastViewedAt,
      viewCount: existing.viewCount,
    };
  }
  // Retry on the (vanishingly rare) token-collision UniqueConstraint.
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const created = await platformDb.orderShareToken.create({
        data: { tenantId, schemaName, orderId, token: newToken() },
      });
      return {
        token: created.token,
        createdAt: created.createdAt,
        lastViewedAt: null,
        viewCount: 0,
      };
    } catch (err) {
      if (attempt === 2) throw err;
    }
  }
  throw new Error('Failed to mint share token');
}

export async function getActive(
  tenantId: string,
  orderId: string,
): Promise<ShareTokenView | null> {
  const row = await platformDb.orderShareToken.findFirst({
    where: { tenantId, orderId, revokedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  if (!row) return null;
  return {
    token: row.token,
    createdAt: row.createdAt,
    lastViewedAt: row.lastViewedAt,
    viewCount: row.viewCount,
  };
}

export async function revoke(tenantId: string, orderId: string): Promise<number> {
  const res = await platformDb.orderShareToken.updateMany({
    where: { tenantId, orderId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

export interface ResolvedToken {
  tenantId: string;
  schemaName: string;
  orderId: string;
}

/**
 * Resolve a public token to its tenant + order. Returns null when the token
 * doesn't exist OR has been revoked. Also records the view (best-effort,
 * non-blocking, errors swallowed).
 */
export async function resolveForView(token: string): Promise<ResolvedToken | null> {
  const row = await platformDb.orderShareToken.findUnique({ where: { token } });
  if (!row || row.revokedAt) return null;

  // Fire-and-forget view counter. Don't await — never block the page render.
  platformDb.orderShareToken
    .update({
      where: { id: row.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    })
    .catch(() => {
      /* view counter failures are non-fatal */
    });

  return { tenantId: row.tenantId, schemaName: row.schemaName, orderId: row.orderId };
}
