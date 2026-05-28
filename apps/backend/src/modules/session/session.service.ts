// Server-side session management.
//
// Why server-side at all when we use JWTs?
//   - JWTs are stateless, so they cannot be revoked or counted.
//   - We need to (a) enforce a max-2-devices-per-mobile policy and (b) allow logout.
//
// Design:
//   - Every successful login creates a Session row with `expiresAt = now + SESSION_TTL`.
//   - The JWT carries the session id (`sid`) plus enough context to skip a DB lookup
//     on most reads — but auth middleware DOES validate the session row on every
//     request, which is what makes revocation actually work.
//   - When a user logs in and they already have N (default 2) active sessions, we
//     revoke the OLDEST ones so the new device wins (LRU eviction).

import { platformDb } from '../../db/platformClient';

const MAX_ACTIVE_SESSIONS_PER_USER = 2;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export interface CreateSessionInput {
  userId: string;
  tenantId: string;
  userAgent?: string | null;
  ip?: string | null;
}

export interface CreatedSession {
  id: string;
  expiresAt: Date;
}

export async function createSession(input: CreateSessionInput): Promise<CreatedSession> {
  const now = new Date();

  // Evict oldest active sessions if we're at/over the cap. We use `lastSeenAt`
  // as the LRU key so an idle session loses to an active one.
  const active = await platformDb.session.findMany({
    where: {
      userId: input.userId,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    orderBy: { lastSeenAt: 'asc' },
  });

  const overBy = active.length - (MAX_ACTIVE_SESSIONS_PER_USER - 1);
  if (overBy > 0) {
    const toRevoke = active.slice(0, overBy).map((s) => s.id);
    await platformDb.session.updateMany({
      where: { id: { in: toRevoke } },
      data: { revokedAt: now },
    });
  }

  const session = await platformDb.session.create({
    data: {
      userId: input.userId,
      tenantId: input.tenantId,
      userAgent: input.userAgent ?? null,
      deviceLabel: deviceLabelFromUserAgent(input.userAgent),
      ip: input.ip ?? null,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    },
  });
  return { id: session.id, expiresAt: session.expiresAt };
}

export interface SessionCheck {
  ok: boolean;
  reason?: 'NOT_FOUND' | 'REVOKED' | 'EXPIRED';
}

export async function touchSession(sessionId: string): Promise<SessionCheck> {
  const session = await platformDb.session.findUnique({ where: { id: sessionId } });
  if (!session) return { ok: false, reason: 'NOT_FOUND' };
  if (session.revokedAt) return { ok: false, reason: 'REVOKED' };
  if (session.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'EXPIRED' };

  // Throttle lastSeenAt writes to once a minute to avoid one UPDATE per request.
  const stale = Date.now() - session.lastSeenAt.getTime() > 60_000;
  if (stale) {
    await platformDb.session.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }
  return { ok: true };
}

export async function revokeSession(sessionId: string): Promise<void> {
  await platformDb.session.updateMany({
    where: { id: sessionId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

function deviceLabelFromUserAgent(ua?: string | null): string | null {
  if (!ua) return null;
  // Tiny heuristic — good enough for a device list UI later.
  if (/Android/i.test(ua)) return 'Android';
  if (/iPhone|iPad|iOS/i.test(ua)) return 'iOS';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Mac OS X/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return ua.slice(0, 60);
}
