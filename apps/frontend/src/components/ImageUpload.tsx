// Single-container image picker used in customer/design forms and settings.
//
// One bounded box that holds either the empty drop-zone or the live preview
// with a floating action bar (Edit / Delete). View is triggered by clicking
// the image itself (works on touch / PWA where hover isn't available) and a
// circular eye affordance fades in on hover for desktop discoverability.

import { useEffect, useRef, useState, type DragEvent } from 'react';
import { assetUrl } from '../api/client';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

interface Props {
  value?:       string | null; // current public path returned by backend
  pendingFile?: File | null;
  onSelect:     (file: File | null) => void;
  onRemove?:    () => void;    // invoked when clearing a stored value
  disabled?:    boolean;
  label?:       string;
  icon?:        IconName;      // small icon shown next to the label
  size?:        number;        // square edge in px (default 160)
  width?:       number;        // overrides `size` for non-square previews
  height?:      number;
  maxMB?:       number;
  accept?:      string;
}

const DEFAULT_ACCEPT = 'image/jpeg,image/png,image/webp';

export function ImageUpload({
  value,
  pendingFile,
  onSelect,
  onRemove,
  disabled,
  label = 'Photo',
  icon,
  size = 160,
  width,
  height,
  maxMB = 5,
  accept = DEFAULT_ACCEPT,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewOpen, setViewOpen] = useState(false);

  // Local object-URL preview when a file has been picked but not yet saved.
  useEffect(() => {
    if (pendingFile) {
      const url = URL.createObjectURL(pendingFile);
      setPreview(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreview(null);
    return undefined;
  }, [pendingFile]);

  const shown = preview ?? assetUrl(value ?? undefined) ?? null;
  const hasImage = Boolean(shown);

  function pick() {
    if (disabled) return;
    inputRef.current?.click();
  }

  function handleFile(file: File | null | undefined) {
    setError(null);
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Please choose an image file.');
      return;
    }
    if (file.size > maxMB * 1024 * 1024) {
      setError(`File is too large (max ${maxMB} MB).`);
      return;
    }
    onSelect(file);
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    handleFile(e.dataTransfer.files?.[0]);
  }
  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!disabled) setDragOver(true);
  }

  function clear() {
    if (disabled) return;
    onSelect(null);
    if (value && onRemove) onRemove();
  }

  return (
    <div className="image-upload">
      <div className="image-upload-head">
        <span className="image-upload-label">
          {icon && <Icon name={icon} size={14} />}
          <span>{label}</span>
        </span>
        <span className="muted small">JPG, PNG, WebP · max {maxMB} MB</span>
      </div>

      <div
        className={[
          'image-upload-box',
          hasImage ? 'has-image' : 'empty',
          dragOver ? 'is-drag' : '',
          disabled ? 'is-disabled' : '',
        ].filter(Boolean).join(' ')}
        style={{ width: width ?? size, height: height ?? size }}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        onClick={hasImage ? () => setViewOpen(true) : pick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (hasImage) setViewOpen(true);
            else pick();
          }
        }}
        role="button"
        tabIndex={0}
        aria-label={hasImage ? `View ${label.toLowerCase()}` : `Upload ${label.toLowerCase()}`}
      >
        {hasImage ? (
          <>
            <img className="image-upload-img" src={shown!} alt={label} />
            <button
              type="button"
              className="image-upload-view"
              title="View"
              aria-label="View image"
              onClick={(e) => { e.stopPropagation(); setViewOpen(true); }}
              disabled={disabled}
            >
              <Icon name="eye" size={18} />
            </button>
            <div className="image-upload-toolbar" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="iu-action"
                title="Replace"
                onClick={pick}
                disabled={disabled}
              >
                <Icon name="pencil" size={14} />
                <span>Edit</span>
              </button>
              <button
                type="button"
                className="iu-action danger"
                title="Remove"
                onClick={clear}
                disabled={disabled}
              >
                <Icon name="trash" size={14} />
                <span>Delete</span>
              </button>
            </div>
          </>
        ) : (
          <div className="image-upload-empty">
            <Icon name="image" size={28} />
            <strong>Click or drop to upload</strong>
            <span className="muted small">{`Up to ${maxMB} MB`}</span>
          </div>
        )}
      </div>

      {error && <div className="image-upload-error">{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          handleFile(f);
        }}
      />

      <Modal
        open={viewOpen}
        onClose={() => setViewOpen(false)}
        title={label}
        size="md"
      >
        {shown && (
          <div className="image-upload-viewer">
            <img src={shown} alt={label} />
          </div>
        )}
      </Modal>
    </div>
  );
}
