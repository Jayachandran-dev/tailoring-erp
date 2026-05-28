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
} from './auth.service';
import { requireAuth } from '../../middleware/auth';

const router = Router();

router.post('/signup/start', wrap(async (req) => startSignup(StartSignupSchema.parse(req.body))));
router.post(
  '/signup/verify',
  wrap(async (req) => verifySignup(VerifySignupSchema.parse(req.body), contextFrom(req))),
);
router.post('/login/start', wrap(async (req) => startLogin(StartLoginSchema.parse(req.body))));
router.post(
  '/login/verify',
  wrap(async (req) => verifyLogin(VerifyLoginSchema.parse(req.body), contextFrom(req))),
);

router.post(
  '/logout',
  requireAuth,
  wrap(async (req) => {
    await logout(req.auth!.sid);
    return { ok: true };
  }),
);

export default router;

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
