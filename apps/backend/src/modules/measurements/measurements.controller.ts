// Measurements per customer. Mounted under /customers/:customerId/measurements
// AND /measurements/:id for direct update/delete.

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { notFound } from '../../utils/errors';

const router = Router({ mergeParams: true });
router.use(requireAuth, tenantContext);

// Params from this router include the parent route's :customerId (because of
// mergeParams above). The default Router type only sees the local route params,
// so we read through this helper to keep TS happy without sprinkling `as` casts.
function paramsOf(req: { params: Record<string, string | undefined> }) {
  return req.params as { customerId?: string; id?: string };
}

// data is a free-form record of field -> string|number (cm/inches as configured by shop)
const FieldValuesSchema = z.record(z.union([z.string(), z.number()]));

const CreateSchema = z.object({
  garmentType: z.string().trim().min(1).max(40).default('custom'),
  label: z.string().trim().max(120).optional().nullable(),
  data: FieldValuesSchema,
});

const UpdateSchema = CreateSchema.partial();

// GET /customers/:customerId/measurements
router.get('/', async (req, res, next) => {
  try {
    const { customerId } = paramsOf(req);
    const items = await req.tenantDb!.measurement.findMany({
      where: { customerId },
      orderBy: { takenAt: 'desc' },
    });
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { customerId } = paramsOf(req);
    const customer = await req.tenantDb!.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw notFound('Customer not found');

    const input = CreateSchema.parse(req.body);
    const created = await req.tenantDb!.measurement.create({
      data: { ...input, customerId: customer.id },
    });
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const { id, customerId } = paramsOf(req);
    const existing = await req.tenantDb!.measurement.findUnique({ where: { id } });
    if (!existing || existing.customerId !== customerId) throw notFound('Measurement not found');
    const input = UpdateSchema.parse(req.body);
    const updated = await req.tenantDb!.measurement.update({ where: { id }, data: input });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { id, customerId } = paramsOf(req);
    const existing = await req.tenantDb!.measurement.findUnique({ where: { id } });
    if (!existing || existing.customerId !== customerId) throw notFound('Measurement not found');
    await req.tenantDb!.measurement.delete({ where: { id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
