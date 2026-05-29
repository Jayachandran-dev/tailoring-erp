// Invoice / receipt PDF rendering.
//
// Uses pdfkit (no headless browser) so we can stream the response back to the
// client without spawning Chromium. Layout is intentionally minimal — header
// (business identity), customer block, items table, totals, footer (terms).
//
// Money is stored in cents; we format as ₹X,XXX.XX for INR when a custom
// invoice font is configured (env INVOICE_FONT_PATH) — the standard PDF
// Helvetica has no rupee codepoint (U+20B9) and renders it as a `¹`
// fallback, so without a font we degrade to a plain `Rs. ` prefix.

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { UPLOADS_ROOT } from '../../utils/uploads';
import { env } from '../../config/env';

// Font loading. Read once at module import — we cache the Buffer (or null) so
// we don't hit the disk per invoice. If the path is invalid we log once and
// fall back to standard Helvetica + 'Rs. ' for INR.
const CUSTOM_FONT_NAME = 'InvoiceCustom';
const customFontBuffer: Buffer | null = (() => {
  const p = env.INVOICE_FONT_PATH;
  if (!p) return null;
  try {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    return fs.readFileSync(abs);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(`[invoice] INVOICE_FONT_PATH set but unreadable: ${(err as Error).message}`);
    return null;
  }
})();
const HAS_RUPEE_FONT = customFontBuffer !== null;

// Minimum shape we need from the order — kept loose so this module doesn't
// drag the full Prisma type into its signature (and so tests can hand-build).
export interface InvoiceOrder {
  orderNumber: string | null;
  createdAt: Date;
  status: string;
  notes: string | null;
  discountCents: number;
  totalCents: number;
  paidCents: number;
  dueDate: Date | null;
  customer: {
    name: string;
    mobile: string | null;
    address?: string | null;
  };
  items: {
    name: string;
    garmentType: string;
    qty: number;
    unitPriceCents: number;
    notes: string | null;
  }[];
  payments: {
    amountCents: number;
    method: string;
    paidAt: Date;
    reference: string | null;
  }[];
}

export interface InvoiceBusiness {
  businessName: string;
  tagline: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  gstin: string | null;
  currency: string;
  logoUrl: string | null;
  invoicePrefix: string;
  invoiceFooter: string | null;
  terms: string | null;
}

function fmtMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents) / 100;
  const symbol = currency === 'INR' ? (HAS_RUPEE_FONT ? '₹' : 'Rs. ') : currency + ' ';
  return `${sign}${symbol}${abs.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Resolve an uploads URL like "/uploads/tenant_acme/business/logo.png" to an
 * absolute on-disk path. Returns null if the file isn't a local upload or
 * doesn't exist. Defensive against path traversal.
 */
function resolveUploadPath(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith('/uploads/')) return null;
  const rel = url.slice('/uploads/'.length);
  const abs = path.resolve(UPLOADS_ROOT, rel);
  // Path traversal guard: the resolved absolute path must still be inside
  // UPLOADS_ROOT.
  if (!abs.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) return null;
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return abs;
}

/**
 * Stream a PDF invoice for `order` to the given writable. The caller is
 * responsible for setting Content-Type and ending the response — pdfkit will
 * call `.end()` on the writable when the document is finalised.
 */
export function renderInvoicePdf(
  order: InvoiceOrder,
  business: InvoiceBusiness,
  out: NodeJS.WritableStream,
): void {
  const doc = new PDFDocument({ size: 'A4', margin: 40, info: { Title: invoiceTitle(order, business) } });
  doc.pipe(out);

  // Register the custom font once per document, then make it the default so
  // every subsequent doc.text() call can render ₹ and other extended glyphs.
  if (customFontBuffer) {
    try {
      doc.registerFont(CUSTOM_FONT_NAME, customFontBuffer);
      doc.font(CUSTOM_FONT_NAME);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[invoice] failed to register custom font: ${(err as Error).message}`);
    }
  }

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;

  // --- Header (logo + business identity) ---------------------------------
  const headerTop = doc.y;
  const logoPath = resolveUploadPath(business.logoUrl);
  if (logoPath) {
    try {
      doc.image(logoPath, left, headerTop, { fit: [64, 64] });
    } catch {
      // Bad image bytes — silently skip the logo rather than fail the invoice.
    }
  }

  const textX = logoPath ? left + 80 : left;
  doc.fontSize(18).fillColor('#111').text(business.businessName, textX, headerTop);
  if (business.tagline) {
    doc.fontSize(9).fillColor('#666').text(business.tagline, textX);
  }
  doc.fontSize(8).fillColor('#444');
  const addressParts = [
    business.addressLine1,
    business.addressLine2,
    [business.city, business.state, business.pincode].filter(Boolean).join(' '),
  ].filter(Boolean);
  for (const line of addressParts) doc.text(String(line), textX);
  const contactParts = [
    business.phone ? `Ph: ${business.phone}` : null,
    business.email ? `Email: ${business.email}` : null,
    business.gstin ? `GSTIN: ${business.gstin}` : null,
  ].filter(Boolean);
  if (contactParts.length) doc.text(contactParts.join('  ·  '), textX);

  doc.moveDown(1.5);

  // --- Invoice meta block -------------------------------------------------
  const metaTop = doc.y;
  doc.fontSize(14).fillColor('#111').text('INVOICE', left, metaTop);
  const metaRightX = left + pageWidth - 200;
  doc.fontSize(9).fillColor('#444');
  doc.text(`Invoice #: ${invoiceNumber(order, business)}`, metaRightX, metaTop, { width: 200, align: 'right' });
  doc.text(`Date: ${fmtDate(order.createdAt)}`, metaRightX, doc.y, { width: 200, align: 'right' });
  if (order.dueDate) {
    doc.text(`Due: ${fmtDate(order.dueDate)}`, metaRightX, doc.y, { width: 200, align: 'right' });
  }
  doc.text(`Status: ${order.status}`, metaRightX, doc.y, { width: 200, align: 'right' });

  doc.moveDown(2);

  // --- Customer block -----------------------------------------------------
  const custTop = doc.y;
  doc.fontSize(10).fillColor('#666').text('BILL TO', left, custTop);
  doc.fontSize(11).fillColor('#111').text(order.customer.name, left, doc.y);
  doc.fontSize(9).fillColor('#444');
  if (order.customer.mobile) doc.text(order.customer.mobile, left);
  if (order.customer.address) doc.text(order.customer.address, left, doc.y, { width: pageWidth / 2 });

  doc.moveDown(1.5);

  // --- Items table --------------------------------------------------------
  drawItemsTable(doc, order, business, left, pageWidth);

  doc.moveDown(1);

  // --- Totals block -------------------------------------------------------
  drawTotals(doc, order, business, left, pageWidth);

  // --- Payments history (if any) -----------------------------------------
  if (order.payments.length) {
    doc.moveDown(1);
    doc.fontSize(10).fillColor('#666').text('PAYMENTS RECEIVED', left);
    doc.fontSize(9).fillColor('#222');
    for (const p of order.payments) {
      const refTxt = p.reference ? ` · Ref ${p.reference}` : '';
      doc.text(
        `${fmtDate(p.paidAt)} · ${p.method}${refTxt} — ${fmtMoney(p.amountCents, business.currency)}`,
        left,
      );
    }
  }

  // --- Footer -------------------------------------------------------------
  if (business.terms || business.invoiceFooter) {
    doc.moveDown(1.5);
    doc.fontSize(8).fillColor('#666');
    if (business.terms) {
      doc.text('Terms:', left);
      doc.text(business.terms, left, doc.y, { width: pageWidth });
    }
    if (business.invoiceFooter) {
      doc.moveDown(0.5);
      doc.text(business.invoiceFooter, left, doc.y, { width: pageWidth, align: 'center' });
    }
  }

  doc.end();
}

