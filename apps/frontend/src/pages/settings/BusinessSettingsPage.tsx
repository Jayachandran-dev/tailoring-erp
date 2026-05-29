// Business Settings — singleton form for shop / business metadata.
//
// One row per tenant (id = 'default') keeping name, address, contact info,
// tax IDs, currency/timezone, and invoice prefix / footer / terms.

import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import {
  businessSettingsApi,
  type BusinessSettings,
  type BusinessSettingsInput,
} from '../../api/domain';
import { PageHeader } from '../../components/PageHeader';
import { ImageUpload } from '../../components/ImageUpload';

// All fields are strings in the form; nullable server fields collapse to ''.
type FormState = Record<keyof BusinessSettingsInput, string>;

const FIELDS: Array<keyof BusinessSettingsInput> = [
  'businessName', 'legalName', 'tagline', 'ownerName',
  'phone', 'altPhone', 'email', 'website',
  'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'country',
  'gstin', 'pan', 'currency', 'timezone',
  'invoicePrefix', 'invoiceFooter', 'terms',
];

const EMPTY_FORM: FormState = FIELDS.reduce(
  (acc, k) => ({ ...acc, [k]: '' }),
  {} as FormState,
);

function fromServer(s: BusinessSettings): FormState {
  const out = { ...EMPTY_FORM };
  for (const k of FIELDS) {
    const v = (s as unknown as Record<string, unknown>)[k];
    out[k] = v == null ? '' : String(v);
  }
  return out;
}

// Trim every field; the controller maps '' → null for nullable cols.
function toPayload(f: FormState): BusinessSettingsInput {
  const out: Record<string, string> = {};
  for (const k of FIELDS) out[k] = f[k].trim();
  return out as BusinessSettingsInput;
}

