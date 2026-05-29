// Business settings — singleton per tenant.
//
// Holds shop / business metadata used in the sidebar header, invoice/print
// views, and reports. There's always exactly one row (id = 'default'), seeded
// by the tenant DDL so GET never returns null.

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { ownerOrManager } from '../../middleware/role';
import { badRequest } from '../../utils/errors';
import { deletePublicPath, imageUpload, saveBufferToTenant } from '../../utils/uploads';

const router = Router();
router.use(requireAuth, tenantContext);
// Reads are open to any authenticated user; mutations require OWNER or MANAGER.
router.use((req, res, next) => (req.method === 'GET' ? next() : ownerOrManager(req, res, next)));

const SINGLETON_ID = 'default';

const nullableStr = (max = 200) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === undefined ? null : v));

const UpdateSchema = z.object({
  businessName:  z.string().trim().max(120).optional(),
  legalName:     nullableStr(160),
  tagline:       nullableStr(160),
  ownerName:     nullableStr(80),
  phone:         nullableStr(20),
  altPhone:      nullableStr(20),
  email:         z
    .string()
    .trim()
    .max(160)
    .optional()
    .nullable()
    .transform((v) => (v === '' || v === undefined ? null : v))
    .refine((v) => v === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), 'Invalid email'),
  website:       nullableStr(200),
  addressLine1:  nullableStr(160),
  addressLine2:  nullableStr(160),
  city:          nullableStr(80),
  state:         nullableStr(80),
  pincode:       nullableStr(20),
  country:       z.string().trim().max(80).optional(),
  gstin:         nullableStr(20),
  pan:           nullableStr(20),
  currency:      z.string().trim().length(3).optional(),
  timezone:      z.string().trim().max(60).optional(),
  logoUrl:       nullableStr(500),
  visitingCardUrl: nullableStr(500),
  invoicePrefix: z.string().trim().max(10).optional(),
  invoiceFooter: nullableStr(500),
  terms:         nullableStr(2000),
});

router.get('/', async (req, res, next) => {
  try {
    // Singleton row is seeded by tenant DDL; upsert as a safety net for tenants
    // that predate the seed.
    const row = await req.tenantDb!.businessSettings.upsert({
      where:  { id: SINGLETON_ID },
      update: {},
      create: { id: SINGLETON_ID },
    });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

router.put('/', async (req, res, next) => {
  try {
    const input = UpdateSchema.parse(req.body);
    const row = await req.tenantDb!.businessSettings.upsert({
      where:  { id: SINGLETON_ID },
      update: input,
      create: { id: SINGLETON_ID, ...input },
    });
    res.json({ data: row });
  } catch (err) {
    next(err);
  }
});

// ------------------------------------------------------------------
// Image uploads — logo + visiting card.
// Multipart field name: "image". Bucket: business/<schema>/business/...
// Replacing an existing image deletes the previous file from disk.
// ------------------------------------------------------------------

type ImageField = 'logoUrl' | 'visitingCardUrl';

async function handleImageUpload(
  req: Request,
  res: Response,
  field: ImageField,
) {
  if (!req.file) throw badRequest('image file is required (field name "image")');

  // Ensure the singleton row exists so we can read the prior URL.
  const current = await req.tenantDb!.businessSettings.upsert({
    where:  { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });

  const saved = await saveBufferToTenant({
    tenantSchema: req.tenantSchema!,
    bucket:       'business',
    buffer:       req.file.buffer,
    mime:         req.file.mimetype,
    originalName: req.file.originalname,
  });

  const previous = current[field];
  if (previous) await deletePublicPath(previous);

  const row = await req.tenantDb!.businessSettings.update({
    where: { id: SINGLETON_ID },
    data:  { [field]: saved.publicPath },
  });
  res.json({ data: row });
}

async function handleImageDelete(
  req: Request,
  res: Response,
  field: ImageField,
) {
  const current = await req.tenantDb!.businessSettings.upsert({
    where:  { id: SINGLETON_ID },
    update: {},
    create: { id: SINGLETON_ID },
  });
  if (current[field]) await deletePublicPath(current[field]!);
  const row = await req.tenantDb!.businessSettings.update({
    where: { id: SINGLETON_ID },
    data:  { [field]: null },
  });
  res.json({ data: row });
}

router.post('/logo', imageUpload.single('image'), async (req, res, next) => {
  try { await handleImageUpload(req, res, 'logoUrl'); } catch (err) { next(err); }
});
router.delete('/logo', async (req, res, next) => {
  try { await handleImageDelete(req, res, 'logoUrl'); } catch (err) { next(err); }
});

router.post('/visiting-card', imageUpload.single('image'), async (req, res, next) => {
  try { await handleImageUpload(req, res, 'visitingCardUrl'); } catch (err) { next(err); }
});
router.delete('/visiting-card', async (req, res, next) => {
  try { await handleImageDelete(req, res, 'visitingCardUrl'); } catch (err) { next(err); }
});

export default router;
