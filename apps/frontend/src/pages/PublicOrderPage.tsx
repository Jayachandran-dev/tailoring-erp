// Customer-facing public order status page. NO auth required — accessed
// only via a tokenised URL the shop generates and shares with the customer
// (typically over WhatsApp).
//
// This page is intentionally minimal: business header, current status,
// item list, totals, and a "Download invoice" button. We do NOT show any
// internal IDs, payment references, status-history notes, or audit info.

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { ApiError, assetUrl } from '../api/client';
import { publicOrdersApi, type PublicOrderView } from '../api/domain';

function fmtMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents) / 100;
  const symbol = currency === 'INR' ? '₹' : currency + ' ';
  return `${sign}${symbol}${abs.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function statusLabel(status: string): string {
  switch (status) {
    case 'PENDING':     return 'Order received';
    case 'IN_PROGRESS': return 'Being stitched';
    case 'READY':       return 'Ready for pickup';
    case 'DELIVERED':   return 'Delivered';
    case 'CANCELLED':   return 'Cancelled';
    default:            return status.replace(/_/g, ' ').toLowerCase();
  }
}

function statusClass(status: string): string {
  switch (status) {
    case 'READY':     return 'public-status public-status--ready';
    case 'DELIVERED': return 'public-status public-status--done';
    case 'CANCELLED': return 'public-status public-status--cancelled';
    default:          return 'public-status public-status--progress';
  }
}

export function PublicOrderPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    publicOrdersApi
      .get(token)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(
          e instanceof ApiError
            ? e.status === 404
              ? 'This link is no longer valid.'
              : e.message
            : 'Something went wrong',
        );
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  if (loading) {
    return (
      <div className="public-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="public-shell">
        <div className="card public-card">
          <h2 style={{ marginTop: 0 }}>Link unavailable</h2>
          <p className="muted">{error ?? 'Order not found.'}</p>
        </div>
      </div>
    );
  }

  const { business, order } = data;
  const invoiceUrl = (import.meta.env.VITE_API_BASE_URL ?? '/api') + `/public/orders/${token}/invoice.pdf`;

  return (
    <div className="public-shell">
      <header className="public-header">
        {business.logoUrl && (
          <img
            className="public-logo"
            src={assetUrl(business.logoUrl)}
            alt={business.name}
          />
        )}
        <div>
          <div className="public-business-name">{business.name}</div>
          {business.phone && <div className="muted small">{business.phone}</div>}
        </div>
      </header>

      <main className="card public-card">
        <div className="public-meta">
          <div>
            <div className="muted small">Order</div>
            <strong>{order.number ?? '—'}</strong>
          </div>
          <div>
            <div className="muted small">Customer</div>
            <strong>{order.customerName}</strong>
          </div>
          <div>
            <div className="muted small">Created</div>
            <strong>{fmtDate(order.createdAt)}</strong>
          </div>
          {order.dueDate && (
            <div>
              <div className="muted small">Expected by</div>
              <strong>{fmtDate(order.dueDate)}</strong>
            </div>
          )}
        </div>

        <div className={statusClass(order.status)}>
          <div className="public-status-label">Status</div>
          <div className="public-status-value">{statusLabel(order.status)}</div>
        </div>

        <h3 style={{ marginBottom: 8 }}>Items</h3>
        <ul className="public-items">
          {order.items.map((it, i) => (
            <li key={i}>
              <div>
                <strong>{it.name}</strong>
                <div className="muted small">
                  {it.garmentType} · Qty {it.qty}
                </div>
              </div>
              <div>
                <strong>{fmtMoney(it.qty * it.unitPriceCents, business.currency)}</strong>
              </div>
            </li>
          ))}
        </ul>

        <div className="public-totals">
          {order.discountCents > 0 && (
            <div className="row">
              <span>Discount</span>
              <span>-{fmtMoney(order.discountCents, business.currency)}</span>
            </div>
          )}
          <div className="row">
            <span>Total</span>
            <strong>{fmtMoney(order.totalCents, business.currency)}</strong>
          </div>
          <div className="row">
            <span>Paid</span>
            <span>{fmtMoney(order.paidCents, business.currency)}</span>
          </div>
          <div className="row row--bold">
            <span>Balance</span>
            <strong>{fmtMoney(order.balanceCents, business.currency)}</strong>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <a
            className="primary"
            href={invoiceUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: 'inline-block', textDecoration: 'none' }}
          >
            Download invoice (PDF)
          </a>
        </div>
      </main>

      <footer className="public-footer muted small">
        This is a private link from {business.name}. Don't share it publicly.
      </footer>
    </div>
  );
}
