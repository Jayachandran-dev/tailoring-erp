// Customers module: list (with search + pagination), create, get one (with measurements),
// update, delete, image upload/remove. All routes are tenant-scoped via tenantContext.

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '../../../node_modules/.prisma/tenant-client';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { badRequest, notFound } from '../../utils/errors';
import { imageUpload, saveBufferToTenant, deletePublicPath } from '../../utils/uploads';
import measurementsRouter from '../measurements/measurements.controller';

const router = Router();
router.use(requireAuth, tenantContext);

const CustomerBaseSchema = {
  name: z.string().trim().min(1).max(120),
  mobile: z.string().trim().max(20).optional().nullable(),
  email: z.string().trim().email().max(120).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  gender: z.enum(['male', 'female', 'other']).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
};
const CreateCustomerSchema = z.object(CustomerBaseSchema);
const UpdateCustomerSchema = z.object(CustomerBaseSchema).partial();

const ListQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// GET /customers?q=&page=&pageSize=
router.get('/', async (req, res, next) => {
  try {
    const { q, page, pageSize } = ListQuerySchema.parse(req.query);
    const where: Prisma.CustomerWhereInput = q
      ? {
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { mobile: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
          ],
        }
      : {};

    const [total, items] = await Promise.all([
      req.tenantDb!.customer.count({ where }),
      req.tenantDb!.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);
    res.json({ data: { items, total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id (with measurements)
router.get('/:id', async (req, res, next) => {
  try {
    const customer = await req.tenantDb!.customer.findUnique({
      where: { id: req.params.id },
      include: { measurements: { orderBy: { takenAt: 'desc' } } },
    });
    if (!customer) throw notFound('Customer not found');
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = CreateCustomerSchema.parse(req.body);
    const customer = await req.tenantDb!.customer.create({ data: input });
    res.status(201).json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const input = UpdateCustomerSchema.parse(req.body);
    const existing = await req.tenantDb!.customer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Customer not found');
    const customer = await req.tenantDb!.customer.update({
      where: { id: req.params.id },
      data: input,
    });
    res.json({ data: customer });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.customer.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Customer not found');
    if (existing.imageUrl) await deletePublicPath(existing.imageUrl);
    await req.tenantDb!.customer.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// POST /customers/:id/image (multipart: field name "image")
router.post('/:id/image', imageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('image file is required (field name "image")');
    const customer = await req.tenantDb!.customer.findUnique({ where: { id: req.params.id } });
    if (!customer) throw notFound('Customer not found');

    const saved = await saveBufferToTenant({
      tenantSchema: req.tenantSchema!,
      bucket: 'customers',
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      originalName: req.file.originalname,
    });

    if (customer.imageUrl) await deletePublicPath(customer.imageUrl);

    const updated = await req.tenantDb!.customer.update({
      where: { id: customer.id },
      data: { imageUrl: saved.publicPath },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/image', async (req, res, next) => {
  try {
    const customer = await req.tenantDb!.customer.findUnique({ where: { id: req.params.id } });
    if (!customer) throw notFound('Customer not found');
    if (customer.imageUrl) await deletePublicPath(customer.imageUrl);
    const updated = await req.tenantDb!.customer.update({
      where: { id: customer.id },
      data: { imageUrl: null },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

// Nested measurements: /customers/:customerId/measurements
router.use('/:customerId/measurements', measurementsRouter);

export default router;
