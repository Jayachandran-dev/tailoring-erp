// Staff invite + team management. All operations are scoped to a single tenant
// (the caller's tenant for owner/manager actions; the invite's tenant for the
// public accept flow).
//
// Invariants:
//   * Only OWNER/MANAGER can create or revoke invites or remove members.
//   * An OWNER can never be removed or downgraded via this surface (use the
//     ownership-transfer flow once it exists).
//   * Inviting a mobile that already belongs to this tenant is a 409.
//   * Inviting a mobile that already belongs to ANOTHER tenant is a 409 — the
//     MVP enforces "1 mobile = 1 shop" elsewhere; relaxing that requires more
//     work on login resolution and is out of scope here.
//   * Tokens are 32 bytes of CSPRNG, base64url-encoded. Single-use.
//   * Invites expire after INVITE_TTL_HOURS; revoked/expired invites do not
//     accept any OTP traffic.

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { platformDb } from '../../db/platformClient';
import { getTenantDb } from '../../db/tenantClient';
import { issueOtp, verifyOtp } from '../otp/otp.service';
import { createSession } from '../session/session.service';
import { signJwt } from '../../utils/jwt';
import { normalizeMobile } from '../../utils/mobile';
import { badRequest, conflict, forbidden, notFound } from '../../utils/errors';
import { logger } from '../../config/logger';

const INVITE_TTL_HOURS = 72;

// ---------- Zod schemas ----------
export const CreateInviteSchema = z.object({
  mobile: z.string().min(8),
  role: z.enum(['MANAGER', 'STAFF']),
  displayName: z.string().min(1).max(80).optional(),
});

export const AcceptStartSchema = z.object({
  token: z.string().min(10),
});

export const AcceptVerifySchema = z.object({
  token: z.string().min(10),
  requestId: z.string().min(1),
  code: z.string().min(4),
  displayName: z.string().min(1).max(80).optional(),
});

