import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { platformDb } from '../../db/platformClient';

const router = Router();

// Returns the authenticated user's tenant + profile (inside tenant schema).
router.get('/me', requireAuth, tenantContext, async (req, res, next) => {
  try {
    const tenant = await platformDb.tenant.findUnique({ where: { id: req.tenantId! } });
    const user = await req.tenantDb!.tenantUser.findUnique({
      where: { platformUserId: req.auth!.sub },
    });
    res.json({
      data: {
        tenant: tenant && {
          id: tenant.id,
          name: tenant.name,
          slug: tenant.slug,
          status: tenant.status,
        },
        user,
        auth: { role: req.auth!.role, mobile: req.auth!.mobile },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
