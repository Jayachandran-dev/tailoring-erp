// Owner/Manager team management: list members + pending invites, create new
// invites, revoke pending invites, remove existing members.
//
// All routes require an active session and the X-Tenant-Id header (enforced by
// tenantContext). Mutations additionally require OWNER or MANAGER role.

import { Router, type Request, type Response, type NextFunction } from 'express';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { ownerOrManager } from '../../middleware/role';
import {
  CreateInviteSchema,
  createInvite,
  listTeam,
  revokeInvite,
  removeMember,
} from './staff.service';

const router = Router();

router.use(requireAuth, tenantContext);
// All non-GET requests require OWNER or MANAGER. STAFF can view the team list
// (so they can see who their teammates are) but cannot mutate it.
router.use((req, res, next) =>
  req.method === 'GET' ? next() : ownerOrManager(req, res, next),
);

router.get(
  '/',
  wrap(async (req) => listTeam({ tenantId: req.tenantId! })),
);

router.post(
  '/invites',
  wrap(async (req) =>
    createInvite(CreateInviteSchema.parse(req.body), {
      tenantId: req.tenantId!,
      actorUserId: req.auth!.sub,
    }),
  ),
);

router.delete(
  '/invites/:id',
  wrap(async (req) => revokeInvite(String(req.params.id), { tenantId: req.tenantId! })),
);

router.delete(
  '/members/:userId',
  wrap(async (req) =>
    removeMember(String(req.params.userId), {
      tenantId: req.tenantId!,
      actorUserId: req.auth!.sub,
      actorRole: req.auth!.role,
    }),
  ),
);

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
