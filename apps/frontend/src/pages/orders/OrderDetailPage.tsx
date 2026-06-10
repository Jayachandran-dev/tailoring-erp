// Order detail. Shows summary, items, payment ledger, status timeline,
// and action bar (advance status, add payment, edit, delete, print invoice).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ordersApi,
  upiAccountsApi,
  type Order,
  type OrderStatus,
  type PaymentMethod,
  type UpiAccount,
} from '../../api/domain';
import { ApiError, assetUrl } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { StatusBadge, PriorityBadge } from '../../components/StatusBadge';
import { UpiQrPreview } from '../../components/payments/UpiQrPreview';
import { Icon } from '../../components/Icon';
import { ShareOrderMenu } from '../../components/orders/ShareOrderMenu';
import { PdfViewerModal } from '../../components/PdfViewerModal';
import { rupees, rupeesToCents, shortDate, shortDateTime, signedRupees } from '../../utils/format';

const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['READY', 'PENDING', 'CANCELLED'],
  READY: ['DELIVERED', 'IN_PROGRESS', 'CANCELLED'],
  DELIVERED: [],
  CANCELLED: ['PENDING'],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Mark pending',
  IN_PROGRESS: 'Start',
  READY: 'Mark ready',
  DELIVERED: 'Deliver',
  CANCELLED: 'Cancel',
};

