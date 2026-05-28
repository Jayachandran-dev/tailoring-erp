import { z } from 'zod';
import { platformDb } from '../../db/platformClient';
import { provisionTenantSchema } from '../../db/tenantProvisioner';
import { getTenantDb } from '../../db/tenantClient';
import { issueOtp, verifyOtp } from '../otp/otp.service';
import { createSession, revokeSession } from '../session/session.service';
import { normalizeMobile } from '../../utils/mobile';
import { signJwt } from '../../utils/jwt';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { logger } from '../../config/logger';

export interface RequestContext {
  userAgent?: string | null;
  ip?: string | null;
}

// ---------- Schemas ----------
export const StartSignupSchema = z.object({
  mobile: z.string().min(8),
  shopName: z.string().min(2).max(80),
  ownerName: z.string().min(2).max(80),
});

export const StartLoginSchema = z.object({
  mobile: z.string().min(8),
});

export const VerifySignupSchema = z.object({
  requestId: z.string().min(1),
  mobile: z.string().min(8),
  code: z.string().min(4),
  shopName: z.string().min(2).max(80),
  ownerName: z.string().min(2).max(80),
});

export const VerifyLoginSchema = z.object({
  requestId: z.string().min(1),
  mobile: z.string().min(8),
  code: z.string().min(4),
});

// ---------- Signup ----------
export async function startSignup(input: z.infer<typeof StartSignupSchema>) {
  const mobile = normalizeMobile(input.mobile);

  // Enforce 1 mobile = 1 shop. If this mobile already owns a tenant, send them to login.
  const existing = await platformDb.platformUser.findUnique({
    where: { mobile },
    include: { memberships: { take: 1 } },
  });
  if (existing && existing.memberships.length > 0) {
    throw conflict('This mobile is already registered with a shop. Please log in instead.');
  }

  // We don't pre-create the tenant. We only issue an OTP. The tenant is created
  // ON verification — that way an abandoned signup doesn't leave dead tenants.
  const otp = await issueOtp(mobile, 'SIGNUP');
  return { mobile, ...otp };
}

export async function verifySignup(
  input: z.infer<typeof VerifySignupSchema>,
  ctx: RequestContext = {},
) {
  const mobile = normalizeMobile(input.mobile);
  await verifyOtp({
    requestId: input.requestId,
    mobile,
    purpose: 'SIGNUP',
    code: input.code,
  });

  const slug = slugify(input.shopName);
  const schemaName = `tenant_${slug}`;

  const existingTenant = await platformDb.tenant.findUnique({ where: { slug } });
  if (existingTenant) {
    throw conflict(
      `A shop with the name "${input.shopName}" already exists. Pick another name.`,
    );
  }

  // Provision schema FIRST (idempotent CREATE IF NOT EXISTS), then record the tenant.
  await provisionTenantSchema(schemaName);

  const result = await platformDb.$transaction(async (tx) => {
    const tenant = await tx.tenant.create({
      data: {
        name: input.shopName,
        slug,
        schemaName,
        ownerMobile: mobile,
        status: 'ACTIVE',
      },
    });
    const user = await tx.platformUser.upsert({
      where: { mobile },
      update: { displayName: input.ownerName },
      create: { mobile, displayName: input.ownerName },
    });
    await tx.tenantMembership.create({
      data: { tenantId: tenant.id, userId: user.id, role: 'OWNER' },
    });
    return { tenant, user };
  });

  // Seed the tenant DB with the owner user row (denormalized for joins inside the tenant).
  const tdb = getTenantDb(schemaName);
  await tdb.tenantUser.upsert({
    where: { platformUserId: result.user.id },
    update: { mobile, displayName: input.ownerName },
    create: {
      platformUserId: result.user.id,
      mobile,
      displayName: input.ownerName,
      role: 'OWNER',
    },
  });

  const session = await createSession({
    userId: result.user.id,
    tenantId: result.tenant.id,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });

  const token = signJwt({
    sub: result.user.id,
    sid: session.id,
    mobile,
    tenantId: result.tenant.id,
    schemaName: result.tenant.schemaName,
    role: 'OWNER',
  });

  logger.info({ tenantId: result.tenant.id, slug, sid: session.id }, 'tenant provisioned via signup');

  return {
    token,
    expiresAt: session.expiresAt,
    tenant: {
      id: result.tenant.id,
      name: result.tenant.name,
      slug: result.tenant.slug,
    },
    user: { id: result.user.id, mobile, displayName: input.ownerName },
  };
}

// ---------- Login ----------
// One mobile = one shop. We resolve the tenant from the mobile alone.
async function resolveSingleMembership(mobile: string) {
  const user = await platformDb.platformUser.findUnique({
    where: { mobile },
    include: { memberships: { include: { tenant: true } } },
  });
  if (!user || user.memberships.length === 0) {
    throw notFound('No shop is registered with this mobile. Please sign up first.');
  }
  // Guard for the (currently impossible) multi-membership case so we fail loudly
  // if we ever relax the 1:1 rule without updating login.
  if (user.memberships.length > 1) {
    throw badRequest('Multiple shops are registered with this mobile. Contact support.');
  }
  return { user, membership: user.memberships[0] };
}

export async function startLogin(input: z.infer<typeof StartLoginSchema>) {
  const mobile = normalizeMobile(input.mobile);
  const { membership } = await resolveSingleMembership(mobile);
  const otp = await issueOtp(mobile, 'LOGIN');
  return { mobile, tenantId: membership.tenant.id, ...otp };
}

export async function verifyLogin(
  input: z.infer<typeof VerifyLoginSchema>,
  ctx: RequestContext = {},
) {
  const mobile = normalizeMobile(input.mobile);
  await verifyOtp({
    requestId: input.requestId,
    mobile,
    purpose: 'LOGIN',
    code: input.code,
  });

  const { user, membership } = await resolveSingleMembership(mobile);
  const tenant = membership.tenant;
  if (tenant.status !== 'ACTIVE') throw badRequest(`Tenant is ${tenant.status}`);

  const session = await createSession({
    userId: user.id,
    tenantId: tenant.id,
    userAgent: ctx.userAgent,
    ip: ctx.ip,
  });

  const token = signJwt({
    sub: user.id,
    sid: session.id,
    mobile,
    tenantId: tenant.id,
    schemaName: tenant.schemaName,
    role: membership.role,
  });

  return {
    token,
    expiresAt: session.expiresAt,
    tenant: { id: tenant.id, name: tenant.name, slug: tenant.slug },
    user: {
      id: user.id,
      mobile,
      displayName: user.displayName,
    },
  };
}

export async function logout(sessionId: string) {
  await revokeSession(sessionId);
}

// ---------- helpers ----------
function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  if (!s) throw badRequest('Shop name must contain alphanumeric characters');
  return s;
}
