// Create-or-edit page for customers. Single component handles both modes.
//
// New mode: collects all fields + an OPTIONAL image + an OPTIONAL initial measurement.
// On submit:
//   1. POST /customers — creates the row, gets {id}
//   2. If a pending image was picked → POST /customers/:id/image
//   3. If a measurement was filled in → POST /customers/:id/measurements
//
// Edit mode: PATCH /customers/:id and (if image changed) upload separately.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { customersApi, measurementsApi, type Customer } from '../../api/domain';
import { ApiError } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { ImageUpload } from '../../components/ImageUpload';
import { MeasurementEditor, type MeasurementValue } from '../../components/MeasurementEditor';

interface FormState {
  name: string;
  mobile: string;
  email: string;
  address: string;
  gender: '' | 'male' | 'female' | 'other';
  notes: string;
}

const EMPTY: FormState = { name: '', mobile: '', email: '', address: '', gender: '', notes: '' };

export function CustomerFormPage({ mode }: { mode: 'new' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const nav = useNavigate();

  const [form, setForm] = useState<FormState>(EMPTY);
  const [storedImage, setStoredImage] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [removeStoredImage, setRemoveStoredImage] = useState(false);
  const [measurement, setMeasurement] = useState<MeasurementValue>({
    garmentType: 'shirt',
    label: '',
    data: {},
  });
  const [includeMeasurement, setIncludeMeasurement] = useState(false);

  const [loading, setLoading] = useState(mode === 'edit');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (mode !== 'edit' || !session || !id) return;
    setLoading(true);
    customersApi
      .get({ token: session.token, tenantId: session.tenant.id }, id)
      .then((c) => {
        setForm({
          name: c.name,
          mobile: c.mobile ?? '',
          email: c.email ?? '',
          address: c.address ?? '',
          gender: (c.gender ?? '') as FormState['gender'],
          notes: c.notes ?? '',
        });
        setStoredImage(c.imageUrl);
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load customer'),
      )
      .finally(() => setLoading(false));
  }, [mode, id, session]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setError(null);
    setSaving(true);
    const ctx = { token: session.token, tenantId: session.tenant.id };
    const payload = {
      name: form.name.trim(),
      mobile: form.mobile.trim() || null,
      email: form.email.trim() || null,
      address: form.address.trim() || null,
      gender: form.gender || null,
      notes: form.notes.trim() || null,
    };

    try {
      let saved: Customer;
      if (mode === 'new') {
        saved = await customersApi.create(ctx, payload);
      } else {
        saved = await customersApi.update(ctx, id!, payload);
        if (removeStoredImage && storedImage && !pendingImage) {
          await customersApi.removeImage(ctx, saved.id);
        }
      }

      if (pendingImage) {
        await customersApi.uploadImage(ctx, saved.id, pendingImage);
      }

      if (mode === 'new' && includeMeasurement && Object.keys(measurement.data).length > 0) {
        // Drop empty values
        const cleaned: Record<string, string | number> = {};
        for (const [k, v] of Object.entries(measurement.data)) {
          if (v === '' || v === null || v === undefined) continue;
          cleaned[k] = v;
        }
        if (Object.keys(cleaned).length > 0) {
          await measurementsApi.create(ctx, saved.id, {
            garmentType: measurement.garmentType,
            label: measurement.label || null,
            data: cleaned,
          });
        }
      }

      nav(`/customers/${saved.id}`, { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  if (!session) return null;
  if (loading) return <p className="muted">Loading…</p>;

  return (
    <>
      <PageHeader
        title={mode === 'new' ? 'New customer' : 'Edit customer'}
        back={mode === 'new' ? '/customers' : `/customers/${id}`}
      />

      <form className="card form" onSubmit={submit}>
        <div className="customer-form-top">
          <div className="customer-form-fields">
            <div className="form-row">
              <div>
                <label>Name *</label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div>
                <label>Mobile</label>
                <input
                  inputMode="tel"
                  value={form.mobile}
                  onChange={(e) => setForm({ ...form, mobile: e.target.value })}
                />
              </div>
            </div>

            <div className="form-row">
              <div>
                <label>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
              <div>
                <label>Gender</label>
                <select
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value as FormState['gender'] })}
                >
                  <option value="">—</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
          </div>

          <ImageUpload
            value={removeStoredImage ? null : storedImage}
            pendingFile={pendingImage}
            onSelect={(f) => {
              setPendingImage(f);
              if (f === null) setRemoveStoredImage(true);
              else setRemoveStoredImage(false);
            }}
            onRemove={() => setRemoveStoredImage(true)}
            disabled={saving}
          />
        </div>

        <label>Address</label>
        <textarea
          rows={2}
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
        />

        <label>Notes</label>
        <textarea
          rows={2}
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />

        {mode === 'new' && (
          <div className="section">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={includeMeasurement}
                onChange={(e) => setIncludeMeasurement(e.target.checked)}
              />
              <span>Add measurements now</span>
            </label>
            {includeMeasurement && (
              <MeasurementEditor value={measurement} onChange={setMeasurement} />
            )}
          </div>
        )}

        {error && <div className="error">{error}</div>}

        <div className="form-actions">
          <button type="button" className="ghost" onClick={() => nav(-1)} disabled={saving}>
            Cancel
          </button>
          <button type="submit" className="primary" disabled={saving || !form.name.trim()}>
            {saving ? 'Saving…' : mode === 'new' ? 'Create customer' : 'Save changes'}
          </button>
        </div>
      </form>
    </>
  );
}
