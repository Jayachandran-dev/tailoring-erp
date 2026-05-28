// Editable list of order line items (design name, qty, unit price, garment type, notes).
// Pure controlled component: parent owns the array.

import type { Design, OrderItemInput } from '../../api/domain';
import { assetUrl } from '../../api/client';
import { rupees, rupeesToCents } from '../../utils/format';

interface Props {
  items: OrderItemInput[];
  onChange: (items: OrderItemInput[]) => void;
  onAddDesign: () => void;
}

export function OrderItemsEditor({ items, onChange, onAddDesign }: Props) {
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

      {items.map((it, idx) => (
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
      ))}

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
