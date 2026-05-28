// Generic modal. Body content is whatever children you pass in.
// Used for forms, detail views, category management, etc.

import { useEffect, type ReactNode } from 'react';

interface Props {
  open: boolean;
  title?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export function Modal({ open, title, onClose, children, size = 'md' }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal modal-${size}`} onClick={(e) => e.stopPropagation()}>
        {title && (
          <div className="modal-header">
            <h3>{title}</h3>
            <button
              type="button"
              className="icon-btn"
              aria-label="Close"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        )}
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
