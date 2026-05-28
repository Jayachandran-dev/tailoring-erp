// Designs gallery page.
// Layout: category chips (All + each) + search + "Manage categories" + "+ New design"
// Body: responsive image card grid. Click a card → detail modal with edit/delete.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import {
  designsApi,
  designCategoriesApi,
  type Design,
  type DesignCategory,
} from '../../api/domain';
import { ApiError, assetUrl } from '../../api/client';
import { PageHeader } from '../../components/PageHeader';
import { Modal } from '../../components/Modal';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { CategoryManager } from '../../components/designs/CategoryManager';
import { DesignFormModalBody } from '../../components/designs/DesignFormModalBody';
import { DesignDetailBody } from '../../components/designs/DesignDetailBody';

export function DesignsPage() {
  const { session } = useAuth();
  const [categories, setCategories] = useState<DesignCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [designs, setDesigns] = useState<Design[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 24;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [managerOpen, setManagerOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit' | null>(null);
  const [detail, setDetail] = useState<Design | null>(null);
  const [toDelete, setToDelete] = useState<Design | null>(null);

  const ctx = useMemo(
    () => (session ? { token: session.token, tenantId: session.tenant.id } : null),
    [session],
  );

  // Debounce search
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => {
    setPage(1);
  }, [debouncedQ, activeCategoryId]);

  const loadCategories = useCallback(async () => {
    if (!ctx) return;
    try {
      const cats = await designCategoriesApi.list(ctx);
      setCategories(cats);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load categories');
    }
  }, [ctx]);

  const loadDesigns = useCallback(async () => {
    if (!ctx) return;
    setLoading(true);
    setError(null);
    try {
      const res = await designsApi.list(ctx, {
        q: debouncedQ || undefined,
        categoryId: activeCategoryId ?? undefined,
        page,
        pageSize,
      });
      setDesigns(res.items);
      setTotal(res.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to load designs');
    } finally {
      setLoading(false);
    }
  }, [ctx, debouncedQ, activeCategoryId, page]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);
  useEffect(() => {
    void loadDesigns();
  }, [loadDesigns]);

  async function confirmDelete() {
    if (!ctx || !toDelete) return;
    try {
      await designsApi.remove(ctx, toDelete.id);
      setToDelete(null);
      setDetail(null);
      void loadDesigns();
      void loadCategories(); // refresh counts
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete');
    }
  }

  function onSaved(saved: Design) {
    // Optimistic refresh; counts may have moved
    void loadDesigns();
    void loadCategories();
    setDetail(saved);
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        title="Designs"
        subtitle={`${total} designs in ${categories.length} categories`}
        actions={
          <>
            <button type="button" className="ghost" onClick={() => setManagerOpen(true)}>
              Manage categories
            </button>
            <button
              type="button"
              className="primary"
              onClick={() => setFormMode('create')}
              disabled={categories.length === 0}
              title={categories.length === 0 ? 'Add a category first' : ''}
            >
              + New design
            </button>
          </>
        }
      />

      {error && <div className="error">{error}</div>}

      <div className="chips-row">
        <button
          type="button"
          className={`chip ${activeCategoryId === null ? 'active' : ''}`}
          onClick={() => setActiveCategoryId(null)}
        >
          All
          <span className="chip-count">{total}</span>
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip ${activeCategoryId === c.id ? 'active' : ''}`}
            onClick={() => setActiveCategoryId(c.id)}
          >
            {c.name}
            <span className="chip-count">{c._count?.designs ?? 0}</span>
          </button>
        ))}
        {categories.length === 0 && (
          <span className="muted small">
            No categories yet. Click <strong>Manage categories</strong> to add one.
          </span>
        )}
      </div>

      <div className="datatable-toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search by name, code, tag…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {loading && designs.length === 0 ? (
        <p className="muted">Loading…</p>
      ) : designs.length === 0 ? (
        <div className="card empty-state">
          <h3>No designs found</h3>
          <p className="muted">
            {debouncedQ
              ? 'Try a different search term.'
              : activeCategoryId
              ? 'No designs in this category yet.'
              : categories.length === 0
              ? 'Start by creating a category, then add some designs.'
              : 'Click + New design to add your first one.'}
          </p>
        </div>
      ) : (
        <div className="design-grid">
          {designs.map((d) => (
            <button
              key={d.id}
              type="button"
              className="design-card"
              onClick={() => setDetail(d)}
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
                <div className="design-card-foot">
                  {d.priceCents > 0 && (
                    <span className="design-price-sm">
                      ₹ {(d.priceCents / 100).toLocaleString()}
                    </span>
                  )}
                  {d.code && <code>{d.code}</code>}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="datatable-pager">
          <button
            type="button"
            className="btn-sm default"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </button>
          <span className="muted">
            Page {page} of {totalPages} · {total} total
          </span>
          <button
            type="button"
            className="btn-sm default"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}

      {/* Category manager */}
      <Modal
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
        title="Manage categories"
        size="md"
      >
        <CategoryManager categories={categories} onChanged={loadCategories} />
      </Modal>

      {/* New / edit design form */}
      <Modal
        open={formMode !== null}
        onClose={() => setFormMode(null)}
        title={formMode === 'edit' ? 'Edit design' : 'New design'}
        size="md"
      >
        <DesignFormModalBody
          categories={categories}
          initialCategoryId={activeCategoryId}
          design={formMode === 'edit' ? detail : null}
          onClose={() => setFormMode(null)}
          onSaved={onSaved}
        />
      </Modal>

      {/* Design detail */}
      <Modal
        open={!!detail && formMode === null}
        onClose={() => setDetail(null)}
        size="lg"
      >
        {detail && (
          <DesignDetailBody
            design={detail}
            onEdit={() => setFormMode('edit')}
            onDelete={() => setToDelete(detail)}
            onClose={() => setDetail(null)}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete design?"
        message={
          toDelete && (
            <>
              <strong>{toDelete.name}</strong> will be permanently deleted.
            </>
          )
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </>
  );
}
