// Customer-facing share menu for an order. Surfaces:
//   * Copy public URL to clipboard
//   * Open WhatsApp with a pre-baked message + link (uses the customer's
//     stored mobile when available; falls back to wa.me with empty `to`).
//   * Open the link in a new tab (useful to preview what the customer sees).
//   * Revoke the link (rotates: next "Create" mints a fresh token).
//
// The component owns its own state machine: idle → loading → ready → revoked.
// Parent passes the order id + customer info; we fetch / create / revoke
// against the backend.

import { useEffect, useState } from 'react';
import { ordersApi, type ShareLink } from '../../api/domain';
import { ApiError } from '../../api/client';
import { Icon } from '../Icon';

interface Props {
  ctx: { token: string; tenantId: string };
  orderId: string;
  orderNumber: string | null;
  customerName: string;
  customerMobile: string | null;
  status: string;
  businessName: string;
}

// Strip non-digits for wa.me — accepts +91-98765 43210, returns 919876543210.
function digitsOnly(mobile: string | null): string {
  if (!mobile) return '';
  return mobile.replace(/\D+/g, '');
}

function defaultMessage(p: Props, url: string): string {
  const ord = p.orderNumber ? `order ${p.orderNumber}` : 'your order';
  const status = p.status.replace(/_/g, ' ').toLowerCase();
  return (
    `Hi ${p.customerName}, this is ${p.businessName}. ` +
    `You can check ${ord} (currently ${status}) any time here: ${url}`
  );
}

export function ShareOrderMenu(props: Props) {
  const { ctx, orderId } = props;
  const [link, setLink] = useState<ShareLink | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    ordersApi
      .getShareLink(ctx, orderId)
      .then((l) => {
        if (!cancelled) setLink(l);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof ApiError ? e.message : 'Failed to load share link');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, orderId]);

  async function create() {
    setBusy(true);
    setErr(null);
    try {
      setLink(await ordersApi.createShareLink(ctx, orderId));
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to create link');
    } finally {
      setBusy(false);
    }
  }

  async function revoke() {
    if (!confirm('Revoke this link? The customer will no longer be able to open it.')) return;
    setBusy(true);
    setErr(null);
    try {
      await ordersApi.revokeShareLink(ctx, orderId);
      setLink(null);
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Failed to revoke');
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Older browsers / non-secure contexts — fall back to a prompt.
      window.prompt('Copy this link:', link.url);
    }
  }

  function openWhatsApp() {
    if (!link) return;
    const phone = digitsOnly(props.customerMobile);
    const msg = encodeURIComponent(defaultMessage(props, link.url));
    const url = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  if (loading) {
    return (
      <div className="card" style={{ padding: 12 }}>
        <span className="muted">Loading share link…</span>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 12, display: 'grid', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Icon name="link" size={16} />
        <strong>Customer status link</strong>
        {link && (
          <span className="muted small">
            {link.viewCount > 0
              ? `Viewed ${link.viewCount}× · last ${new Date(link.lastViewedAt!).toLocaleString()}`
              : 'Not viewed yet'}
          </span>
        )}
      </div>

      {err && <div className="error">{err}</div>}

      {!link && (
        <>
          <p className="muted small" style={{ margin: 0 }}>
            Generate a private URL the customer can open anytime to see their order status — no
            login needed.
          </p>
          <div>
            <button type="button" className="primary" onClick={create} disabled={busy}>
              <Icon name="link" size={16} />
              <span>Create share link</span>
            </button>
          </div>
        </>
      )}

      {link && (
        <>
          <input
            type="text"
            value={link.url}
            readOnly
            onFocus={(e) => e.currentTarget.select()}
            style={{ width: '100%', fontSize: 12 }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="primary" onClick={openWhatsApp} disabled={busy}>
              <Icon name="message-circle" size={16} />
              <span>Send on WhatsApp</span>
            </button>
            <button type="button" className="ghost" onClick={copyLink} disabled={busy}>
              <Icon name={copied ? 'check' : 'copy'} size={16} />
              <span>{copied ? 'Copied' : 'Copy link'}</span>
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
              disabled={busy}
            >
              <Icon name="external-link" size={16} />
              <span>Preview</span>
            </button>
            <button type="button" className="ghost danger" onClick={revoke} disabled={busy}>
              Revoke
            </button>
          </div>
        </>
      )}
    </div>
  );
}
