import { describe, it, expect, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { requireRole, ownerOnly, ownerOrManager } from '../../src/middleware/role';
import { AppError } from '../../src/utils/errors';
import type { JwtPayload } from '../../src/utils/jwt';

function makeReq(auth?: JwtPayload): Request {
  return { auth } as unknown as Request;
}

function fakeNext() {
  const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
  return next as typeof next & { mock: { calls: unknown[][] } };
}

function authPayload(role: 'OWNER' | 'MANAGER' | 'STAFF'): JwtPayload {
  return {
    sub: 'user_1',
    sid: 'sess_1',
    mobile: '+10000000001',
    tenantId: 'tenant_1',
    schemaName: 'tenant_acme',
    role,
  };
}

describe('requireRole', () => {
  it('rejects unauthenticated requests with 401', () => {
    const next = fakeNext();
    requireRole('OWNER')(makeReq(), {} as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(401);
    expect(err.code).toBe('UNAUTHORIZED');
  });

  it('rejects role not in the allow-list with 403', () => {
    const next = fakeNext();
    requireRole('OWNER')(makeReq(authPayload('STAFF')), {} as Response, next);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
    expect(err.message).toContain('OWNER');
  });

  it('allows requests whose role matches', () => {
    const next = fakeNext();
    requireRole('OWNER', 'MANAGER')(makeReq(authPayload('MANAGER')), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('ownerOnly', () => {
  it('blocks MANAGER', () => {
    const next = fakeNext();
    ownerOnly(makeReq(authPayload('MANAGER')), {} as Response, next);
    expect((next.mock.calls[0]![0] as AppError).status).toBe(403);
  });

  it('blocks STAFF', () => {
    const next = fakeNext();
    ownerOnly(makeReq(authPayload('STAFF')), {} as Response, next);
    expect((next.mock.calls[0]![0] as AppError).status).toBe(403);
  });

  it('allows OWNER', () => {
    const next = fakeNext();
    ownerOnly(makeReq(authPayload('OWNER')), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });
});

describe('ownerOrManager', () => {
  it('allows OWNER', () => {
    const next = fakeNext();
    ownerOrManager(makeReq(authPayload('OWNER')), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('allows MANAGER', () => {
    const next = fakeNext();
    ownerOrManager(makeReq(authPayload('MANAGER')), {} as Response, next);
    expect(next).toHaveBeenCalledWith();
  });

  it('blocks STAFF', () => {
    const next = fakeNext();
    ownerOrManager(makeReq(authPayload('STAFF')), {} as Response, next);
    const err = next.mock.calls[0]![0] as AppError;
    expect(err.status).toBe(403);
    expect(err.code).toBe('FORBIDDEN');
  });
});
