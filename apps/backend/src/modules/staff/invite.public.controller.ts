// Public-facing invite-acceptance endpoints. Mounted at /auth/invite. No session
// required (the recipient may not have a PlatformUser yet). All traffic is
// rate-limited and OTP-gated; the invite token by itself can only ever
// READ-PREVIEW or REQUEST-OTP, never mint a session without also passing the
// OTP.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { authLimiter } from '../../middleware/rateLimiters';
import { setAuthCookie } from '../../utils/authCookie';
import {
  AcceptStartSchema,
  AcceptVerifySchema,
  getInvitePreview,
  startInviteOtp,
  acceptInvite,
} from './staff.service';

const router = Router();

// GET /auth/invite/:token — preview (shop name, mobile, role). Used by the
// invite landing page to show "You've been invited to <Shop> as <Role>".
router.get(
  '/:token',
  authLimiter,
  wrap(async (req) => getInvitePreview(String(req.params.token))),
);

// POST /auth/invite/start { token } — issues an OTP to the invited mobile.
router.post(
  '/start',
  authLimiter,
  wrap(async (req) => {
    const { token } = AcceptStartSchema.parse(req.body);
    return startInviteOtp(token);
  }),
);

// POST /auth/invite/verify { token, requestId, code, displayName? } —
// verifies OTP, creates membership, sets the auth cookie, returns the session.
router.post('/verify', authLimiter, async (req, res, next) => {
  try {
    const result = await acceptInvite(AcceptVerifySchema.parse(req.body), {
      userAgent: req.headers['user-agent'] ?? null,
      ip:
        (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
        req.ip ||
        null,
    });
    const { token, ...rest } = result;
    setAuthCookie(res, token);
    res.json({ data: rest });
  } catch (err) {
    next(err);
  }
});

export default router;

function wrap<T>(handler: (req: Request) => Promise<T>) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({ data: await handler(req) });
    } catch (err) {
      next(err);
    }
  };
}
