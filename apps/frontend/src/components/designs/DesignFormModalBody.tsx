// Create-or-edit a design inside a modal.
// On create: POSTs the design, then (if an image was picked) uploads it.
// On edit: PATCHes fields, applies image add/remove as needed.

import { useEffect, useState } from 'react';
import type { Design, DesignCategory } from '../../api/domain';
import { designsApi } from '../../api/domain';
import { useAuth } from '../../auth/AuthContext';
import { ApiError } from '../../api/client';
import { ImageUpload } from '../ImageUpload';

interface Props {
  categories: DesignCategory[];
  initialCategoryId?: string | null;
  design?: Design | null; // present → edit mode
  onClose: () => void;
  onSaved: (d: Design) => void;
}

export function DesignFormModalBody({
  categories,
  initialCategoryId,
  design,
  onClose,
  onSaved,
}: Props) {
  const { session } = useAuth();
  const isEdit = !!design;

  const [categoryId, setCategoryId] = useState(
    design?.categoryId ?? initialCategoryId ?? categories[0]?.id ?? '',
  );
  const [name, setName] = useState(design?.name ?? '');
  const [code, setCode] = useState(design?.code ?? '');
  const [priceRupees, setPriceRupees] = useState(
    design ? String((design.priceCents ?? 0) / 100) : '',
  );
  const [tags, setTags] = useState(design?.tags ?? '');
  const [notes, setNotes] = useState(design?.notes ?? '');
  const [storedImage] = useState<string | null>(design?.imageUrl ?? null);
  const [pendingImage, setPendingImage] = useState<File | null>(null);
  const [removeStoredImage, setRemoveStoredImage] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!categoryId && categories[0]) setCategoryId(categories[0].id);
  }, [categories, categoryId]);

  if (!session) return null;
  const ctx = { token: session.token, tenantId: session.tenant.id };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!categoryId) {
      setError('Pick a category first');
      return;
    }
    setSaving(true);
    try {
      const priceCents = priceRupees ? Math.round(parseFloat(priceRupees) * 100) : 0;
      const payload = {
        categoryId,
        name: name.trim(),
        code: code.trim() || null,
        priceCents: Number.isFinite(priceCents) ? priceCents : 0,
        tags: tags.trim() || null,
        notes: notes.trim() || null,
      };

      let saved: Design;
      if (isEdit && design) {
        saved = await designsApi.update(ctx, design.id, payload);
        if (removeStoredImage && storedImage && !pendingImage) {
          saved = await designsApi.removeImage(ctx, saved.id);
        }
      } else {
        saved = await designsApi.create(ctx, payload);
      }

      if (pendingImage) {
        saved = await designsApi.uploadImage(ctx, saved.id, pendingImage);
      }

      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Failed to save design');
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="form" onSubmit={submit}>
      <ImageUpload
        label="Design photo"
        value={removeStoredImage ? null : storedImage}
        pendingFile={pendingImage}
        onSelect={(f) => {
          setPendingImage(f);
          setRemoveStoredImage(f === null);
        }}
        onRemove={() => setRemoveStoredImage(true)}
        disabled={saving}
        size={140}
      />

      <div className="form-row">
        <div>
          <label>Category *</label>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.length === 0 && <option value="">No categories yet</option>}
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label>Name *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
      </div>

      <div className="form-row">
        <div>
          <label>Code (optional)</label>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. BL-204"
          />
        </div>
        <div>
          <label>Price (₹)</label>
          <input
            inputMode="decimal"
            value={priceRupees}
            onChange={(e) => setPriceRupees(e.target.value)}
            placeholder="0"
          />
        </div>
      </div>

      <label>Tags (comma-separated)</label>
      <input
        value={tags}
        onChange={(e) => setTags(e.target.value)}
        placeholder="bridal, embroidery, silk"
      />

      <label>Notes</label>
      <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />

      {error && <div className="error">{error}</div>}

      <div className="form-actions">
        <button type="button" className="ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button
          type="submit"
          className="primary"
          disabled={saving || !name.trim() || !categoryId}
        >
          {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Create design'}
        </button>
      </div>
    </form>
  );
}
