// Inline category manager — list + add + rename + delete.
// Used as a child of a <Modal>.

import { useState } from 'react';
import type { DesignCategory } from '../../api/domain';
import { designCategoriesApi } from '../../api/domain';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { ConfirmDialog } from '../ConfirmDialog';

interface Props {
  categories: DesignCategory[];
  onChanged: () => void; // refetch upstream
}

export function CategoryManager({ categories, onChanged }: Props) {
  const { session } = useAuth();
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<DesignCategory | null>(null);

  if (!session) return null;
  const ctx = { token: session.token, tenantId: session.tenant.id };

  async function add() {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await designCategoriesApi.create(ctx, { name });
      setNewName('');
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to add category');
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(id: string) {
    const name = editingName.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      await designCategoriesApi.update(ctx, id, { name });
      setEditingId(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to rename');
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!toDelete) return;
    setBusy(true);
    setError(null);
    try {
      await designCategoriesApi.remove(ctx, toDelete.id);
      setToDelete(null);
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to delete');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cat-manager">
      <p className="muted small">
        Categories group your designs. Deleting a category also deletes every design in it.
      </p>

      {error && <div className="error">{error}</div>}

      <div className="cat-add-row">
        <input
          placeholder="New category name (e.g. Bridal Blouse)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void add();
            }
          }}
        />
        <button type="button" className="primary" disabled={busy || !newName.trim()} onClick={add}>
          Add
        </button>
      </div>

      <ul className="cat-list">
        {categories.length === 0 && (
          <li className="muted small">No categories yet — add your first one above.</li>
        )}
        {categories.map((c) => (
          <li key={c.id} className="cat-list-item">
            {editingId === c.id ? (
              <>
                <input
                  value={editingName}
                  onChange={(e) => setEditingName(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveEdit(c.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                />
                <button
                  type="button"
                  className="btn-sm primary"
                  onClick={() => void saveEdit(c.id)}
                  disabled={busy}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="btn-sm default"
                  onClick={() => setEditingId(null)}
                  disabled={busy}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span className="cat-name">{c.name}</span>
                <span className="muted small cat-count">
                  {c._count?.designs ?? 0} designs
                </span>
                <button
                  type="button"
                  className="btn-sm default"
                  onClick={() => {
                    setEditingId(c.id);
                    setEditingName(c.name);
                  }}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="btn-sm danger"
                  onClick={() => setToDelete(c)}
                >
                  Delete
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete category?"
        message={
          toDelete && (
            <>
              <strong>{toDelete.name}</strong> and {toDelete._count?.designs ?? 0} designs in it
              will be permanently deleted.
            </>
          )
        }
        confirmLabel="Delete"
        variant="danger"
        onCancel={() => setToDelete(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
