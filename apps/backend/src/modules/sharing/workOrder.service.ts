// Work-order (tailor copy) PDF — same business header as the invoice but
// optimised for the workshop:
//   * Big "WORK ORDER" banner so it doesn't get confused with the bill
//   * NO prices, NO totals, NO payments — tailors don't need them
//   * Per-item measurements (from the snapshot stored on each OrderItem)
//   * Item notes preserved
//
// Shares the same custom-font registration story as invoice.service.ts so
// the rupee glyph isn't an issue here (we don't print money), but we still
// register the font for nicer typography when configured.

import PDFDocument from 'pdfkit';
import path from 'path';
import fs from 'fs';
import { UPLOADS_ROOT } from '../../utils/uploads';
import { env } from '../../config/env';

// Reuse the same loading strategy as invoice.service (own copy to keep the
// modules decoupled — they're allowed to diverge later).
const CUSTOM_FONT_NAME = 'WorkOrderCustom';
const customFontBuffer: Buffer | null = (() => {
  const p = env.INVOICE_FONT_PATH;
  if (!p) return null;
  try {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    return fs.readFileSync(abs);
  } catch {
    return null;
  }
})();

export interface WorkOrderInput {
  orderNumber: string | null;
  createdAt: Date;
  status: string;
  notes: string | null;
  priority: string;
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
    notes: string | null;
    /** Snapshot taken when the order was created — {fieldKey: value}. */
    measurementSnapshot: Record<string, string | number> | null;
  }[];
}

export interface WorkOrderBusiness {
  businessName: string;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  logoUrl: string | null;
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function resolveUploadPath(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith('/uploads/')) return null;
  const rel = url.slice('/uploads/'.length);
  const abs = path.resolve(UPLOADS_ROOT, rel);
  if (!abs.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) return null;
  try {
    if (!fs.statSync(abs).isFile()) return null;
  } catch {
    return null;
  }
  return abs;
}

export function renderWorkOrderPdf(
  order: WorkOrderInput,
  business: WorkOrderBusiness,
  out: NodeJS.WritableStream,
): void {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 36,
    info: { Title: `Work Order ${order.orderNumber ?? ''} — ${business.businessName}` },
  });
  doc.pipe(out);

  if (customFontBuffer) {
    try {
      doc.registerFont(CUSTOM_FONT_NAME, customFontBuffer);
      doc.font(CUSTOM_FONT_NAME);
    } catch {
      // fall back to Helvetica
    }
  }

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const left = doc.page.margins.left;

  // --- Banner ------------------------------------------------------------
  const headerY = doc.y;
  const logoPath = resolveUploadPath(business.logoUrl);
  if (logoPath) {
    try {
      doc.image(logoPath, left, headerY, { fit: [50, 50] });
    } catch {
      /* skip */
    }
  }
  const textX = logoPath ? left + 64 : left;
  doc
    .fontSize(16)
    .fillColor('#111')
    .text(business.businessName, textX, headerY);
  doc.fontSize(8).fillColor('#555');
  const addrParts = [
    business.addressLine1,
    [business.city, business.state, business.pincode].filter(Boolean).join(' '),
    business.phone ? `Ph: ${business.phone}` : null,
  ].filter(Boolean);
  for (const a of addrParts) doc.text(String(a), textX);

  // Right side: big WORK ORDER label + meta
  const metaX = left + pageWidth - 200;
  doc
    .fontSize(18)
    .fillColor('#b45309') // amber — visually distinct from the invoice
    .text('WORK ORDER', metaX, headerY, { width: 200, align: 'right' });
  doc.fontSize(9).fillColor('#222');
  doc.text(`#: ${order.orderNumber ?? '—'}`, metaX, doc.y, { width: 200, align: 'right' });
  doc.text(`Issued: ${fmtDate(order.createdAt)}`, metaX, doc.y, { width: 200, align: 'right' });
  if (order.dueDate) {
    doc
      .fillColor('#b45309')
      .text(`Due: ${fmtDate(order.dueDate)}`, metaX, doc.y, { width: 200, align: 'right' });
    doc.fillColor('#222');
  }
  if (order.priority && order.priority !== 'NORMAL') {
    doc.text(`Priority: ${order.priority}`, metaX, doc.y, { width: 200, align: 'right' });
  }

  doc.moveDown(2);

  // --- Customer ----------------------------------------------------------
  const custTop = doc.y;
  doc.fontSize(9).fillColor('#666').text('CUSTOMER', left, custTop);
  doc.fontSize(13).fillColor('#111').text(order.customer.name, left);
  doc.fontSize(9).fillColor('#444');
  if (order.customer.mobile) doc.text(order.customer.mobile, left);
  if (order.customer.address) {
    doc.text(order.customer.address, left, doc.y, { width: pageWidth / 2 });
  }

  doc.moveDown(1.5);

  // --- Items + measurements ---------------------------------------------
  doc.fontSize(10).fillColor('#666').text('ITEMS', left);
  doc.moveDown(0.5);

  for (let i = 0; i < order.items.length; i++) {
    const it = order.items[i];
    const top = doc.y;

    // Section divider
    if (i > 0) {
      doc.moveTo(left, top).lineTo(left + pageWidth, top).strokeColor('#e5e7eb').stroke();
      doc.y = top + 6;
    }

    // Item heading: "1.  Chudidhar  ×2   (chudi)"
    doc.fontSize(12).fillColor('#111').text(
      `${i + 1}. ${it.name}  ×${it.qty}`,
      left,
      doc.y,
      { continued: true },
    );
    doc.fontSize(9).fillColor('#666').text(`   (${it.garmentType})`);

    // Notes
    if (it.notes) {
      doc.fontSize(9).fillColor('#444').text(`Notes: ${it.notes}`, left, doc.y, {
        width: pageWidth,
      });
    }

    // Measurements snapshot rendered as a 3-column grid of "Label: value"
    const snap = it.measurementSnapshot;
    if (snap && Object.keys(snap).length > 0) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#666').text('Measurements:', left);
      const entries = Object.entries(snap).filter(([, v]) => v !== '' && v != null);
      const cols = 3;
      const colW = pageWidth / cols;
      const startY = doc.y + 2;
      let maxY = startY;
      entries.forEach((e, idx) => {
        const [k, v] = e;
        const col = idx % cols;
        const row = Math.floor(idx / cols);
        const x = left + col * colW;
        const y = startY + row * 14;
        doc.fontSize(9).fillColor('#222');
        doc.text(`${k}: `, x, y, { continued: true, width: colW - 8 });
        doc.fillColor('#000').text(String(v));
        if (y + 14 > maxY) maxY = y + 14;
      });
      doc.y = maxY + 4;
    } else {
      doc.fontSize(8).fillColor('#999').text('(no measurements linked)', left);
    }

    doc.moveDown(0.6);
  }

  // --- Footer (order notes) ----------------------------------------------
  if (order.notes) {
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#666').text('ORDER NOTES', left);
    doc.fontSize(9).fillColor('#222').text(order.notes, left, doc.y, { width: pageWidth });
  }

  // Sign-off row — handy for the tailor to mark completion.
  doc.moveDown(3);
  const sigY = doc.y;
  doc.fontSize(8).fillColor('#666');
  doc.text('Cut by: ____________________', left, sigY);
  doc.text('Stitched by: ____________________', left + pageWidth / 3, sigY);
  doc.text('QC: ____________________', left + (pageWidth * 2) / 3, sigY);

  doc.end();
}