function invoiceNumber(order: InvoiceOrder, business: InvoiceBusiness): string {
  if (order.orderNumber) return order.orderNumber;
  return `${business.invoicePrefix || 'INV'}-${Date.now()}`;
}

function invoiceTitle(order: InvoiceOrder, business: InvoiceBusiness): string {
  return `Invoice ${invoiceNumber(order, business)} — ${business.businessName}`;
}

function drawItemsTable(
  doc: PDFKit.PDFDocument,
  order: InvoiceOrder,
  business: InvoiceBusiness,
  left: number,
  pageWidth: number,
): void {
  const colWidths = {
    name: pageWidth * 0.45,
    garment: pageWidth * 0.15,
    qty: pageWidth * 0.1,
    price: pageWidth * 0.15,
    total: pageWidth * 0.15,
  };
  const headerY = doc.y;

  doc.rect(left, headerY - 2, pageWidth, 18).fill('#f1f5f9');
  doc.fillColor('#111').fontSize(9);
  let x = left + 6;
  doc.text('Item', x, headerY + 2, { width: colWidths.name });
  x += colWidths.name;
  doc.text('Garment', x, headerY + 2, { width: colWidths.garment });
  x += colWidths.garment;
  doc.text('Qty', x, headerY + 2, { width: colWidths.qty - 6, align: 'right' });
  x += colWidths.qty;
  doc.text('Price', x, headerY + 2, { width: colWidths.price - 6, align: 'right' });
  x += colWidths.price;
  doc.text('Total', x, headerY + 2, { width: colWidths.total - 6, align: 'right' });
  doc.y = headerY + 22;

  doc.fontSize(9).fillColor('#222');
  for (const item of order.items) {
    const rowY = doc.y;
    let cx = left + 6;
    doc.text(item.name, cx, rowY, { width: colWidths.name - 6 });
    const rowBottom = doc.y;
    cx += colWidths.name;
    doc.text(item.garmentType, cx, rowY, { width: colWidths.garment - 6 });
    cx += colWidths.garment;
    doc.text(String(item.qty), cx, rowY, { width: colWidths.qty - 6, align: 'right' });
    cx += colWidths.qty;
    doc.text(fmtMoney(item.unitPriceCents, business.currency), cx, rowY, {
      width: colWidths.price - 6,
      align: 'right',
    });
    cx += colWidths.price;
    doc.text(fmtMoney(item.qty * item.unitPriceCents, business.currency), cx, rowY, {
      width: colWidths.total - 6,
      align: 'right',
    });
    doc.y = Math.max(doc.y, rowBottom) + 4;
    doc.moveTo(left, doc.y).lineTo(left + pageWidth, doc.y).strokeColor('#e5e7eb').stroke();
    doc.y += 4;
  }
}

function drawTotals(
  doc: PDFKit.PDFDocument,
  order: InvoiceOrder,
  business: InvoiceBusiness,
  left: number,
  pageWidth: number,
): void {
  const subtotal = order.items.reduce((acc, it) => acc + it.qty * it.unitPriceCents, 0);
  const balance = order.totalCents - order.paidCents;

  const blockWidth = 220;
  const x = left + pageWidth - blockWidth;

  function row(label: string, value: string, bold = false) {
    const y = doc.y;
    doc.fontSize(bold ? 11 : 9).fillColor(bold ? '#111' : '#444');
    doc.text(label, x, y, { width: blockWidth - 90, align: 'right' });
    doc.fillColor(bold ? '#111' : '#222');
    doc.text(value, x + blockWidth - 90, y, { width: 90, align: 'right' });
    doc.moveDown(0.3);
  }

  row('Subtotal', fmtMoney(subtotal, business.currency));
  if (order.discountCents > 0) row('Discount', '-' + fmtMoney(order.discountCents, business.currency));
  row('Total', fmtMoney(order.totalCents, business.currency), true);
  row('Paid', fmtMoney(order.paidCents, business.currency));
  row('Balance', fmtMoney(balance, business.currency), true);
}
