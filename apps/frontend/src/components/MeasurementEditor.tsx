// Measurement editor.
// - Pick a garment type → preset field list
// - Edit values (string or number) per field
// - Add custom fields ad-hoc
// - "Custom" garment type starts with no preset fields

import { useEffect, useState } from 'react';

export interface MeasurementValue {
  garmentType: string;
  label?: string | null;
  data: Record<string, string | number>;
}

interface Preset {
  type: string;
  label: string;
  fields: string[];
}

// Common tailoring measurement presets (cm). Shops can add custom fields too.
const PRESETS: Preset[] = [
  {
    type: 'shirt',
    label: 'Shirt',
    fields: ['Chest', 'Shoulder', 'Sleeve Length', 'Sleeve Round', 'Neck', 'Length', 'Waist'],
  },
  {
    type: 'pant',
    label: 'Pant / Trouser',
    fields: ['Waist', 'Hip', 'Thigh', 'Knee', 'Bottom', 'Length', 'Inseam'],
  },
  {
    type: 'kurta',
    label: 'Kurta',
    fields: ['Chest', 'Shoulder', 'Sleeve Length', 'Sleeve Round', 'Neck', 'Length', 'Bottom'],
  },
  {
    type: 'blouse',
    label: 'Blouse',
    fields: ['Bust', 'Waist', 'Shoulder', 'Sleeve Length', 'Sleeve Round', 'Front Neck', 'Back Neck', 'Length'],
  },
  {
    type: 'salwar',
    label: 'Salwar / Churidar',
    fields: ['Waist', 'Hip', 'Thigh', 'Knee', 'Bottom', 'Length', 'Inseam'],
  },
  {
    type: 'frock',
    label: 'Frock / Dress',
    fields: ['Bust', 'Waist', 'Hip', 'Shoulder', 'Sleeve Length', 'Length'],
  },
  {
    type: 'custom',
    label: 'Custom',
    fields: [],
  },
];

interface Props {
  value: MeasurementValue;
  onChange: (v: MeasurementValue) => void;
}

export function MeasurementEditor({ value, onChange }: Props) {
  const [newField, setNewField] = useState('');

  const preset = PRESETS.find((p) => p.type === value.garmentType) ?? PRESETS[PRESETS.length - 1];

  // Ensure preset fields exist in data when type changes (don't clobber existing values).
  useEffect(() => {
    const merged: Record<string, string | number> = {};
    for (const f of preset.fields) merged[f] = value.data[f] ?? '';
    for (const [k, v] of Object.entries(value.data)) merged[k] = v;
    if (JSON.stringify(merged) !== JSON.stringify(value.data)) {
      onChange({ ...value, data: merged });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.garmentType]);

  function setField(name: string, raw: string) {
    const next = { ...value.data };
    next[name] = raw;
    onChange({ ...value, data: next });
  }

  function removeField(name: string) {
    const next = { ...value.data };
    delete next[name];
    onChange({ ...value, data: next });
  }

  function addCustomField() {
    const name = newField.trim();
    if (!name) return;
    if (value.data[name] !== undefined) return;
    onChange({ ...value, data: { ...value.data, [name]: '' } });
    setNewField('');
  }

  const fieldNames = Object.keys(value.data);

  return (
    <div className="measurement-editor">
      <div className="form-row">
        <div>
          <label>Garment</label>
          <select
            value={value.garmentType}
            onChange={(e) => onChange({ ...value, garmentType: e.target.value })}
          >
            {PRESETS.map((p) => (
              <option key={p.type} value={p.type}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Label (optional)</label>
          <input
            value={value.label ?? ''}
            onChange={(e) => onChange({ ...value, label: e.target.value })}
            placeholder="e.g. Wedding shirt"
          />
        </div>
      </div>

      <div className="measurement-grid">
        {fieldNames.length === 0 && (
          <p className="muted">No fields yet — add measurement fields below.</p>
        )}
        {fieldNames.map((name) => (
          <div key={name} className="measurement-field">
            <label>{name}</label>
            <div className="measurement-field-row">
              <input
                inputMode="decimal"
                value={String(value.data[name] ?? '')}
                onChange={(e) => setField(name, e.target.value)}
                placeholder="cm"
              />
              <button
                type="button"
                className="btn-sm danger"
                onClick={() => removeField(name)}
                title="Remove field"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="form-row">
        <div style={{ flex: 1 }}>
          <label>Add custom field</label>
          <input
            value={newField}
            onChange={(e) => setNewField(e.target.value)}
            placeholder="e.g. Cuff Round"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addCustomField();
              }
            }}
          />
        </div>
        <div style={{ alignSelf: 'flex-end' }}>
          <button type="button" className="btn-sm primary" onClick={addCustomField}>
            Add field
          </button>
        </div>
      </div>
    </div>
  );
}
