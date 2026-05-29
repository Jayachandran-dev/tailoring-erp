// Design categories: simple per-tenant CRUD.
// Deletion cascades to all designs in the category (FK ON DELETE CASCADE).

import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { ownerOrManager } from '../../middleware/role';
import { notFound } from '../../utils/errors';

const router = Router();
router.use(requireAuth, tenantContext);
// Category edits are OWNER/MANAGER only; STAFF can still browse.
router.use((req, res, next) => (req.method === 'GET' ? next() : ownerOrManager(req, res, next)));

const CreateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  sortOrder: z.number().int().optional(),
});
const UpdateSchema = CreateSchema.partial();

router.get('/', async (req, res, next) => {
  try {
    const items = await req.tenantDb!.designCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { designs: true } } },
    });
    res.json({ data: items });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = CreateSchema.parse(req.body);
    const created = await req.tenantDb!.designCategory.create({ data: input });
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.designCategory.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) throw notFound('Category not found');
    const input = UpdateSchema.parse(req.body);
    const updated = await req.tenantDb!.designCategory.update({
      where: { id: req.params.id },
      data: input,
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.designCategory.findUnique({
      where: { id: req.params.id },
    });
    if (!existing) throw notFound('Category not found');
    await req.tenantDb!.designCategory.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

export default router;
