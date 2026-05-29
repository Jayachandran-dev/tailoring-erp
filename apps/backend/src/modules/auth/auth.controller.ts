import { Router, type Request, type Response, type NextFunction } from 'express';
import {
  StartSignupSchema,
  StartLoginSchema,
  VerifySignupSchema,
  VerifyLoginSchema,
  startSignup,
  startLogin,
  verifySignup,
  verifyLogin,
  logout,
  getMe,
} from './auth.service';
import { requireAuth } from '../../middleware/auth';
import { authLimiter } from '../../middleware/rateLimiters';
import { setAuthCookie, clearAuthCookie } from '../../utils/authCookie';

const router = Router();

router.post(
  '/signup/start',
  authLimiter,
  wrap(async (req) => startSignup(StartSignupSchema.parse(req.body))),
);
router.post(
  '/signup/verify',
  authLimiter,
  wrapWithSession(async (req) => verifySignup(VerifySignupSchema.parse(req.body), contextFrom(req))),
);
router.post(
  '/login/start',
  authLimiter,
  wrap(async (req) => startLogin(StartLoginSchema.parse(req.body))),
);
router.post(
  '/login/verify',
  authLimiter,
  wrapWithSession(async (req) => verifyLogin(VerifyLoginSchema.parse(req.body), contextFrom(req))),
);

router.get(
  '/me',
  requireAuth,
  wrap(async (req) => getMe(req.auth!)),
);

router.post('/logout', requireAuth, async (req, res, next) => {
  try {
    await logout(req.auth!.sid);
    clearAuthCookie(res);
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

export default router;

// Wraps a handler that returns { token, ...session }. Token is moved into the
// httpOnly cookie (so JS can't read it) and stripped from the response body.
function wrapWithSession<T extends { token: string }>(handler: (req: Request) => Promise<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req);
      const { token, ...rest } = result;
      setAuthCookie(res, token);
      res.json({ data: rest });
    } catch (err) {
      next(err);
    }
  };
}

function contextFrom(req: Request) {
  return {
    userAgent: req.headers['user-agent'] ?? null,
    ip:
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
      req.ip ||
      null,
  };
}

function wrap<T>(handler: (req: Request) => Promise<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await handler(req);
      res.json({ data: result });
    } catch (err) {
      next(err);
    }
  };
}
