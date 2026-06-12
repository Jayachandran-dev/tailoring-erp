// Public (unauthenticated) routes used by the customer-facing order status
// page and the share-link invoice download. NO auth, NO X-Tenant-Id header.
//
// All routes are token-gated; the token resolves to (tenantId, schemaName,
// orderId) via the platform-schema OrderShareToken table. The tenant Prisma
// client is loaded server-side from the token — the client never names the
// tenant.

import { Router } from 'express';
import { getTenantDb } from '../../db/tenantClient';
import { platformDb } from '../../db/platformClient';
import { notFound } from '../../utils/errors';
import * as shareService from './share.service';
import { renderInvoicePdf } from './invoice.service';

const router = Router();

// Trim down the JSON we hand to anonymous viewers. Never include actor info,
// audit fields, payment references, or anything the customer doesn't already
// know. This is the customer's own data, but the surface is hostile.
function publicOrderView(
  business: { businessName: string; logoUrl: string | null; phone: string | null; currency: string },
  order: {
    orderNumber: string | null;
    status: string;
    totalCents: number;
    paidCents: number;
    discountCents: number;
    dueDate: Date | null;
    createdAt: Date;
    deliveredAt: Date | null;
    customer: { name: string };
    items: { name: string; garmentType: string; qty: number; unitPriceCents: number }[];
    history: { toStatus: string; changedAt: Date }[];
  },
) {
  return {
    business: {
      name: business.businessName,
      logoUrl: business.logoUrl,
      phone: business.phone,
      currency: business.currency,
    },
    order: {
      number: order.orderNumber,
      status: order.status,
      totalCents: order.totalCents,
      paidCents: order.paidCents,
      balanceCents: order.totalCents - order.paidCents,
      discountCents: order.discountCents,
      dueDate: order.dueDate,
      createdAt: order.createdAt,
      deliveredAt: order.deliveredAt,
      customerName: order.customer.name,
      items: order.items.map((it) => ({
        name: it.name,
        garmentType: it.garmentType,
        qty: it.qty,
        unitPriceCents: it.unitPriceCents,
      })),
      history: order.history.map((h) => ({ status: h.toStatus, at: h.changedAt })),
    },
  };
}

router.get('/orders/:token', async (req, res, next) => {
  try {
    const token = String(req.params.token);
    const resolved = await shareService.resolveForView(token);
    if (!resolved) throw notFound('Link not found or has been revoked');

    // Defensive: confirm the tenant is still active. If it's been suspended /
    // deleted we treat the link as dead rather than leaking data.
    const tenant = await platformDb.tenant.findUnique({ where: { id: resolved.tenantId } });
    if (!tenant || tenant.status !== 'ACTIVE') throw notFound('Link not found or has been revoked');

    const db = getTenantDb(resolved.schemaName);
    // await assertTenantSchema(db, resolved.schemaName);

    const [order, business] = await Promise.all([
      db.order.findUnique({
        where: { id: resolved.orderId },
        include: {
          customer: { select: { name: true } },
          items: { orderBy: { sortOrder: 'asc' } },
          history: { orderBy: { changedAt: 'asc' } },
        },
      }),
      db.businessSettings.findFirst(),
    ]);
    if (!order) throw notFound('Order not found');
    if (!business) throw notFound('Business not configured');

    res.json({ data: publicOrderView(business, order) });
  } catch (err) {
    next(err);
  }
});

router.get('/orders/:token/invoice.pdf', async (req, res, next) => {
  try {
    const token = String(req.params.token);
    const resolved = await shareService.resolveForView(token);
    if (!resolved) throw notFound('Link not found or has been revoked');

    const tenant = await platformDb.tenant.findUnique({ where: { id: resolved.tenantId } });
    if (!tenant || tenant.status !== 'ACTIVE') throw notFound('Link not found or has been revoked');

    const db = getTenantDb(resolved.schemaName);
    // await assertTenantSchema(db, resolved.schemaName);

    const [order, business] = await Promise.all([
      db.order.findUnique({
        where: { id: resolved.orderId },
        include: {
          customer: { select: { name: true, mobile: true, address: true } },
          items: { orderBy: { sortOrder: 'asc' } },
          payments: { orderBy: { paidAt: 'desc' } },
        },
      }),
      db.businessSettings.findFirst(),
    ]);
    if (!order || !business) throw notFound('Order not found');

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

export default router;