// ---------- Owner/Manager: create invite ----------
export async function createInvite(
  input: z.infer<typeof CreateInviteSchema>,
  ctx: { tenantId: string; actorUserId: string },
) {
  const mobile = normalizeMobile(input.mobile);

  // Already a member of this tenant?
  const existingUser = await platformDb.platformUser.findUnique({
    where: { mobile },
    include: { memberships: true },
  });
  if (existingUser?.memberships.some((m) => m.tenantId === ctx.tenantId)) {
    throw conflict('This mobile is already a member of your shop.');
  }
  // Belongs to a different shop?
  if (existingUser?.memberships.some((m) => m.tenantId !== ctx.tenantId)) {
    throw conflict('This mobile is already registered with another shop.');
  }
  // Pending invite already?
  const pending = await platformDb.staffInvite.findFirst({
    where: {
      tenantId: ctx.tenantId,
      mobile,
      consumedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending) {
    throw conflict('There is already a pending invite for this mobile. Revoke it first.');
  }

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + INVITE_TTL_HOURS * 60 * 60 * 1000);

  const invite = await platformDb.staffInvite.create({
    data: {
      tenantId: ctx.tenantId,
      mobile,
      role: input.role,
      displayName: input.displayName,
      token,
      invitedByUserId: ctx.actorUserId,
      expiresAt,
    },
  });

  logger.info(
    { tenantId: ctx.tenantId, inviteId: invite.id, mobile, role: input.role },
    'staff invite created',
  );

  return {
    id: invite.id,
    mobile: invite.mobile,
    role: invite.role,
    displayName: invite.displayName,
    token: invite.token, // returned ONCE to the inviter so they can share the link
    expiresAt: invite.expiresAt,
  };
}

// ---------- Owner/Manager: list members + pending invites ----------
export async function listTeam(ctx: { tenantId: string }) {
  const [memberships, invites] = await Promise.all([
    platformDb.tenantMembership.findMany({
      where: { tenantId: ctx.tenantId },
      include: { user: true },
      orderBy: { createdAt: 'asc' },
    }),
    platformDb.staffInvite.findMany({
      where: {
        tenantId: ctx.tenantId,
        consumedAt: null,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      include: { invitedBy: { select: { id: true, mobile: true, displayName: true } } },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  return {
    members: memberships.map((m) => ({
      userId: m.userId,
      mobile: m.user.mobile,
      displayName: m.user.displayName,
      role: m.role,
      joinedAt: m.createdAt,
    })),
    invites: invites.map((i) => ({
      id: i.id,
      mobile: i.mobile,
      role: i.role,
      displayName: i.displayName,
      expiresAt: i.expiresAt,
      createdAt: i.createdAt,
      invitedBy: i.invitedBy,
      // Note: token NOT returned in the list (only at creation time) to keep
      // the link single-recipient. To re-share, the inviter must revoke + recreate.
    })),
  };
}

// ---------- Owner/Manager: revoke a pending invite ----------
export async function revokeInvite(inviteId: string, ctx: { tenantId: string }) {
  const invite = await platformDb.staffInvite.findUnique({ where: { id: inviteId } });
  if (!invite || invite.tenantId !== ctx.tenantId) throw notFound('Invite not found');
  if (invite.consumedAt) throw badRequest('This invite has already been accepted.');
  if (invite.revokedAt) return { ok: true }; // idempotent
  await platformDb.staffInvite.update({
    where: { id: invite.id },
    data: { revokedAt: new Date() },
  });
  logger.info({ tenantId: ctx.tenantId, inviteId }, 'staff invite revoked');
  return { ok: true };
}

// ---------- Owner/Manager: remove a team member ----------
export async function removeMember(
  targetUserId: string,
  ctx: { tenantId: string; actorUserId: string; actorRole: 'OWNER' | 'MANAGER' | 'STAFF' },
) {
  if (targetUserId === ctx.actorUserId) {
    throw badRequest('You cannot remove yourself.');
  }
  const membership = await platformDb.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: ctx.tenantId, userId: targetUserId } },
  });
  if (!membership) throw notFound('Member not found');
  if (membership.role === 'OWNER') {
    throw forbidden('The shop owner cannot be removed here.');
  }
  // Only OWNER can remove a MANAGER; MANAGER can only remove STAFF.
  if (membership.role === 'MANAGER' && ctx.actorRole !== 'OWNER') {
    throw forbidden('Only the owner can remove a manager.');
  }

  const tenant = await platformDb.tenant.findUnique({ where: { id: ctx.tenantId } });
  if (!tenant) throw notFound('Tenant not found');

  await platformDb.$transaction([
    platformDb.tenantMembership.delete({ where: { id: membership.id } }),
    // Revoke all of this user's sessions in this tenant so access stops immediately.
    platformDb.session.updateMany({
      where: { userId: targetUserId, tenantId: ctx.tenantId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);

  // Mirror into the tenant schema (best-effort; the platform side is the source of truth).
  try {
    const tdb = getTenantDb(tenant.schemaName);
    await tdb.tenantUser.deleteMany({ where: { platformUserId: targetUserId } });
  } catch (err) {
    logger.warn({ err, targetUserId }, 'failed to delete TenantUser mirror; platform record removed');
  }

  logger.info({ tenantId: ctx.tenantId, removed: targetUserId }, 'team member removed');
  return { ok: true };
}

// ---------- Public: invite preview (no auth) ----------
async function loadActiveInvite(token: string) {
  const invite = await platformDb.staffInvite.findUnique({
    where: { token },
    include: { tenant: true },
  });
  if (!invite) throw notFound('Invite not found');
  if (invite.revokedAt) throw badRequest('This invite has been revoked.');
  if (invite.consumedAt) throw badRequest('This invite has already been accepted.');
  if (invite.expiresAt.getTime() < Date.now()) throw badRequest('This invite has expired.');
  if (invite.tenant.status !== 'ACTIVE') throw badRequest('This shop is not active.');
  return invite;
}

export async function getInvitePreview(token: string) {
  const invite = await loadActiveInvite(token);
  return {
    tenant: { id: invite.tenant.id, name: invite.tenant.name, slug: invite.tenant.slug },
    mobile: invite.mobile,
    role: invite.role,
    displayName: invite.displayName,
    expiresAt: invite.expiresAt,
  };
}

// ---------- Public: send OTP to the invited mobile ----------
export async function startInviteOtp(token: string) {
  const invite = await loadActiveInvite(token);
  const otp = await issueOtp(invite.mobile, 'INVITE');
  return { mobile: invite.mobile, ...otp };
}

// ---------- Public: verify OTP and create the membership + session ----------
export async function acceptInvite(
  input: z.infer<typeof AcceptVerifySchema>,
  ctx: { userAgent?: string | null; ip?: string | null } = {},
) {
  const invite = await loadActiveInvite(input.token);
  await verifyOtp({
    requestId: input.requestId,
    mobile: invite.mobile,
    purpose: 'INVITE',
    code: input.code,
  });

  // Re-check membership in case something raced (another invite, a concurrent signup).
  const existing = await platformDb.platformUser.findUnique({
    where: { mobile: invite.mobile },
    include: { memberships: true },
  });
  if (existing?.memberships.some((m) => m.tenantId === invite.tenantId)) {
    throw conflict('You are already a member of this shop.');
  }
  if (existing?.memberships.some((m) => m.tenantId !== invite.tenantId)) {
    throw conflict('This mobile is already registered with another shop.');
  }

  const displayName = input.displayName?.trim() || invite.displayName || existing?.displayName || null;

  const result = await platformDb.$transaction(async (tx) => {
    const user = await tx.platformUser.upsert({
      where: { mobile: invite.mobile },
      update: displayName ? { displayName } : {},
      create: { mobile: invite.mobile, displayName },
    });
    await tx.tenantMembership.create({
      data: { tenantId: invite.tenantId, userId: user.id, role: invite.role },
    });
    await tx.staffInvite.update({
      where: { id: invite.id },
      data: { consumedAt: new Date() },
    });
    return { user };
  });

  // Mirror into the tenant schema.
  const tdb = getTenantDb(invite.tenant.schemaName);
  await tdb.tenantUser.upsert({
    where: { platformUserId: result.user.id },
    update: { mobile: invite.mobile, displayName, role: invite.role },
    create: {
      platformUserId: result.user.id,
      mobile: invite.mobile,
      displayName,
      role: invite.role,
    },
  });

  const session = await createSession({
    userId: result.user.id,
    tenantId: invite.tenantId,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });

  const token = signJwt({
    sub: result.user.id,
    sid: session.id,
    mobile: invite.mobile,
    tenantId: invite.tenantId,
    schemaName: invite.tenant.schemaName,
    role: invite.role,
  });

  logger.info(
    { tenantId: invite.tenantId, inviteId: invite.id, userId: result.user.id },
    'staff invite accepted',
  );

  return {
    token,
    expiresAt: session.expiresAt,
    tenant: { id: invite.tenant.id, name: invite.tenant.name, slug: invite.tenant.slug },
    user: { id: result.user.id, mobile: invite.mobile, displayName },
    role: invite.role,
  };
}
