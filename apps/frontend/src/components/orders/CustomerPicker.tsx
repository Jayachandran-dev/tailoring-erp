// Picks a customer for a new order. Searches the existing customer list.
// Falls back to "Create new customer" by linking out — keeps this component focused.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { customersApi, type Customer } from '../../api/domain';
import { ApiError, assetUrl } from '../../api/client';

interface Props {
  value: Customer | null;
  onChange: (c: Customer | null) => void;
}

export function CustomerPicker({ value, onChange }: Props) {
  const { session } = useAuth();
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!session || !open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    customersApi
      .list(
        { token: session.token, tenantId: session.tenant.id },
        { q: debounced || undefined, page: 1, pageSize: 8 },
      )
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load customers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session, debounced, open]);

  if (value) {
    return (
      <div className="customer-picked card">
        <div className="avatar md">
          {value.imageUrl ? (
            <img src={assetUrl(value.imageUrl)} alt={value.name} />
          ) : (
            <span>{value.name.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="grow">
          <strong>{value.name}</strong>
          <div className="muted small">{value.mobile ?? '—'}</div>
        </div>
        <button type="button" className="ghost" onClick={() => onChange(null)}>
          Change
        </button>
      </div>
    );
  }

  return (
    <div className="customer-picker">
      <input
        className="search-input"
        type="search"
        placeholder="Search customer by name or mobile…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="picker-dropdown">
          {loading && <div className="muted small pad">Loading…</div>}
          {error && <div className="error">{error}</div>}
          {!loading && items.length === 0 && (
            <div className="muted small pad">
              No customers found.{' '}
              <Link to="/customers/new" target="_blank">
                Create one →
              </Link>
            </div>
          )}
          {items.map((c) => (
            <button
              key={c.id}
              type="button"
              className="picker-row"
              onClick={() => {
                onChange(c);
                setOpen(false);
                setQ('');
              }}
            >
              <div className="avatar sm">
                {c.imageUrl ? (
                  <img src={assetUrl(c.imageUrl)} alt={c.name} />
                ) : (
                  <span>{c.name.slice(0, 1).toUpperCase()}</span>
                )}
              </div>
              <div>
                <strong>{c.name}</strong>
                <div className="muted small">{c.mobile ?? '—'}</div>
              </div>
            </button>
          ))}
          <div className="picker-foot">
            <Link to="/customers/new" target="_blank">
              + Create new customer
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
