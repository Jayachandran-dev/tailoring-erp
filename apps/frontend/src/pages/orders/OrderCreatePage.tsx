// Order create page. Single-page form with sections:
//  1) Customer (search + pick existing, or link out to create)
//  2) Items   (catalog picker + custom + qty/price grid)
//  3) Pricing (discount, due date, priority, advance payment, notes)
// Server computes the order number and authoritative totals.

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  ordersApi,
  type Customer,
  type OrderCreateInput,
  type OrderItemInput,
  type OrderPriority,
  type PaymentMethod,
} from '../../api/domain';
import { ApiError } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { CustomerPicker } from '../../components/orders/CustomerPicker';
import { DesignPicker } from '../../components/orders/DesignPicker';
import {
  OrderItemsEditor,
  designToItem,
} from '../../components/orders/OrderItemsEditor';
import { rupees, rupeesToCents, dateInputValue } from '../../utils/format';

export function OrderCreatePage() {
  const { session } = useAuth();
  const nav = useNavigate();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [items, setItems] = useState<OrderItemInput[]>([]);
  const [discountRupees, setDiscountRupees] = useState('');
  const [priority, setPriority] = useState<OrderPriority>('NORMAL');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [advanceRupees, setAdvanceRupees] = useState('');
  const [advanceMethod, setAdvanceMethod] = useState<PaymentMethod>('CASH');

  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subtotal = items.reduce(
    (acc, it) => acc + (it.qty ?? 1) * (it.unitPriceCents ?? 0),
    0,
  );
  const discountCents = rupeesToCents(discountRupees);
  const total = Math.max(0, subtotal - discountCents);
  const advanceCents = rupeesToCents(advanceRupees);
  const balance = Math.max(0, total - advanceCents);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!session) return;
    if (!customer) {
      setError('Pick a customer first.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one item.');
      return;
    }
    if (items.some((it) => !it.name?.trim())) {
      setError('Every item needs a name.');
      return;
    }
    if (advanceCents > total) {
      setError('Advance cannot exceed the order total.');
      return;
    }

    setSaving(true);
    try {
      const body: OrderCreateInput = {
        customerId: customer.id,
        items,
        discountCents,
        priority,
        notes: notes.trim() || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        ...(advanceCents > 0
          ? { advance: { amountCents: advanceCents, method: advanceMethod } }
          : {}),
      };
      const order = await ordersApi.create(
        { token: session.token, tenantId: session.tenant.id },
        body,
      );
      nav(`/orders/${order.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to create order');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="New order"
        subtitle="Customer · items · pricing"
        actions={
          <button type="button" className="ghost" onClick={() => nav('/orders')}>
            Cancel
          </button>
        }
      />

      <form className="form order-form" onSubmit={save}>
        <section className="card">
          <h3>Customer</h3>
          <CustomerPicker value={customer} onChange={setCustomer} />
        </section>

        <section className="card">
          <h3>Items</h3>
          <OrderItemsEditor
            items={items}
            onChange={setItems}
            onAddDesign={() => setPickerOpen(true)}
          />
        </section>

        <section className="card">
          <h3>Pricing & schedule</h3>
          <div className="form-row">
            <div>
              <label>Discount (₹)</label>
              <input
                inputMode="decimal"
                value={discountRupees}
                onChange={(e) => setDiscountRupees(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label>Priority</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as OrderPriority)}
              >
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select>
            </div>
            <div>
              <label>Due date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                min={dateInputValue(new Date())}
              />
            </div>
          </div>

          <label>Notes</label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Special instructions, fabric details, etc."
          />

          <div className="form-row" style={{ marginTop: 8 }}>
            <div>
              <label>Advance payment (₹)</label>
              <input
                inputMode="decimal"
                value={advanceRupees}
                onChange={(e) => setAdvanceRupees(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <label>Method</label>
              <select
                value={advanceMethod}
                onChange={(e) => setAdvanceMethod(e.target.value as PaymentMethod)}
              >
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK">Bank</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
        </section>

        <section className="card totals-card">
          <div className="totals-grid">
            <div>
              <span className="muted small">Subtotal</span>
              <strong>{rupees(subtotal)}</strong>
            </div>
            <div>
              <span className="muted small">Discount</span>
              <strong>− {rupees(discountCents)}</strong>
            </div>
            <div>
              <span className="muted small">Total</span>
              <strong className="big">{rupees(total)}</strong>
            </div>
            <div>
              <span className="muted small">Advance</span>
              <strong>{rupees(advanceCents)}</strong>
            </div>
            <div>
              <span className="muted small">Balance</span>
              <strong className="big balance">{rupees(balance)}</strong>
            </div>
          </div>
        </section>

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => nav('/orders')} disabled={saving}>
            Cancel
          </button>
          <button
            type="submit"
            className="primary"
            disabled={saving || !customer || items.length === 0}
          >
            {saving ? 'Creating…' : 'Create order'}
          </button>
        </div>
      </form>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        title="Pick a design"
        size="lg"
      >
        <DesignPicker
          onPick={(d) => setItems((prev) => [...prev, designToItem(d)])}
          onClose={() => setPickerOpen(false)}
        />
      </Modal>
    </>
  );
}
