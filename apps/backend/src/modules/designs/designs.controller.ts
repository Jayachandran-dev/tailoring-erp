// Designs catalog. Tenant-scoped. Supports category filter, free-text search, pagination,
// image upload (reuses the multer-backed uploads util), and standard CRUD.

import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '../../../node_modules/.prisma/tenant-client';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { ownerOrManager } from '../../middleware/role';
import { badRequest, notFound } from '../../utils/errors';
import { deletePublicPath, imageUpload, saveBufferToTenant } from '../../utils/uploads';

const router = Router();
router.use(requireAuth, tenantContext);
// Catalog edits are OWNER/MANAGER only; STAFF can still browse the catalog.
router.use((req, res, next) => (req.method === 'GET' ? next() : ownerOrManager(req, res, next)));

const BaseSchema = {
  categoryId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  code: z.string().trim().max(40).optional().nullable(),
  priceCents: z.coerce.number().int().min(0).default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  tags: z.string().trim().max(200).optional().nullable(),
};
const CreateSchema = z.object(BaseSchema);
const UpdateSchema = z.object(BaseSchema).partial();

const ListQuerySchema = z.object({
  q: z.string().trim().optional(),
  categoryId: z.string().trim().optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

router.get('/', async (req, res, next) => {
  try {
    const { q, categoryId, page, pageSize } = ListQuerySchema.parse(req.query);
    const where: Prisma.DesignWhereInput = {
      ...(categoryId ? { categoryId } : {}),
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: 'insensitive' } },
              { code: { contains: q, mode: 'insensitive' } },
              { tags: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, items] = await Promise.all([
      req.tenantDb!.design.count({ where }),
      req.tenantDb!.design.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { category: { select: { id: true, name: true } } },
      }),
    ]);

    res.json({ data: { items, total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const design = await req.tenantDb!.design.findUnique({
      where: { id: req.params.id },
      include: { category: { select: { id: true, name: true } } },
    });
    if (!design) throw notFound('Design not found');
    res.json({ data: design });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = CreateSchema.parse(req.body);
    const cat = await req.tenantDb!.designCategory.findUnique({ where: { id: input.categoryId } });
    if (!cat) throw badRequest('Invalid categoryId');
    const created = await req.tenantDb!.design.create({
      data: input,
      include: { category: { select: { id: true, name: true } } },
    });
    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.design.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Design not found');
    const input = UpdateSchema.parse(req.body);
    if (input.categoryId) {
      const cat = await req.tenantDb!.designCategory.findUnique({
        where: { id: input.categoryId },
      });
      if (!cat) throw badRequest('Invalid categoryId');
    }
    const updated = await req.tenantDb!.design.update({
      where: { id: req.params.id },
      data: input,
      include: { category: { select: { id: true, name: true } } },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.design.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Design not found');
    if (existing.imageUrl) await deletePublicPath(existing.imageUrl);
    await req.tenantDb!.design.delete({ where: { id: req.params.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// Image upload (multipart, field name "image")
router.post('/:id/image', imageUpload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) throw badRequest('image file is required (field name "image")');
    const id = String(req.params.id);
    const design = await req.tenantDb!.design.findUnique({ where: { id } });
    if (!design) throw notFound('Design not found');

    const saved = await saveBufferToTenant({
      tenantSchema: req.tenantSchema!,
      bucket: 'designs',
      buffer: req.file.buffer,
      mime: req.file.mimetype,
      originalName: req.file.originalname,
    });

    if (design.imageUrl) await deletePublicPath(design.imageUrl);

    const updated = await req.tenantDb!.design.update({
      where: { id: design.id },
      data: { imageUrl: saved.publicPath },
      include: { category: { select: { id: true, name: true } } },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/image', async (req, res, next) => {
  try {
    const design = await req.tenantDb!.design.findUnique({ where: { id: req.params.id } });
    if (!design) throw notFound('Design not found');
    if (design.imageUrl) await deletePublicPath(design.imageUrl);
    const updated = await req.tenantDb!.design.update({
      where: { id: design.id },
      data: { imageUrl: null },
      include: { category: { select: { id: true, name: true } } },
    });
    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

export default router;
