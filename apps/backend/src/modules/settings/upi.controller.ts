// UPI account settings — per-tenant CRUD + summary.
//
// Used by the Payment Settings page in the frontend. The shop registers one or
// more UPI handles (GPay/PhonePe/etc.), can mark one as the "default" (it shows
// first in the payment dialog), and the order-detail PaymentForm renders a UPI
// deep-link QR for the customer to scan.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { ownerOrManager } from '../../middleware/role';
import { badRequest, notFound } from '../../utils/errors';

const router = Router();
router.use(requireAuth, tenantContext);
// Reads are open to any authenticated user; mutations require OWNER or MANAGER.
router.use((req, res, next) => (req.method === 'GET' ? next() : ownerOrManager(req, res, next)));

// UPI VPA shape: <handle>@<provider>. Keep validation forgiving but sane.
const VPA_RE = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,64}$/;

const CreateSchema = z.object({
  label:     z.string().trim().min(1).max(60),
  upiId:     z.string().trim().toLowerCase().regex(VPA_RE, 'Invalid UPI id'),
  payeeName: z.string().trim().max(80).optional().nullable(),
  isDefault: z.boolean().optional(),
  isActive:  z.boolean().optional(),
  notes:     z.string().trim().max(200).optional().nullable(),
});
const UpdateSchema = CreateSchema.partial();

router.get('/', async (req, res, next) => {
  try {
    const items = await req.tenantDb!.upiAccount.findMany({
      orderBy: [{ isDefault: 'desc' }, { isActive: 'desc' }, { label: 'asc' }],
    });
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

// Summary: collected total + transaction count per UPI account (lifetime + 30d).
router.get('/summary', async (req, res, next) => {
  try {
    const db = req.tenantDb!;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const accounts = await db.upiAccount.findMany({
      orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
    });
    const [lifetime, recent] = await Promise.all([
      db.orderPayment.groupBy({
        by: ['upiAccountId'],
        where: { upiAccountId: { not: null }, amountCents: { gt: 0 } },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
      db.orderPayment.groupBy({
        by: ['upiAccountId'],
        where: {
          upiAccountId: { not: null },
          amountCents: { gt: 0 },
          paidAt: { gte: thirtyDaysAgo },
        },
        _sum: { amountCents: true },
        _count: { _all: true },
      }),
    ]);
    const lifetimeMap = new Map(
      lifetime.map((r) => [r.upiAccountId!, { cents: r._sum.amountCents ?? 0, count: r._count._all }]),
    );
    const recentMap = new Map(
      recent.map((r) => [r.upiAccountId!, { cents: r._sum.amountCents ?? 0, count: r._count._all }]),
    );
    const data = accounts.map((a) => ({
      account: a,
      lifetime: lifetimeMap.get(a.id) ?? { cents: 0, count: 0 },
      last30d:  recentMap.get(a.id)   ?? { cents: 0, count: 0 },
    }));
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = CreateSchema.parse(req.body);
    // Ensure a single default. If this row is default → unset others.
    const created = await req.tenantDb!.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.upiAccount.updateMany({ data: { isDefault: false } });
      }
      // If this is the first account, make it default automatically.
      const count = await tx.upiAccount.count();
      const row = await tx.upiAccount.create({
        data: {
          label:     input.label,
          upiId:     input.upiId,
          payeeName: input.payeeName ?? null,
          isDefault: input.isDefault ?? count === 0,
          isActive:  input.isActive ?? true,
          notes:     input.notes ?? null,
        },
      });
      return row;
    });
    res.status(201).json({ data: created });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return next(badRequest('That UPI id is already registered'));
    }
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.upiAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('UPI account not found');
    const input = UpdateSchema.parse(req.body);
    const updated = await req.tenantDb!.$transaction(async (tx) => {
      if (input.isDefault) {
        await tx.upiAccount.updateMany({
          where: { id: { not: req.params.id } },
          data: { isDefault: false },
        });
      }
      return tx.upiAccount.update({ where: { id: req.params.id }, data: input });
    });
    res.json({ data: updated });
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      return next(badRequest('That UPI id is already registered'));
    }
    next(err);
  }
});

// Convenience: set as default in one click.
router.post('/:id/default', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.upiAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('UPI account not found');
    const updated = await req.tenantDb!.$transaction(async (tx) => {
      await tx.upiAccount.updateMany({ data: { isDefault: false } });
      return tx.upiAccount.update({
        where: { id: req.params.id },
        data: { isDefault: true, isActive: true },
      });
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.upiAccount.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('UPI account not found');
    await req.tenantDb!.upiAccount.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
