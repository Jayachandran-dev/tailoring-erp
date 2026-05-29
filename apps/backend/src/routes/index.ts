import { Router } from 'express';
import authRouter from '../modules/auth/auth.controller';
import invitePublicRouter from '../modules/staff/invite.public.controller';
import publicSharingRouter from '../modules/sharing/public.controller';
import tenantRouter from '../modules/tenant/tenant.controller';
import staffRouter from '../modules/staff/staff.controller';
import customersRouter from '../modules/customers/customers.controller';
import dashboardRouter from '../modules/dashboard/dashboard.controller';
import designsRouter from '../modules/designs/designs.controller';
import designCategoriesRouter from '../modules/designs/designCategories.controller';
import ordersRouter from '../modules/orders/orders.controller';
import upiAccountsRouter from '../modules/settings/upi.controller';
import businessSettingsRouter from '../modules/settings/business.controller';

const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// Public, token-gated customer-facing endpoints. No auth, no X-Tenant-Id.
router.use('/public', publicSharingRouter);

// /auth/invite/* is public (no session). Mounted BEFORE the auth router so the
// invite preview/start/verify endpoints aren't shadowed by /auth/:something.
router.use('/auth/invite', invitePublicRouter);
router.use('/auth', authRouter);
router.use('/tenant/staff', staffRouter);
router.use('/tenant', tenantRouter);
router.use('/customers', customersRouter);
router.use('/dashboard', dashboardRouter);
router.use('/design-categories', designCategoriesRouter);
router.use('/designs', designsRouter);
router.use('/orders', ordersRouter);
router.use('/settings/upi-accounts', upiAccountsRouter);
router.use('/settings/business', businessSettingsRouter);

export default router;
