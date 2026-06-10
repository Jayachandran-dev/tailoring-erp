import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Express } from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';

// IMPORTANT: mock the session service BEFORE importing requireAuth so the
// middleware picks up the mock instead of hitting the real DB.
vi.mock('../../src/modules/session/session.service', () => ({
  touchSession: vi.fn(),
}));

import { requireAuth } from '../../src/middleware/auth';
import { signJwt, type JwtPayload } from '../../src/utils/jwt';
import { AUTH_COOKIE } from '../../src/utils/authCookie';
import { touchSession } from '../../src/modules/session/session.service';
import { errorMiddleware } from '../../src/middleware/error';

const mockedTouchSession = vi.mocked(touchSession);

function buildApp(): Express {
  const app = express();
  app.use(cookieParser());
  app.get('/protected', requireAuth, (req, res) => {
    res.json({ ok: true, auth: req.auth });
  });
  app.use(errorMiddleware);
  return app;
}

function payload(role: 'OWNER' | 'MANAGER' | 'STAFF' = 'OWNER'): JwtPayload {
  return {
    sub: 'user_1',
    sid: 'sess_1',
    mobile: '+10000000001',
    tenantId: 'tenant_1',
    schemaName: 'tenant_acme',
    role,
  };
}

beforeEach(() => {
  mockedTouchSession.mockReset();
});

describe('requireAuth', () => {
  it('rejects requests with no cookie or bearer header', async () => {
    const res = await request(buildApp()).get('/protected');
    expect(res.status).toBe(401);
    expect(res.body.error?.code).toBe('UNAUTHORIZED');
    expect(mockedTouchSession).not.toHaveBeenCalled();
  });

  it('rejects requests with an invalid JWT', async () => {
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${AUTH_COOKIE}=not-a-real-jwt`);
    expect(res.status).toBe(401);
    expect(res.body.error?.message).toMatch(/invalid|expired/i);
    expect(mockedTouchSession).not.toHaveBeenCalled();
  });

  it('rejects valid JWT whose session was revoked', async () => {
    mockedTouchSession.mockResolvedValueOnce({ ok: false, reason: 'REVOKED' });
    const token = signJwt(payload());
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${AUTH_COOKIE}=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error?.message).toMatch(/another device|signed out/i);
  });

  it('rejects valid JWT whose session expired', async () => {
    mockedTouchSession.mockResolvedValueOnce({ ok: false, reason: 'EXPIRED' });
    const token = signJwt(payload());
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${AUTH_COOKIE}=${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error?.message).toMatch(/expired/i);
  });

  it('accepts valid JWT with active session via httpOnly cookie', async () => {
    mockedTouchSession.mockResolvedValueOnce({ ok: true });
    const token = signJwt(payload('STAFF'));
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${AUTH_COOKIE}=${token}`);
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.auth.sub).toBe('user_1');
    expect(res.body.auth.role).toBe('STAFF');
    expect(mockedTouchSession).toHaveBeenCalledWith('sess_1');
  });

  it('accepts valid JWT via Authorization: Bearer header', async () => {
    mockedTouchSession.mockResolvedValueOnce({ ok: true });
    const token = signJwt(payload('OWNER'));
    const res = await request(buildApp())
      .get('/protected')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.role).toBe('OWNER');
  });

  it('prefers cookie over Authorization header when both are present', async () => {
    mockedTouchSession.mockResolvedValueOnce({ ok: true });
    const cookieToken = signJwt(payload('OWNER'));
    const headerToken = signJwt(payload('STAFF'));
    const res = await request(buildApp())
      .get('/protected')
      .set('Cookie', `${AUTH_COOKIE}=${cookieToken}`)
      .set('Authorization', `Bearer ${headerToken}`);
    expect(res.status).toBe(200);
    expect(res.body.auth.role).toBe('OWNER');
  });
});
