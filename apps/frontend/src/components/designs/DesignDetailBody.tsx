// Read-only design detail body. Used inside the Modal.

import type { Design } from '../../api/domain';
import { assetUrl } from '../../api/client';

export function DesignDetailBody({
  design,
  onEdit,
  onDelete,
  onClose,
}: {
  design: Design;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="design-detail">
      <div className="design-detail-image">
        {design.imageUrl ? (
          <img src={assetUrl(design.imageUrl)} alt={design.name} />
        ) : (
          <div className="image-placeholder">No image</div>
        )}
      </div>
      <div className="design-detail-meta">
        <div className="muted small">
          {design.category?.name ?? '—'}
          {design.code ? <> · <code>{design.code}</code></> : null}
        </div>
        <h2 style={{ margin: '4px 0 8px' }}>{design.name}</h2>
        {design.priceCents > 0 && (
          <div className="design-price">₹ {(design.priceCents / 100).toLocaleString()}</div>
        )}
        {design.tags && (
          <div className="tag-row">
            {design.tags
              .split(',')
              .map((t) => t.trim())
              .filter(Boolean)
              .map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
          </div>
        )}
        {design.notes && <p className="muted" style={{ whiteSpace: 'pre-wrap' }}>{design.notes}</p>}
        <div className="muted small">
          Added {new Date(design.createdAt).toLocaleString()}
        </div>

        <div className="form-actions">
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
          <button type="button" className="primary" onClick={onEdit}>
            Edit
          </button>
          <button type="button" className="danger" onClick={onDelete}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
