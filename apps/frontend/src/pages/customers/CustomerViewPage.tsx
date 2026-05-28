// Customer detail page: profile card + measurements list with inline add/edit/delete.

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import {
  customersApi,
  measurementsApi,
  type CustomerWithMeasurements,
  type Measurement,
} from '../../api/domain';
import { ApiError, assetUrl } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import {
  MeasurementEditor,
  type MeasurementValue,
} from '../../components/MeasurementEditor';
import { ConfirmDialog } from '../../components/ConfirmDialog';

export function CustomerViewPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const nav = useNavigate();
  const [customer, setCustomer] = useState<CustomerWithMeasurements | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Measurement | 'new' | null>(null);
  const [draft, setDraft] = useState<MeasurementValue>({
    garmentType: 'shirt',
    label: '',
    data: {},
  });
  const [savingM, setSavingM] = useState(false);
  const [toDeleteM, setToDeleteM] = useState<Measurement | null>(null);
  const [toDeleteCustomer, setToDeleteCustomer] = useState(false);

  async function load() {
    if (!session || !id) return;
    setLoading(true);
    setError(null);
    try {
      const c = await customersApi.get(
        { token: session.token, tenantId: session.tenant.id },
        id,
      );
      setCustomer(c);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function startNew() {
    setDraft({ garmentType: 'shirt', label: '', data: {} });
    setEditing('new');
  }
  function startEdit(m: Measurement) {
    setDraft({ garmentType: m.garmentType, label: m.label ?? '', data: { ...m.data } });
    setEditing(m);
  }

  async function saveMeasurement() {
    if (!session || !customer) return;
    setSavingM(true);
    setError(null);
    try {
      const ctx = { token: session.token, tenantId: session.tenant.id };
      const cleaned: Record<string, string | number> = {};
      for (const [k, v] of Object.entries(draft.data)) {
        if (v === '' || v === null || v === undefined) continue;
        cleaned[k] = v;
      }
      if (editing === 'new') {
        await measurementsApi.create(ctx, customer.id, {
          garmentType: draft.garmentType,
          label: draft.label || null,
          data: cleaned,
        });
      } else if (editing) {
        await measurementsApi.update(ctx, customer.id, editing.id, {
          garmentType: draft.garmentType,
          label: draft.label || null,
          data: cleaned,
        });
      }
      setEditing(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save measurement');
    } finally {
      setSavingM(false);
    }
  }

  async function confirmDeleteMeasurement() {
    if (!session || !customer || !toDeleteM) return;
    try {
      await measurementsApi.remove(
        { token: session.token, tenantId: session.tenant.id },
        customer.id,
        toDeleteM.id,
      );
      setToDeleteM(null);
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete');
    }
  }

  async function confirmDeleteCustomer() {
    if (!session || !customer) return;
    try {
      await customersApi.remove(
        { token: session.token, tenantId: session.tenant.id },
        customer.id,
      );
      nav('/customers', { replace: true });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete customer');
    }
  }

  if (!session) return null;
  if (loading) return <p className="muted">Loading…</p>;
  if (!customer) return <p className="error">{error ?? 'Not found'}</p>;

  return (
    <>
      <PageHeader
        title={customer.name}
        subtitle={customer.mobile ?? undefined}
        back="/customers"
        actions={
          <>
            <button
              type="button"
              className="primary"
              onClick={() => nav(`/customers/${customer.id}/edit`)}
            >
              Edit
            </button>
            <button type="button" className="danger" onClick={() => setToDeleteCustomer(true)}>
              Delete
            </button>
          </>
        }
      />

      {error && <div className="error">{error}</div>}

      <div className="card profile-card">
        <div className="avatar lg">
          {customer.imageUrl ? (
            <img src={assetUrl(customer.imageUrl)} alt={customer.name} />
          ) : (
            <span>{customer.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="profile-fields">
          <Field label="Mobile" value={customer.mobile} />
          <Field label="Email" value={customer.email} />
          <Field label="Gender" value={customer.gender} />
          <Field label="Address" value={customer.address} />
          <Field label="Notes" value={customer.notes} />
          <Field
            label="Added"
            value={new Date(customer.createdAt).toLocaleString()}
          />
        </div>
      </div>

      <div className="section-header">
        <h2>Measurements ({customer.measurements.length})</h2>
        <button type="button" className="btn-sm primary" onClick={startNew}>
          + Add
        </button>
      </div>

      {customer.measurements.length === 0 && !editing && (
        <p className="muted">No measurements yet.</p>
      )}

      {customer.measurements.map((m) =>
        editing && editing !== 'new' && editing.id === m.id ? (
          <div key={m.id} className="card">
            <MeasurementEditor value={draft} onChange={setDraft} />
            <div className="form-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setEditing(null)}
                disabled={savingM}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={saveMeasurement}
                disabled={savingM}
              >
                {savingM ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <div key={m.id} className="card measurement-card">
            <div className="measurement-card-head">
              <div>
                <strong className="capitalize">{m.garmentType}</strong>
                {m.label && <span className="muted small"> · {m.label}</span>}
              </div>
              <div className="row-actions">
                <button type="button" className="btn-sm default" onClick={() => startEdit(m)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn-sm danger"
                  onClick={() => setToDeleteM(m)}
                >
                  Delete
                </button>
              </div>
            </div>
            <div className="measurement-card-body">
              {Object.entries(m.data).map(([k, v]) => (
                <div key={k} className="measurement-chip">
                  <span className="muted small">{k}</span>
                  <strong>{String(v)}</strong>
                </div>
              ))}
            </div>
            <div className="muted small">
              Taken {new Date(m.takenAt).toLocaleString()}
            </div>
          </div>
        ),
      )}

      {editing === 'new' && (
        <div className="card">
          <MeasurementEditor value={draft} onChange={setDraft} />
          <div className="form-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setEditing(null)}
              disabled={savingM}
            >
              Cancel
            </button>
            <button
              type="button"
              className="primary"
              onClick={saveMeasurement}
              disabled={savingM}
            >
              {savingM ? 'Saving…' : 'Add measurement'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!toDeleteM}
        title="Delete measurement?"
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setToDeleteM(null)}
        onConfirm={confirmDeleteMeasurement}
      />
      <ConfirmDialog
        open={toDeleteCustomer}
        title="Delete customer?"
        message={
          <>
            <strong>{customer.name}</strong> and all measurements will be removed.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setToDeleteCustomer(false)}
        onConfirm={confirmDeleteCustomer}
      />
    </>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="profile-field">
      <div className="muted small">{label}</div>
      <div>{value || '—'}</div>
    </div>
  );
}