export function OrderDetailPage() {
  const { id = '' } = useParams();
  const { session } = useAuth();
  const nav = useNavigate();

  const ctx = useMemo(
    () => (session ? { token: session.token, tenantId: session.tenant.id } : null),
    [session],
  );

  const [order, setOrder] = useState<Order | null>(null);
  const [upiAccounts, setUpiAccounts] = useState<UpiAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [payOpen, setPayOpen] = useState<'payment' | 'refund' | null>(null);
  const [delOpen, setDelOpen] = useState(false);
  // Invoice PDF preview dialog state — fetched lazily on first open.
  const [pdfOpen, setPdfOpen] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfShareUrl, setPdfShareUrl] = useState<string | null>(null);
  const [pdfKind, setPdfKind] = useState<'invoice' | 'work-order'>('invoice');

  const load = useCallback(async () => {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    try {
      setOrder(await ordersApi.get(ctx, id));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [ctx, id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Load UPI accounts once for the payment dialog (active ones only).
  useEffect(() => {
    if (!ctx) return;
    upiAccountsApi
      .list(ctx)
      .then((all) => setUpiAccounts(all.filter((a) => a.isActive)))
      .catch(() => { /* non-fatal: payment form falls back to manual UPI */ });
  }, [ctx]);

  async function changeStatus(to: OrderStatus) {
    if (!ctx || !order) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await ordersApi.setStatus(ctx, order.id, to);
      setOrder(updated);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update status');
    } finally {
      setBusy(false);
    }
  }

  async function deleteOrder() {
    if (!ctx || !order) return;
    setBusy(true);
    try {
      await ordersApi.remove(ctx, order.id);
      nav('/orders');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete');
      setBusy(false);
    }
  }

  async function removePayment(pid: string) {
    if (!ctx || !order) return;
    if (!confirm('Remove this payment?')) return;
    try {
      setOrder(await ordersApi.removePayment(ctx, order.id, pid));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to remove payment');
    }
  }

  // Open the invoice in our in-app PDF dialog (preview + download + share).
  // We fetch the PDF bytes ourselves so the X-Tenant-Id header is sent —
  // tenantContext middleware requires it for every authed request — then mint
  // an object URL inside the modal. The current active share link (if any)
  // is loaded in parallel so the Share buttons inside the dialog work.
  async function openInvoice() {
    if (!ctx || !order) return;
    setBusy(true);
    setError(null);
    setPdfBlob(null);
    setPdfShareUrl(null);
    setPdfKind('invoice');
    setPdfOpen(true);
    try {
      const [blob, link] = await Promise.all([
        ordersApi.invoicePdf(ctx, order.id),
        ordersApi.getShareLink(ctx, order.id).catch(() => null),
      ]);
      setPdfBlob(blob);
      setPdfShareUrl(link?.url ?? null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate invoice');
      setPdfOpen(false);
    } finally {
      setBusy(false);
    }
  }

  // Tailor-facing work order: no prices, includes measurements.
  async function openWorkOrder() {
    if (!ctx || !order) return;
    setBusy(true);
    setError(null);
    setPdfBlob(null);
    setPdfShareUrl(null); // tailor copy never gets the customer share link
    setPdfKind('work-order');
    setPdfOpen(true);
    try {
      const blob = await ordersApi.workOrderPdf(ctx, order.id);
      setPdfBlob(blob);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to generate work order');
      setPdfOpen(false);
    } finally {
      setBusy(false);
    }
  }

  function closeInvoice() {
    setPdfOpen(false);
    // Drop the blob so memory can be reclaimed; URL is revoked inside the modal.
    setPdfBlob(null);
  }

  if (loading) return <p className="muted">Loading…</p>;
  if (error && !order) return <div className="error">{error}</div>;
  if (!order) return null;

  // balance > 0 → customer still owes us; balance < 0 → we owe the customer a refund.
  const balance = order.totalCents - order.paidCents;
  const overpaid = balance < 0 ? -balance : 0;
  const collected = order.payments
    .filter((p) => p.amountCents > 0)
    .reduce((a, p) => a + p.amountCents, 0);
  const refunded = order.payments
    .filter((p) => p.amountCents < 0)
    .reduce((a, p) => a + -p.amountCents, 0);
  const subtotal = order.items.reduce((a, it) => a + it.qty * it.unitPriceCents, 0);

  return (
    <>
      <PageHeader
        title={
          <>
            {order.orderNumber ?? `Order ${order.id.slice(0, 8)}`}{' '}
            <StatusBadge status={order.status} />{' '}
            {order.priority !== 'NORMAL' && <PriorityBadge priority={order.priority} />}
          </>
        }
        subtitle={`Created ${shortDateTime(order.createdAt)}`}
        actions={
          <>
            <button type="button" className="ghost" onClick={openInvoice} disabled={busy}>
              <Icon name="file-text" size={16} />
              <span>Invoice (PDF)</span>
            </button>
            <button type="button" className="ghost" onClick={openWorkOrder} disabled={busy}>
              <Icon name="file-text" size={16} />
              <span>Work order</span>
            </button>
            <button type="button" className="ghost" onClick={() => window.print()}>
              <Icon name="printer" size={16} />
              <span>Print</span>
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => setDelOpen(true)}
              disabled={busy}
            >
              Delete
            </button>
          </>
        }
      />

      {error && <div className="error">{error}</div>}

      {/* Quick action bar */}
      <div className="status-bar card" data-print-hide>
        <span className="muted small">Move to:</span>
        {NEXT_STATUS[order.status].length === 0 && (
          <span className="muted">No further transitions.</span>
        )}
        {NEXT_STATUS[order.status].map((s) => (
          <button
            key={s}
            type="button"
            className={
              s === 'DELIVERED' ? 'primary' : s === 'CANCELLED' ? 'danger' : 'default'
            }
            onClick={() => changeStatus(s)}
            disabled={busy}
          >
            {STATUS_LABEL[s]}
          </button>
        ))}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {balance > 0 && order.status !== 'CANCELLED' && (
            <button
              type="button"
              className="primary"
              onClick={() => setPayOpen('payment')}
            >
              + Record payment
            </button>
          )}
          {overpaid > 0 && (
            <button
              type="button"
              className="warn"
              onClick={() => setPayOpen('refund')}
              title={`Overpaid by ${rupees(overpaid)}`}
            >
              ↺ Record refund
            </button>
          )}
        </div>
      </div>

      {overpaid > 0 && (
        <div className="banner warn" data-print-hide>
          <strong>Overpaid by {rupees(overpaid)}.</strong> Use “Record refund” to return the extra to the customer.
        </div>
      )}

      {/* Customer-facing share link (WhatsApp / copy / preview / revoke) */}
      {ctx && order.customer && (
        <div data-print-hide>
          <ShareOrderMenu
            ctx={ctx}
            orderId={order.id}
            orderNumber={order.orderNumber}
            customerName={order.customer.name}
            customerMobile={order.customer.mobile}
            status={order.status}
            businessName={session?.tenant.name ?? 'your tailor'}
          />
        </div>
      )}

      <div className="order-grid">
        {/* Customer card */}
        <section className="card">
          <div className="muted small">Customer</div>
          <div className="customer-picked" style={{ background: 'transparent', padding: 0, border: 'none' }}>
            <div className="avatar md">
              {order.customer?.imageUrl ? (
                <img src={assetUrl(order.customer.imageUrl)} alt={order.customer.name} />
              ) : (
                <span>{(order.customer?.name ?? '?').slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            <div className="grow">
              <strong>{order.customer?.name ?? '—'}</strong>
              <div className="muted small">{order.customer?.mobile ?? '—'}</div>
            </div>
          </div>
          {order.notes && (
            <>
              <div className="muted small" style={{ marginTop: 12 }}>Notes</div>
              <p style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{order.notes}</p>
            </>
          )}
          <div className="meta-grid" style={{ marginTop: 12 }}>
            <div>
              <span className="muted small">Due</span>
              <strong>{shortDate(order.dueDate)}</strong>
            </div>
            <div>
              <span className="muted small">Delivered</span>
              <strong>{shortDate(order.deliveredAt)}</strong>
            </div>
            <div>
              <span className="muted small">Items</span>
              <strong>{order.items.length}</strong>
            </div>
          </div>
        </section>

        {/* Totals card */}
        <section className="card totals-card">
          <div className="totals-grid">
            <div>
              <span className="muted small">Subtotal</span>
              <strong>{rupees(subtotal)}</strong>
            </div>
            <div>
              <span className="muted small">Discount</span>
              <strong>− {rupees(order.discountCents)}</strong>
            </div>
            <div>
              <span className="muted small">Total</span>
              <strong className="big">{rupees(order.totalCents)}</strong>
            </div>
            <div>
              <span className="muted small">Collected</span>
              <strong>{rupees(collected)}</strong>
            </div>
            {refunded > 0 && (
              <div>
                <span className="muted small">Refunded</span>
                <strong className="refund">− {rupees(refunded)}</strong>
              </div>
            )}
            <div>
              <span className="muted small">Net paid</span>
              <strong>{rupees(order.paidCents)}</strong>
            </div>
            <div>
              <span className="muted small">{balance >= 0 ? 'Balance' : 'Overpaid'}</span>
              <strong className={`big ${balance > 0 ? 'balance' : balance < 0 ? 'refund' : 'paid'}`}>
                {rupees(Math.abs(balance))}
              </strong>
            </div>
          </div>
        </section>

        {/* Items table */}
        <section className="card span-2">
          <h3>Items</h3>
          <table className="lite-table">
            <thead>
              <tr>
                <th></th>
                <th>Item</th>
                <th>Garment</th>
                <th className="num">Qty</th>
                <th className="num">Unit</th>
                <th className="num">Line</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((it) => (
                <tr key={it.id}>
                  <td>
                    {it.imageUrl ? (
                      <img className="item-thumb sm" src={assetUrl(it.imageUrl)} alt={it.name} />
                    ) : (
                      <div className="item-thumb sm image-placeholder">—</div>
                    )}
                  </td>
                  <td>
                    <strong>{it.name}</strong>
                    {it.notes && <div className="muted small">{it.notes}</div>}
                  </td>
                  <td>{it.garmentType}</td>
                  <td className="num">{it.qty}</td>
                  <td className="num">{rupees(it.unitPriceCents)}</td>
                  <td className="num strong">{rupees(it.qty * it.unitPriceCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Payments */}
        <section className="card">
          <h3>Payments</h3>
          {order.payments.length === 0 ? (
            <p className="muted small">No payments yet.</p>
          ) : (
            <ul className="payment-list">
              {order.payments.map((p) => {
                const isRefund = p.amountCents < 0;
                return (
                <li key={p.id} className={isRefund ? 'is-refund' : undefined}>
                  <div>
                    <strong className={isRefund ? 'refund' : undefined}>
                      {signedRupees(p.amountCents)}
                      {isRefund && <span className="pill refund-pill">REFUND</span>}
                    </strong>
                    <div className="muted small">
                      {p.method}
                      {p.upiAccount && <> · <span title={p.upiAccount.upiId}>{p.upiAccount.label}</span></>}
                      {' · '}{shortDateTime(p.paidAt)}
                      {p.reference ? ` · ${p.reference}` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn-sm danger"
                    onClick={() => removePayment(p.id)}
                    data-print-hide
                  >
                    ×
                  </button>
                </li>
              );})}
            </ul>
          )}
        </section>

        {/* Timeline */}
        <section className="card">
          <h3>Timeline</h3>
          <ol className="timeline">
            {order.history.map((h) => (
              <li key={h.id}>
                <div className="timeline-dot" />
                <div>
                  <strong>
                    {h.fromStatus ? `${h.fromStatus} → ` : ''}
                    {h.toStatus}
                  </strong>
                  <div className="muted small">{shortDateTime(h.changedAt)}</div>
                  {h.note && <div className="small">{h.note}</div>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Modal
        open={payOpen !== null}
        onClose={() => setPayOpen(null)}
        title={payOpen === 'refund' ? 'Record refund' : 'Record payment'}
        size={payOpen === 'payment' ? 'md' : 'sm'}
      >
        {payOpen && (
          <PaymentForm
            mode={payOpen}
            balance={balance}
            refundable={collected - refunded}
            upiAccounts={upiAccounts}
            orderNumber={order.orderNumber ?? order.id.slice(0, 8)}
            customerName={order.customer?.name ?? ''}
            onCancel={() => setPayOpen(null)}
            onSubmit={async (input) => {
              if (!ctx) return;
              const updated = await ordersApi.addPayment(ctx, order.id, input);
              setOrder(updated);
              setPayOpen(null);
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={delOpen}
        title="Delete order?"
        message={
          <>
            Order <strong>{order.orderNumber}</strong> and all its payments and history will be
            permanently deleted.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setDelOpen(false)}
        onConfirm={deleteOrder}
      />

      <PdfViewerModal
        open={pdfOpen}
        onClose={closeInvoice}
        title={
          pdfKind === 'invoice'
            ? `Invoice — ${order.orderNumber ?? ''}`
            : `Work order — ${order.orderNumber ?? ''}`
        }
        blob={pdfBlob}
        filename={`${pdfKind === 'invoice' ? 'invoice' : 'work-order'}-${(order.orderNumber ?? 'order').replace(/[^\w.-]+/g, '_')}.pdf`}
        shareUrl={pdfKind === 'invoice' ? pdfShareUrl : null}
        shareToPhone={order.customer?.mobile ?? null}
        shareMessage={`Hi ${order.customer?.name ?? ''}, here is your invoice for order ${order.orderNumber ?? ''}.`}
      />
    </>
  );
}

// Inline payment / refund form
function PaymentForm({
  mode,
  balance,
  refundable,
  upiAccounts,
  orderNumber,
  customerName,
  onSubmit,
  onCancel,
}: {
  mode: 'payment' | 'refund';
  /** Outstanding balance in cents (can be negative if overpaid). */
  balance: number;
  /** Maximum refundable cents = collected − already refunded. */
  refundable: number;
  upiAccounts: UpiAccount[];
  orderNumber: string;
  customerName: string;
  onSubmit: (input: {
    amountCents: number;
    method: PaymentMethod;
    reference: string | null;
    upiAccountId?: string | null;
  }) => Promise<void>;
  onCancel: () => void;
}) {
  const isRefund = mode === 'refund';
  const suggestedCents = isRefund
    ? Math.max(0, balance < 0 ? -balance : 0) || refundable
    : Math.max(0, balance);
  const [amount, setAmount] = useState((suggestedCents / 100).toString());
  const [method, setMethod] = useState<PaymentMethod>(
    !isRefund && upiAccounts.length > 0 ? 'UPI' : 'CASH',
  );
  const defaultUpi = upiAccounts.find((a) => a.isDefault) ?? upiAccounts[0] ?? null;
  const [upiAccountId, setUpiAccountId] = useState<string>(defaultUpi?.id ?? '');
  const [reference, setReference] = useState('');
  const [verified, setVerified] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isUpiPayment = !isRefund && method === 'UPI';
  const selectedUpi = upiAccounts.find((a) => a.id === upiAccountId) ?? null;
  const amountRupees = Number(amount) || 0;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const cents = rupeesToCents(amount);
    if (cents <= 0) {
      setErr('Enter a positive amount.');
      return;
    }
    if (isRefund && cents > refundable) {
      setErr(`Refund cannot exceed ${rupees(refundable)} (already collected).`);
      return;
    }
    if (isUpiPayment && selectedUpi && !verified) {
      setErr('Please confirm that the customer has paid and the amount is in your UPI app.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({
        amountCents: isRefund ? -cents : cents,
        method,
        reference: reference.trim() || null,
        upiAccountId: isUpiPayment ? upiAccountId || null : null,
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : `Failed to record ${mode}`);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>{isRefund ? 'Refund amount (₹)' : 'Amount (₹)'}</label>
      <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus />
      <p className="muted small" style={{ margin: '-4px 0 8px' }}>
        {isRefund
          ? <>Max refundable: <strong>{rupees(refundable)}</strong>{balance < 0 && <> · Overpaid by <strong>{rupees(-balance)}</strong></>}</>
          : <>Balance due: {rupees(Math.max(0, balance))}</>}
      </p>

      <label>Method</label>
      <select
        value={method}
        onChange={(e) => { setMethod(e.target.value as PaymentMethod); setVerified(false); }}
      >
        <option value="CASH">Cash</option>
        <option value="UPI">UPI</option>
        <option value="CARD">Card</option>
        <option value="BANK">Bank transfer</option>
        <option value="OTHER">Other</option>
      </select>

      {isUpiPayment && (
        <div className="upi-payment-block">
          {upiAccounts.length === 0 ? (
            <div className="banner warn">
              No UPI accounts configured yet. Go to <strong>Settings → Payment settings</strong> to
              add one and enable QR scan checkout.
            </div>
          ) : (
            <>
              <label>Receive into</label>
              <select
                value={upiAccountId}
                onChange={(e) => { setUpiAccountId(e.target.value); setVerified(false); }}
              >
                {upiAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.label} · {a.upiId}{a.isDefault ? '  (default)' : ''}
                  </option>
                ))}
              </select>

              {selectedUpi && (
                <div className="upi-scan-card">
                  <UpiQrPreview
                    upiId={selectedUpi.upiId}
                    payeeName={selectedUpi.payeeName ?? selectedUpi.label}
                    amount={amountRupees > 0 ? amountRupees : undefined}
                    note={`${orderNumber}${customerName ? ' · ' + customerName : ''}`}
                    size={180}
                  />
                  <div className="upi-scan-info">
                    <strong>Ask the customer to scan</strong>
                    <div className="muted small">
                      Paying <strong>{selectedUpi.label}</strong> · {selectedUpi.upiId}
                    </div>
                    <div className="muted small">
                      Amount {amountRupees > 0 ? <strong>{rupees(rupeesToCents(amount))}</strong> : '—'} · Any UPI app works
                    </div>
                    <label className="check" style={{ marginTop: 8 }}>
                      <input
                        type="checkbox"
                        checked={verified}
                        onChange={(e) => setVerified(e.target.checked)}
                      />
                      <span>I have verified the payment in my UPI app</span>
                    </label>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <label>{isUpiPayment ? 'UPI txn id (optional)' : 'Reference (optional)'}</label>
      <input
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        placeholder={isUpiPayment ? 'Last 4 digits or full UTR' : 'Txn id, cheque #, etc.'}
      />

      {err && <div className="error">{err}</div>}

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className={isRefund ? 'warn' : 'primary'} disabled={submitting}>
          {submitting ? 'Saving…' : isRefund ? 'Issue refund' : 'Add payment'}
        </button>
      </div>
    </form>
  );
}
