// Orders module. Tenant-scoped CRUD + line items + payments + status transitions.
//
// Architecture:
//   - Order numbers come from a per-tenant Postgres SEQUENCE (`order_number_seq`)
//     so they're monotonic and collision-free even under concurrency.
//   - Totals (totalCents, paidCents) are *server-authoritative* and recomputed
//     inside the same transaction that mutates items/payments.
//   - OrderItem snapshots design name/image/price at the moment of creation,
//     so renaming or deleting a design later doesn't rewrite history.
//   - Status changes are logged to OrderStatusHistory and validated against a
//     small state machine.

import { Router } from 'express';
import { z } from 'zod';
import {
  OrderStatus,
  Prisma,
  type PrismaClient,
} from '../../../node_modules/.prisma/tenant-client';
import { requireAuth } from '../../middleware/auth';
import { tenantContext } from '../../middleware/tenantContext';
import { ownerOrManager } from '../../middleware/role';
import { badRequest, notFound } from '../../utils/errors';
import { env } from '../../config/env';
import * as shareService from '../sharing/share.service';
import { renderInvoicePdf } from '../sharing/invoice.service';
import { renderWorkOrderPdf } from '../sharing/workOrder.service';

const router = Router();
router.use(requireAuth, tenantContext);
// Destructive operations (delete order or payment) are OWNER/MANAGER only.
router.use((req, res, next) => (req.method === 'DELETE' ? ownerOrManager(req, res, next) : next()));

// --- helpers ---------------------------------------------------------------

