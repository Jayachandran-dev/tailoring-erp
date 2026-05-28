// Drag-and-drop image upload card with live preview, replace, and remove.
//
// Used in Business Settings for the shop logo + visiting card, but generic
// enough to drop anywhere we need a single-image picker.

import { useRef, useState, type DragEvent } from 'react';
import { assetUrl } from '../api/client';
import { Icon } from './Icon';

export type ImageUploadAspect = 'square' | 'card' | 'wide';

interface Props {
  label:        string;
  hint?:        string;
  imageUrl:     string | null | undefined;
  aspect?:      ImageUploadAspect;     // visual ratio of the drop zone
  accept?:      string;                // MIME filter, defaults to images
  maxMB?:       number;                // client-side guard
  busy?:        boolean;               // disables interaction + shows spinner
  onUpload:     (file: File) => Promise<void> | void;
  onRemove?:    () => Promise<void> | void;
}

const DEFAULT_ACCEPT = 'image/png,image/jpeg,image/webp';

export function ImageUploadCard({
  label,
  hint,
  imageUrl,
  aspect = 'square',
  accept = DEFAULT_ACCEPT,
  maxMB = 5,
  busy = false,
  onUpload,
  onRemove,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUrl = assetUrl(imageUrl ?? undefined);
  const hasImage = Boolean(previewUrl);

  function pickFile() {
    if (busy) return;
    inputRef.current?.click();
  }

  async function handleFile(file: File | null | undefined) {
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
    try {
      await onUpload(file);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = e.dataTransfer.files?.[0];
    void handleFile(file);
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    if (!busy) setDragOver(true);
  }

  return (
    <div className={`upload-card aspect-${aspect}`}>
      <div className="upload-card-header">
        <span className="upload-card-label">{label}</span>
        {hasImage && onRemove && !busy && (
          <button
            type="button"
            className="upload-card-remove"
            onClick={() => void onRemove()}
            aria-label={`Remove ${label}`}
          >
            <Icon name="close" size={14} />
            <span>Remove</span>
          </button>
        )}
      </div>

      <div
        className={[
          'upload-card-drop',
          dragOver ? 'is-drag' : '',
          hasImage ? 'has-image' : '',
          busy ? 'is-busy' : '',
        ].filter(Boolean).join(' ')}
        onClick={pickFile}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={() => setDragOver(false)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            pickFile();
          }
        }}
      >
        {hasImage ? (
          <>
            <img className="upload-card-img" src={previewUrl} alt={label} />
            <div className="upload-card-overlay">
              <span className="upload-card-overlay-icon"><Icon name="upload" size={22} /></span>
              <span>Click or drop to replace</span>
            </div>
          </>
        ) : (
          <div className="upload-card-empty">
            <div className="upload-card-icon"><Icon name="image" size={32} /></div>
            <div className="upload-card-prompt">
              <strong>Click to upload</strong>
              <span className="muted small"> or drag &amp; drop</span>
            </div>
            <div className="muted small">
              PNG, JPG or WebP · up to {maxMB} MB
            </div>
          </div>
        )}

        {busy && (
          <div className="upload-card-busy">
            <div className="upload-spinner" />
            <span>Uploading…</span>
          </div>
        )}
      </div>

      {hint && !error && <div className="muted small upload-card-hint">{hint}</div>}
      {error && <div className="upload-card-error">{error}</div>}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          // reset so selecting the same file again still triggers change.
          e.target.value = '';
          void handleFile(file);
        }}
      />
    </div>
  );
}
