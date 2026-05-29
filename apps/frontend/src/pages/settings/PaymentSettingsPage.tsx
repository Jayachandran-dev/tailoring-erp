// Payment Settings — UPI account manager.
//
// Lets the shop register multiple UPI handles, mark one as default,
// activate/deactivate, edit/delete, and view collected totals per UPI id.
// Used by the order PaymentForm to render a UPI deep-link QR.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import {
  upiAccountsApi,
  type UpiAccount,
  type UpiAccountInput,
  type UpiAccountSummary,
} from '../../api/domain';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { UpiQrPreview } from '../../components/payments/UpiQrPreview';
import { Icon } from '../../components/Icon';
import { rupees } from '../../utils/format';

const VPA_HINT = 'Format: name@bank (e.g., shop@okhdfcbank, 9876543210@ybl)';

export function PaymentSettingsPage() {
  const { session } = useAuth();
  const [rows, setRows] = useState<UpiAccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState<{ mode: 'new' } | { mode: 'edit'; row: UpiAccount } | null>(null);
  const [toDelete, setToDelete] = useState<UpiAccount | null>(null);

  const ctx = useMemo(
    () => (session ? { token: session.token, tenantId: session.tenant.id } : null),
    [session],
  );

  async function refresh() {
    if (!ctx) return;
    setLoading(true);
    try {
      const data = await upiAccountsApi.summary(ctx);
      setRows(data);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load UPI accounts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void refresh(); /* eslint-disable-next-line */ }, [ctx?.tenantId]);

  async function setAsDefault(id: string) {
    if (!ctx) return;
    try {
      await upiAccountsApi.setDefault(ctx, id);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to update default');
    }
  }

  async function removeAccount() {
    if (!ctx || !toDelete) return;
    try {
      await upiAccountsApi.remove(ctx, toDelete.id);
      setToDelete(null);
      await refresh();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete');
    }
  }

  if (!session) return null;

  return (
    <>
      <PageHeader
        title="Payment settings"
        subtitle="Register UPI handles that receive customer payments."
        actions={
          <button type="button" className="primary" onClick={() => setFormOpen({ mode: 'new' })}>
            + Add UPI account
          </button>
        }
      />

      {error && <div className="error">{error}</div>}

      {loading && <p className="muted">Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className="card empty-state">
          <h3>No UPI accounts yet</h3>
          <p className="muted">
            Add your shop's UPI handle (GPay/PhonePe/etc.) so customers can scan a QR at the counter
            and you can track collections per account.
          </p>
          <button type="button" className="primary" onClick={() => setFormOpen({ mode: 'new' })}>
            + Add your first UPI account
          </button>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="upi-grid">
          {rows.map(({ account, lifetime, last30d }) => (
            <article key={account.id} className={`card upi-card ${account.isActive ? '' : 'inactive'}`}>
              <header className="upi-card-head">
                <div className="upi-card-thumb">
                  <UpiQrPreview upiId={account.upiId} payeeName={account.payeeName ?? account.label} size={56} />
                </div>
                <div className="upi-card-info">
                  <strong className="upi-card-name">{account.label}</strong>
                  <div className="upi-handle">{account.upiId}</div>
                  {account.payeeName && (
                    <div className="muted small">Payee: {account.payeeName}</div>
                  )}
                </div>
                <div className="upi-card-actions">
                  {account.isDefault ? (
                    <span className="pill default-pill">
                      <Icon name="star" size={12} />
                      DEFAULT
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="btn-set-default"
                      onClick={() => setAsDefault(account.id)}
                    >
                      Set as default
                    </button>
                  )}
                  {!account.isActive && <span className="pill">INACTIVE</span>}
                </div>
              </header>

              <div className="upi-stats">
                <div>
                  <span className="muted small">Lifetime</span>
                  <strong>{rupees(lifetime.cents)}</strong>
                  <span className="muted small">{lifetime.count} txn</span>
                </div>
                <div>
                  <span className="muted small">Last 30 days</span>
                  <strong>{rupees(last30d.cents)}</strong>
                  <span className="muted small">{last30d.count} txn</span>
                </div>
              </div>

              <footer className="upi-card-foot">
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setFormOpen({ mode: 'edit', row: account })}
                >
                  Edit
                </button>
                <button type="button" className="danger" onClick={() => setToDelete(account)}>
                  Delete
                </button>
              </footer>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={formOpen !== null}
        onClose={() => setFormOpen(null)}
        title={formOpen?.mode === 'edit' ? 'Edit UPI account' : 'Add UPI account'}
        size="sm"
      >
        {formOpen && ctx && (
          <UpiAccountForm
            initial={formOpen.mode === 'edit' ? formOpen.row : null}
            onCancel={() => setFormOpen(null)}
            onSubmit={async (input) => {
              if (formOpen.mode === 'edit') {
                await upiAccountsApi.update(ctx, formOpen.row.id, input);
              } else {
                await upiAccountsApi.create(ctx, input);
              }
              setFormOpen(null);
              await refresh();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete UPI account?"
        message={
          <>
            <strong>{toDelete?.label}</strong> ({toDelete?.upiId}) will be removed. Past payments
            recorded against it stay in the ledger, but lose the account link.
          </>
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={removeAccount}
      />
    </>
  );
}

function UpiAccountForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: UpiAccount | null;
  onSubmit: (input: UpiAccountInput) => Promise<void>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [upiId, setUpiId] = useState(initial?.upiId ?? '');
  const [payeeName, setPayeeName] = useState(initial?.payeeName ?? '');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!label.trim()) { setErr('Label is required.'); return; }
    if (!upiId.trim()) { setErr('UPI id is required.'); return; }
    setSubmitting(true);
    try {
      await onSubmit({
        label:     label.trim(),
        upiId:     upiId.trim().toLowerCase(),
        payeeName: payeeName.trim() || null,
        isDefault,
        isActive,
        notes:     notes.trim() || null,
      });
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to save');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <label>Label *</label>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Shop GPay"
        autoFocus
      />

      <label>UPI id *</label>
      <input
        value={upiId}
        onChange={(e) => setUpiId(e.target.value)}
        placeholder="shop@okhdfcbank"
        autoCapitalize="off"
        autoCorrect="off"
      />
      <p className="field-hint">{VPA_HINT}</p>

      <label>Payee name (optional)</label>
      <input
        value={payeeName}
        onChange={(e) => setPayeeName(e.target.value)}
        placeholder="Shown on the customer's UPI app"
      />

      <label>Notes (optional)</label>
      <input value={notes} onChange={(e) => setNotes(e.target.value)} />

      <div className="row check-row">
        <label className="check">
          <input
            type="checkbox"
            checked={isDefault}
            onChange={(e) => setIsDefault(e.target.checked)}
          />
          Use as default
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Active
        </label>
      </div>

      {upiId.trim() && (
        <div className="upi-qr-preview-wrap">
          <UpiQrPreview upiId={upiId.trim().toLowerCase()} payeeName={payeeName.trim() || label.trim()} size={140} />
          <p className="muted small">Preview</p>
        </div>
      )}

      {err && <div className="error">{err}</div>}

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onCancel} disabled={submitting}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={submitting}>
          {submitting ? 'Saving…' : 'Save'}
        </button>
      </div>
    </form>
  );
}