export function BusinessSettingsPage() {
  const { session } = useAuth();
  const ctx = useMemo(
    () => (session ? { token: session.token, tenantId: session.tenant.id } : null),
    [session],
  );

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  // Image URLs live outside the form because they're updated via dedicated
  // upload endpoints (not the JSON PUT payload).
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [visitingCardUrl, setVisitingCardUrl] = useState<string | null>(null);
  const [logoBusy, setLogoBusy] = useState(false);
  const [cardBusy, setCardBusy] = useState(false);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function applyServer(s: BusinessSettings) {
    setForm(fromServer(s));
    setLogoUrl(s.logoUrl);
    setVisitingCardUrl(s.visitingCardUrl);
    // Notify sidebar etc. so the brand picks up new name / logo immediately.
    window.dispatchEvent(new CustomEvent('business-settings-updated', { detail: s }));
  }

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    setLoading(true);
    businessSettingsApi
      .get(ctx)
      .then((s) => {
        if (!cancelled) {
          setForm(fromServer(s));
          setLogoUrl(s.logoUrl);
          setVisitingCardUrl(s.visitingCardUrl);
        }
      })
      .catch((e) =>
        setError(e instanceof ApiError ? e.message : 'Failed to load business settings'),
      )
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [ctx?.tenantId]);

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!ctx) return;
    setSaving(true);
    setError(null);
    try {
      const saved = await businessSettingsApi.update(ctx, toPayload(form));
      applyServer(saved);
      setSavedAt(Date.now());
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save business settings');
    } finally {
      setSaving(false);
    }
  }

  async function uploadLogo(file: File) {
    if (!ctx) return;
    setLogoBusy(true);
    try {
      applyServer(await businessSettingsApi.uploadLogo(ctx, file));
    } finally {
      setLogoBusy(false);
    }
  }
  async function removeLogo() {
    if (!ctx) return;
    setLogoBusy(true);
    try {
      applyServer(await businessSettingsApi.removeLogo(ctx));
    } finally {
      setLogoBusy(false);
    }
  }
  async function uploadVisitingCard(file: File) {
    if (!ctx) return;
    setCardBusy(true);
    try {
      applyServer(await businessSettingsApi.uploadVisitingCard(ctx, file));
    } finally {
      setCardBusy(false);
    }
  }
  async function removeVisitingCard() {
    if (!ctx) return;
    setCardBusy(true);
    try {
      applyServer(await businessSettingsApi.removeVisitingCard(ctx));
    } finally {
      setCardBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Business"
        subtitle="Name, contact details, tax IDs and invoice defaults for your shop."
      />

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <form className="biz-form" onSubmit={onSubmit}>
          {error && <div className="banner banner-error">{error}</div>}
          {savedAt && !error && (
            <div className="banner banner-success">Saved.</div>
          )}

          <section className="biz-section">
            <h3>Brand assets</h3>
            <p className="muted small biz-section-sub">
              Your logo appears in the sidebar and on printed invoices. The
              visiting card is shown to customers when they scan to pay or share
              your contact details.
            </p>
            <div className="upload-grid">
              <ImageUpload
                label="Business logo"
                icon="image"
                value={logoUrl}
                disabled={logoBusy}
                width={280}
                height={170}
                onSelect={(f) => { if (f) uploadLogo(f); else if (logoUrl) removeLogo(); }}
              />
              <ImageUpload
                label="Visiting card"
                icon="credit-card"
                value={visitingCardUrl}
                disabled={cardBusy}
                width={280}
                height={170}
                onSelect={(f) => { if (f) uploadVisitingCard(f); else if (visitingCardUrl) removeVisitingCard(); }}
              />
            </div>
          </section>

          <section className="biz-section">
            <h3>Identity</h3>
            <div className="biz-grid">
              <label className="biz-field">
                <span>Business name *</span>
                <input
                  required
                  value={form.businessName}
                  maxLength={120}
                  placeholder="My Tailoring Shop"
                  onChange={(e) => set('businessName', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Legal name</span>
                <input
                  value={form.legalName}
                  maxLength={160}
                  placeholder="As registered (optional)"
                  onChange={(e) => set('legalName', e.target.value)}
                />
              </label>
              <label className="biz-field biz-field-wide">
                <span>Tagline</span>
                <input
                  value={form.tagline}
                  maxLength={160}
                  placeholder="Stitching memories since 2015"
                  onChange={(e) => set('tagline', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Owner name</span>
                <input
                  value={form.ownerName}
                  maxLength={80}
                  onChange={(e) => set('ownerName', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="biz-section">
            <h3>Contact</h3>
            <div className="biz-grid">
              <label className="biz-field">
                <span>Phone</span>
                <input
                  type="tel"
                  value={form.phone}
                  maxLength={20}
                  placeholder="+91 98765 43210"
                  onChange={(e) => set('phone', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Alt phone</span>
                <input
                  type="tel"
                  value={form.altPhone}
                  maxLength={20}
                  onChange={(e) => set('altPhone', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Email</span>
                <input
                  type="email"
                  value={form.email}
                  maxLength={160}
                  placeholder="hello@shop.com"
                  onChange={(e) => set('email', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Website</span>
                <input
                  type="url"
                  value={form.website}
                  maxLength={200}
                  placeholder="https://shop.example.com"
                  onChange={(e) => set('website', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="biz-section">
            <h3>Address</h3>
            <div className="biz-grid">
              <label className="biz-field biz-field-wide">
                <span>Address line 1</span>
                <input
                  value={form.addressLine1}
                  maxLength={160}
                  onChange={(e) => set('addressLine1', e.target.value)}
                />
              </label>
              <label className="biz-field biz-field-wide">
                <span>Address line 2</span>
                <input
                  value={form.addressLine2}
                  maxLength={160}
                  onChange={(e) => set('addressLine2', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>City</span>
                <input
                  value={form.city}
                  maxLength={80}
                  onChange={(e) => set('city', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>State</span>
                <input
                  value={form.state}
                  maxLength={80}
                  onChange={(e) => set('state', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Pincode</span>
                <input
                  value={form.pincode}
                  maxLength={20}
                  onChange={(e) => set('pincode', e.target.value)}
                />
              </label>
              <label className="biz-field">
                <span>Country</span>
                <input
                  value={form.country}
                  maxLength={80}
                  onChange={(e) => set('country', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="biz-section">
            <h3>Tax &amp; locale</h3>
            <div className="biz-grid">
              <label className="biz-field">
                <span>GSTIN</span>
                <input
                  value={form.gstin}
                  maxLength={20}
                  placeholder="22AAAAA0000A1Z5"
                  onChange={(e) => set('gstin', e.target.value.toUpperCase())}
                />
              </label>
              <label className="biz-field">
                <span>PAN</span>
                <input
                  value={form.pan}
                  maxLength={20}
                  placeholder="AAAAA0000A"
                  onChange={(e) => set('pan', e.target.value.toUpperCase())}
                />
              </label>
              <label className="biz-field">
                <span>Currency</span>
                <input
                  value={form.currency}
                  maxLength={3}
                  placeholder="INR"
                  onChange={(e) => set('currency', e.target.value.toUpperCase())}
                />
              </label>
              <label className="biz-field">
                <span>Timezone</span>
                <input
                  value={form.timezone}
                  maxLength={60}
                  placeholder="Asia/Kolkata"
                  onChange={(e) => set('timezone', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="biz-section">
            <h3>Invoice defaults</h3>
            <div className="biz-grid">
              <label className="biz-field">
                <span>Order / invoice prefix</span>
                <input
                  value={form.invoicePrefix}
                  maxLength={10}
                  placeholder="ORD-"
                  onChange={(e) => set('invoicePrefix', e.target.value)}
                />
              </label>
              <label className="biz-field biz-field-wide">
                <span>Invoice footer</span>
                <input
                  value={form.invoiceFooter}
                  maxLength={500}
                  placeholder="Thank you for choosing us!"
                  onChange={(e) => set('invoiceFooter', e.target.value)}
                />
              </label>
              <label className="biz-field biz-field-wide">
                <span>Terms &amp; conditions</span>
                <textarea
                  rows={4}
                  maxLength={2000}
                  value={form.terms}
                  placeholder="Payment terms, delivery commitments, etc."
                  onChange={(e) => set('terms', e.target.value)}
                />
              </label>
            </div>
          </section>

          <div className="biz-actions">
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
