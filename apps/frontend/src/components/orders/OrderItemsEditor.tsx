// Editable list of order line items (design name, qty, unit price, garment type, notes).
// Pure controlled component: parent owns the array.

import type { Design, Measurement, OrderItemInput } from '../../api/domain';
import { assetUrl } from '../../api/client';
import { rupees, rupeesToCents } from '../../utils/format';

interface Props {
  items: OrderItemInput[];
  onChange: (items: OrderItemInput[]) => void;
  onAddDesign: () => void;
  /**
   * The selected customer's saved measurements. When provided, each row gets a
   * "Use saved measurement" dropdown that snapshots the chosen set onto the
   * order item so the tailor work-order PDF can print it.
   */
  measurements?: Measurement[];
}

export function OrderItemsEditor({ items, onChange, onAddDesign, measurements = [] }: Props) {
  function update(idx: number, patch: Partial<OrderItemInput>) {
    onChange(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function remove(idx: number) {
    onChange(items.filter((_, i) => i !== idx));
  }
  function addCustom() {
    onChange([
      ...items,
      { name: 'Custom item', garmentType: 'custom', qty: 1, unitPriceCents: 0 },
    ]);
  }

  // When the user picks a saved measurement set, copy the id AND a value
  // snapshot onto the item so the work-order PDF can render it without
  // re-fetching, and so historical orders aren't broken if the measurement
  // is later edited or deleted.
  function attachMeasurement(idx: number, measurementId: string) {
    if (!measurementId) {
      update(idx, { measurementId: null, measurementSnapshot: null });
      return;
    }
    const m = measurements.find((x) => x.id === measurementId);
    if (!m) return;
    update(idx, {
      measurementId: m.id,
      measurementSnapshot: { ...m.data },
    });
  }

  const subtotal = items.reduce(
    (acc, it) => acc + (it.qty ?? 1) * (it.unitPriceCents ?? 0),
    0,
  );

  return (
    <div className="order-items-editor">
      <div className="items-head">
        <div>Item</div>
        <div className="num">Qty</div>
        <div className="num">Unit ₹</div>
        <div className="num">Line ₹</div>
        <div />
      </div>

      {items.length === 0 && (
        <div className="muted small pad">No items added yet.</div>
      )}

      {items.map((it, idx) => {
        // Show measurements that either match the item's garment type or are
        // labelled 'custom' (so a generic set is always reachable).
        const candidates = measurements.filter(
          (m) => m.garmentType === (it.garmentType ?? 'custom') || m.garmentType === 'custom',
        );
        const snapKeys = it.measurementSnapshot ? Object.keys(it.measurementSnapshot) : [];
        return (
        <div key={idx} className="item-row">
          <div className="item-main">
            {it.imageUrl ? (
              <img className="item-thumb" src={assetUrl(it.imageUrl)} alt={it.name} />
            ) : (
              <div className="item-thumb image-placeholder">—</div>
            )}
            <div className="item-fields">
              <input
                value={it.name}
                onChange={(e) => update(idx, { name: e.target.value })}
                placeholder="Item name"
              />
              <div className="item-meta-row">
                <select
                  value={it.garmentType ?? 'custom'}
                  onChange={(e) => update(idx, { garmentType: e.target.value })}
                  title="Garment type"
                >
                  <option value="custom">Custom</option>
                  <option value="shirt">Shirt</option>
                  <option value="pant">Pant</option>
                  <option value="kurta">Kurta</option>
                  <option value="blouse">Blouse</option>
                  <option value="salwar">Salwar</option>
                  <option value="lehenga">Lehenga</option>
                  <option value="saree">Saree</option>
                </select>
                <input
                  value={it.notes ?? ''}
                  onChange={(e) => update(idx, { notes: e.target.value })}
                  placeholder="Notes (optional)"
                />
              </div>
              {/* Measurement picker — only renders when the customer has any */}
              {measurements.length > 0 && (
                <div className="item-measurement-row">
                  <label className="muted small">Measurements:</label>
                  <select
                    value={it.measurementId ?? ''}
                    onChange={(e) => attachMeasurement(idx, e.target.value)}
                  >
                    <option value="">— none —</option>
                    {candidates.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label || m.garmentType}
                        {' · '}
                        {Object.keys(m.data).length} field
                        {Object.keys(m.data).length === 1 ? '' : 's'}
                      </option>
                    ))}
                    {candidates.length === 0 && (
                      <option disabled value="__none">
                        (no saved measurements for {it.garmentType ?? 'custom'})
                      </option>
                    )}
                  </select>
                  {snapKeys.length > 0 && (
                    <span className="muted small">
                      {snapKeys.slice(0, 3).join(', ')}
                      {snapKeys.length > 3 ? `, +${snapKeys.length - 3}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="num">
            <input
              type="number"
              min={1}
              value={it.qty ?? 1}
              onChange={(e) => update(idx, { qty: Math.max(1, parseInt(e.target.value || '1', 10)) })}
            />
          </div>
          <div className="num">
            <input
              type="text"
              inputMode="decimal"
              value={((it.unitPriceCents ?? 0) / 100).toString()}
              onChange={(e) => update(idx, { unitPriceCents: rupeesToCents(e.target.value) })}
            />
          </div>
          <div className="num strong">{rupees((it.qty ?? 1) * (it.unitPriceCents ?? 0))}</div>
          <div className="item-remove">
            <button type="button" className="btn-sm danger" onClick={() => remove(idx)}>
              ×
            </button>
          </div>
        </div>
      );
      })}

      <div className="items-actions">
        <button type="button" className="primary" onClick={onAddDesign}>
          + From catalog
        </button>
        <button type="button" className="ghost" onClick={addCustom}>
          + Custom item
        </button>
        <div className="items-subtotal">
          Subtotal <strong>{rupees(subtotal)}</strong>
        </div>
      </div>
    </div>
  );
}

// Convenience: turn a Design into a fresh OrderItemInput.
export function designToItem(d: Design): OrderItemInput {
  return {
    designId: d.id,
    name: d.name,
    imageUrl: d.imageUrl ?? undefined,
    qty: 1,
    unitPriceCents: d.priceCents ?? 0,
    garmentType: 'custom',
  };
}