const ItemInputSchema = z.object({
  designId: z.string().optional().nullable(),
  measurementId: z.string().optional().nullable(),
  garmentType: z.string().trim().min(1).max(40).default('custom'),
  name: z.string().trim().min(1).max(120),
  imageUrl: z.string().trim().max(500).optional().nullable(),
  qty: z.coerce.number().int().min(1).max(999).default(1),
  unitPriceCents: z.coerce.number().int().min(0).default(0),
  measurementSnapshot: z.record(z.union([z.string(), z.number()])).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const PriorityEnum = z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']);

const CreateOrderSchema = z.object({
  customerId: z.string().min(1),
  items: z.array(ItemInputSchema).min(1, 'At least one item is required'),
  discountCents: z.coerce.number().int().min(0).default(0),
  priority: PriorityEnum.default('NORMAL'),
  notes: z.string().trim().max(1000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  // Optional initial advance payment captured at order creation.
  advance: z
    .object({
      amountCents: z.coerce.number().int().min(1),
      method: z.string().trim().max(20).default('CASH'),
      reference: z.string().trim().max(80).optional().nullable(),
      notes: z.string().trim().max(200).optional().nullable(),
      upiAccountId: z.string().trim().min(1).max(40).optional().nullable(),
    })
    .optional(),
});

const UpdateOrderSchema = z.object({
  discountCents: z.coerce.number().int().min(0).optional(),
  priority: PriorityEnum.optional(),
  notes: z.string().trim().max(1000).optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  items: z.array(ItemInputSchema).optional(), // full replace if provided
});

const StatusSchema = z.object({
  status: z.nativeEnum(OrderStatus),
  note: z.string().trim().max(500).optional().nullable(),
});

const PaymentSchema = z
  .object({
    // Negative amounts are refunds. Use .refine to reject zero (which would be a no-op).
    amountCents: z.coerce.number().int().refine((v) => v !== 0, 'Amount cannot be zero'),
    method: z.string().trim().max(20).default('CASH'),
    reference: z.string().trim().max(80).optional().nullable(),
    notes: z.string().trim().max(200).optional().nullable(),
    paidAt: z.coerce.date().optional(),
    // For UPI payments: which receiving account the customer paid into.
    upiAccountId: z.string().trim().min(1).max(40).optional().nullable(),
  });

const ListQuerySchema = z.object({
  q: z.string().trim().optional(),
  status: z.nativeEnum(OrderStatus).optional(),
  customerId: z.string().trim().optional(),
  due: z.enum(['overdue', 'today', 'week']).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Allowed transitions. Keep it strict but practical.
const ALLOWED_NEXT: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'PENDING', 'CANCELLED'],
  READY: ['DELIVERED', 'IN_PROGRESS', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: ['PENDING'],
};

const ORDER_INCLUDE = {
  customer: {
    select: { id: true, name: true, mobile: true, imageUrl: true },
  },
  items: { orderBy: { sortOrder: 'asc' } },
  payments: {
    orderBy: { paidAt: 'desc' },
    include: { upiAccount: { select: { id: true, label: true, upiId: true } } },
  },
  history: { orderBy: { changedAt: 'asc' } },
} satisfies Prisma.OrderInclude;

function computeTotals(
  items: { qty: number; unitPriceCents: number }[],
  discountCents: number,
  paid: { amountCents: number }[],
) {
  const subtotal = items.reduce((acc, it) => acc + it.qty * it.unitPriceCents, 0);
  const total = Math.max(0, subtotal - (discountCents || 0));
  const paidCents = paid.reduce((acc, p) => acc + p.amountCents, 0);
  return { subtotal, total, paidCents };
}

async function nextOrderNumber(db: PrismaClient, schema: string): Promise<string> {
  const rows = await db.$queryRawUnsafe<{ nextval: bigint }[]>(
    `SELECT nextval('"${schema}"."order_number_seq"') AS nextval`,
  );
  const n = rows[0]?.nextval ?? BigInt(1001);
  return `ORD-${n.toString()}`;
}

// --- routes ----------------------------------------------------------------

router.get('/', async (req, res, next) => {
  try {
    const { q, status, customerId, due, page, pageSize } = ListQuerySchema.parse(req.query);
    const where: Prisma.OrderWhereInput = {
      ...(status ? { status } : {}),
      ...(customerId ? { customerId } : {}),
      ...(q
        ? {
            OR: [
              { orderNumber: { contains: q, mode: 'insensitive' } },
              { notes: { contains: q, mode: 'insensitive' } },
              { customer: { name: { contains: q, mode: 'insensitive' } } },
              { customer: { mobile: { contains: q, mode: 'insensitive' } } },
              { items: { some: { name: { contains: q, mode: 'insensitive' } } } },
            ],
          }
        : {}),
    };

    if (due) {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000);
      const endOfWeek = new Date(startOfDay.getTime() + 7 * 24 * 60 * 60 * 1000);
      const activeOnly: Prisma.OrderWhereInput = {
        status: { notIn: ['DELIVERED', 'CANCELLED'] },
      };
      if (due === 'overdue') {
        Object.assign(where, activeOnly, { dueDate: { lt: startOfDay } });
      } else if (due === 'today') {
        Object.assign(where, activeOnly, { dueDate: { gte: startOfDay, lt: endOfDay } });
      } else if (due === 'week') {
        Object.assign(where, activeOnly, { dueDate: { gte: startOfDay, lt: endOfWeek } });
      }
    }

    const [total, items] = await Promise.all([
      req.tenantDb!.order.count({ where }),
      req.tenantDb!.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          customer: { select: { id: true, name: true, mobile: true } },
          _count: { select: { items: true, payments: true } },
        },
      }),
    ]);

    res.json({ data: { items, total, page, pageSize } });
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await req.tenantDb!.order.findUnique({
      where: { id: req.params.id },
      include: ORDER_INCLUDE,
    });
    if (!order) throw notFound('Order not found');
    res.json({ data: order });
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const input = CreateOrderSchema.parse(req.body);
    const db = req.tenantDb!;
    const schema = req.tenantSchema!;

    const customer = await db.customer.findUnique({ where: { id: input.customerId } });
    if (!customer) throw badRequest('Invalid customerId');

    const orderNumber = await nextOrderNumber(db, schema);
    const { total } = computeTotals(input.items, input.discountCents, []);

    const created = await db.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          orderNumber,
          customerId: input.customerId,
          status: 'PENDING',
          priority: input.priority,
          discountCents: input.discountCents,
          totalCents: total,
          paidCents: 0,
          notes: input.notes ?? null,
          dueDate: input.dueDate ?? null,
          // Legacy summary fields kept in sync for old reports.
          itemType: input.items[0]?.garmentType ?? null,
          priceCents: total,
          items: {
            create: input.items.map((it, idx) => ({
              designId: it.designId ?? null,
              measurementId: it.measurementId ?? null,
              garmentType: it.garmentType,
              name: it.name,
              imageUrl: it.imageUrl ?? null,
              qty: it.qty,
              unitPriceCents: it.unitPriceCents,
              measurementSnapshot: it.measurementSnapshot ?? undefined,
              notes: it.notes ?? null,
              sortOrder: idx,
            })),
          },
          history: {
            create: { toStatus: 'PENDING', note: 'Order created' },
          },
        },
      });

      if (input.advance) {
        await tx.orderPayment.create({
          data: {
            orderId: order.id,
            amountCents: input.advance.amountCents,
            method: input.advance.method,
            reference: input.advance.reference ?? null,
            notes: input.advance.notes ?? 'Advance',
            upiAccountId: input.advance.upiAccountId ?? null,
          },
        });
        await tx.order.update({
          where: { id: order.id },
          data: { paidCents: input.advance.amountCents },
        });
      }

      return tx.order.findUnique({ where: { id: order.id }, include: ORDER_INCLUDE });
    });

    res.status(201).json({ data: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.order.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!existing) throw notFound('Order not found');
    const input = UpdateOrderSchema.parse(req.body);

    const updated = await req.tenantDb!.$transaction(async (tx) => {
      // Replace items wholesale when provided.
      if (input.items) {
        await tx.orderItem.deleteMany({ where: { orderId: existing.id } });
        await tx.orderItem.createMany({
          data: input.items.map((it, idx) => ({
            orderId: existing.id,
            designId: it.designId ?? null,
            measurementId: it.measurementId ?? null,
            garmentType: it.garmentType,
            name: it.name,
            imageUrl: it.imageUrl ?? null,
            qty: it.qty,
            unitPriceCents: it.unitPriceCents,
            measurementSnapshot: (it.measurementSnapshot as Prisma.InputJsonValue) ?? undefined,
            notes: it.notes ?? null,
            sortOrder: idx,
          })),
        });
      }

      const itemsAfter = input.items
        ? input.items
        : await tx.orderItem.findMany({ where: { orderId: existing.id } });
      const discount = input.discountCents ?? existing.discountCents;
      const { total } = computeTotals(itemsAfter, discount, existing.payments);

      return tx.order.update({
        where: { id: existing.id },
        data: {
          ...(input.priority !== undefined ? { priority: input.priority } : {}),
          ...(input.notes !== undefined ? { notes: input.notes } : {}),
          ...(input.dueDate !== undefined ? { dueDate: input.dueDate } : {}),
          discountCents: discount,
          totalCents: total,
          priceCents: total, // keep legacy in sync
        },
        include: ORDER_INCLUDE,
      });
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/status', async (req, res, next) => {
  try {
    const { status, note } = StatusSchema.parse(req.body);
    const existing = await req.tenantDb!.order.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Order not found');
    if (existing.status === status) {
      res.json({ data: existing });
      return;
    }
    const allowed = ALLOWED_NEXT[existing.status];
    if (!allowed.includes(status)) {
      throw badRequest(
        `Cannot transition from ${existing.status} to ${status}. Allowed: ${
          allowed.join(', ') || '(none)'
        }`,
      );
    }

    const updated = await req.tenantDb!.$transaction(async (tx) => {
      await tx.orderStatusHistory.create({
        data: {
          orderId: existing.id,
          fromStatus: existing.status,
          toStatus: status,
          note: note ?? null,
        },
      });
      return tx.order.update({
        where: { id: existing.id },
        data: {
          status,
          ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}),
        },
        include: ORDER_INCLUDE,
      });
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.post('/:id/payments', async (req, res, next) => {
  try {
    const input = PaymentSchema.parse(req.body);
    const existing = await req.tenantDb!.order.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!existing) throw notFound('Order not found');

    // Guard refunds: cannot refund more than has been collected so far.
    if (input.amountCents < 0) {
      const collected = existing.payments.reduce((a, p) => a + p.amountCents, 0);
      if (collected + input.amountCents < 0) {
        throw badRequest(
          `Refund exceeds collected amount. Collected so far: ${(collected / 100).toFixed(2)}`,
        );
      }
    }

    const updated = await req.tenantDb!.$transaction(async (tx) => {
      await tx.orderPayment.create({
        data: {
          orderId: existing.id,
          amountCents: input.amountCents,
          method: input.method,
          reference: input.reference ?? null,
          notes: input.notes ?? null,
          paidAt: input.paidAt ?? new Date(),
          upiAccountId: input.upiAccountId ?? null,
        },
      });
      const paidCents =
        existing.payments.reduce((a, p) => a + p.amountCents, 0) + input.amountCents;
      return tx.order.update({
        where: { id: existing.id },
        data: { paidCents },
        include: ORDER_INCLUDE,
      });
    });

    res.status(201).json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id/payments/:paymentId', async (req, res, next) => {
  try {
    const order = await req.tenantDb!.order.findUnique({
      where: { id: req.params.id },
      include: { payments: true },
    });
    if (!order) throw notFound('Order not found');
    const payment = order.payments.find((p) => p.id === req.params.paymentId);
    if (!payment) throw notFound('Payment not found');

    const updated = await req.tenantDb!.$transaction(async (tx) => {
      await tx.orderPayment.delete({ where: { id: payment.id } });
      const paidCents = order.payments
        .filter((p) => p.id !== payment.id)
        .reduce((a, p) => a + p.amountCents, 0);
      return tx.order.update({
        where: { id: order.id },
        data: { paidCents },
        include: ORDER_INCLUDE,
      });
    });

    res.json({ data: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const existing = await req.tenantDb!.order.findUnique({ where: { id: req.params.id } });
    if (!existing) throw notFound('Order not found');
    await req.tenantDb!.order.delete({ where: { id: existing.id } });
    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

// ===================================================================
// Customer-facing share link + invoice PDF (tenant-scoped, authed)
// ===================================================================

function publicOrderUrl(token: string): string {
  // PUBLIC_APP_URL is the user-visible SPA origin (falls back to CORS_ORIGIN).
  const base = (env.PUBLIC_APP_URL || env.CORS_ORIGIN).replace(/\/+$/, '');
  return `${base}/p/order/${token}`;
}

// Create-or-return the active share link for this order. Idempotent.
router.post('/:id/share-link', async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const exists = await req.tenantDb!.order.findUnique({ where: { id: orderId }, select: { id: true } });
    if (!exists) throw notFound('Order not found');
    const tok = await shareService.getOrCreate(req.tenantId!, req.tenantSchema!, orderId);
    res.status(201).json({
      data: {
        token: tok.token,
        url: publicOrderUrl(tok.token),
        createdAt: tok.createdAt,
        lastViewedAt: tok.lastViewedAt,
        viewCount: tok.viewCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Read the currently-active share link (if any) — doesn't mint a new one.
router.get('/:id/share-link', async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const tok = await shareService.getActive(req.tenantId!, orderId);
    if (!tok) {
      res.json({ data: null });
      return;
    }
    res.json({
      data: {
        token: tok.token,
        url: publicOrderUrl(tok.token),
        createdAt: tok.createdAt,
        lastViewedAt: tok.lastViewedAt,
        viewCount: tok.viewCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// Revoke any active share link for this order. Idempotent — returns the
// number of links revoked (0 if none was active).
router.delete('/:id/share-link', async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const count = await shareService.revoke(req.tenantId!, orderId);
    res.json({ data: { revoked: count } });
  } catch (err) {
    next(err);
  }
});

// Stream a PDF invoice for the order.
router.get('/:id/invoice.pdf', async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await req.tenantDb!.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { name: true, mobile: true, address: true } },
        items: { orderBy: { sortOrder: 'asc' } },
        payments: { orderBy: { paidAt: 'desc' } },
      },
    });
    if (!order) throw notFound('Order not found');
    const business = await req.tenantDb!.businessSettings.findFirst();
    if (!business) throw badRequest('Configure Business Settings before printing an invoice');

    const filename = `invoice-${(order.orderNumber || order.id).replace(/[^a-z0-9-]/gi, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    renderInvoicePdf(
      {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status,
        notes: order.notes,
        discountCents: order.discountCents,
        totalCents: order.totalCents,
        paidCents: order.paidCents,
        dueDate: order.dueDate,
        customer: {
          name: order.customer.name,
          mobile: order.customer.mobile,
          address: order.customer.address,
        },
        items: order.items.map((it) => ({
          name: it.name,
          garmentType: it.garmentType,
          qty: it.qty,
          unitPriceCents: it.unitPriceCents,
          notes: it.notes,
        })),
        payments: order.payments.map((p) => ({
          amountCents: p.amountCents,
          method: p.method,
          paidAt: p.paidAt,
          reference: p.reference,
        })),
      },
      {
        businessName: business.businessName,
        tagline: business.tagline,
        phone: business.phone,
        email: business.email,
        addressLine1: business.addressLine1,
        addressLine2: business.addressLine2,
        city: business.city,
        state: business.state,
        pincode: business.pincode,
        gstin: business.gstin,
        currency: business.currency,
        logoUrl: business.logoUrl,
        invoicePrefix: business.invoicePrefix,
        invoiceFooter: business.invoiceFooter,
        terms: business.terms,
      },
      res,
    );
  } catch (err) {
    next(err);
  }
});

// Stream a tailor-facing work-order PDF (no prices, includes measurements).
router.get('/:id/work-order.pdf', async (req, res, next) => {
  try {
    const orderId = String(req.params.id);
    const order = await req.tenantDb!.order.findUnique({
      where: { id: orderId },
      include: {
        customer: { select: { name: true, mobile: true, address: true } },
        items: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!order) throw notFound('Order not found');
    const business = await req.tenantDb!.businessSettings.findFirst();
    if (!business) throw badRequest('Configure Business Settings before printing a work order');

    const filename = `work-order-${(order.orderNumber || order.id).replace(/[^a-z0-9-]/gi, '_')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);

    renderWorkOrderPdf(
      {
        orderNumber: order.orderNumber,
        createdAt: order.createdAt,
        status: order.status,
        notes: order.notes,
        priority: order.priority,
        dueDate: order.dueDate,
        customer: {
          name: order.customer.name,
          mobile: order.customer.mobile,
          address: order.customer.address,
        },
        items: order.items.map((it) => ({
          name: it.name,
          garmentType: it.garmentType,
          qty: it.qty,
          notes: it.notes,
          measurementSnapshot:
            (it.measurementSnapshot as Record<string, string | number> | null) ?? null,
        })),
      },
      {
        businessName: business.businessName,
        phone: business.phone,
        addressLine1: business.addressLine1,
        city: business.city,
        state: business.state,
        pincode: business.pincode,
        logoUrl: business.logoUrl,
      },
      res,
    );
  } catch (err) {
    next(err);
  }
});

export default router;
