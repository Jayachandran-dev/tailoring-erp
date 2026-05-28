// Picks a design from the catalog. Used inside a modal during order create/edit.
// Filter chips by category + a tiny grid of design cards.

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  designsApi,
  designCategoriesApi,
  type Design,
  type DesignCategory,
} from '../../api/domain';
import { ApiError, assetUrl } from '../../api/client';

interface Props {
  onPick: (d: Design) => void;
  onClose: () => void;
}

export function DesignPicker({ onPick, onClose }: Props) {
  const { session } = useAuth();
  const [categories, setCategories] = useState<DesignCategory[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [items, setItems] = useState<Design[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ctx = useMemo(
    () => (session ? { token: session.token, tenantId: session.tenant.id } : null),
    [session],
  );

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!ctx) return;
    designCategoriesApi
      .list(ctx)
      .then(setCategories)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Failed to load categories'));
  }, [ctx]);

  useEffect(() => {
    if (!ctx) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    designsApi
      .list(ctx, {
        q: debounced || undefined,
        categoryId: activeCat ?? undefined,
        page: 1,
        pageSize: 36,
      })
      .then((res) => {
        if (!cancelled) setItems(res.items);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : 'Failed to load designs');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [ctx, debounced, activeCat]);

  return (
    <div className="design-picker">
      <input
        className="search-input"
        type="search"
        placeholder="Search designs…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <div className="chips-row" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`chip ${activeCat === null ? 'active' : ''}`}
          onClick={() => setActiveCat(null)}
        >
          All
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${activeCat === c.id ? 'active' : ''}`}
            onClick={() => setActiveCat(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>

      {error && <div className="error">{error}</div>}

      {loading && items.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : items.length === 0 ? (
        <p className="muted">No designs found.</p>
      ) : (
        <div className="design-grid design-grid-sm" style={{ marginTop: 12 }}>
          {items.map((d) => (
            <button
              key={d.id}
              type="button"
              className="design-card"
              onClick={() => {
                onPick(d);
                onClose();
              }}
            >
              <div className="design-card-img">
                {d.imageUrl ? (
                  <img src={assetUrl(d.imageUrl)} alt={d.name} loading="lazy" />
                ) : (
                  <div className="image-placeholder">No image</div>
                )}
              </div>
              <div className="design-card-body">
                <div className="design-card-cat muted small">{d.category?.name ?? '—'}</div>
                <div className="design-card-name">{d.name}</div>
                {d.priceCents > 0 && (
                  <div className="design-price-sm" style={{ marginTop: 6 }}>
                    ₹ {(d.priceCents / 100).toLocaleString()}
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
