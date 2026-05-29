// Reusable PDF preview dialog. Renders the given Blob in an iframe so the
// browser's built-in PDF viewer handles paging, zooming, and accessibility.
// The footer exposes Download / Open in new tab / (optional) Share actions.
//
// Why a Blob (not a URL)?  PDFs from authed endpoints need the X-Tenant-Id
// header, which a plain <iframe src="..."> cannot send. The caller fetches
// the bytes via apiBlob() and hands us a Blob; we mint an object URL and
// revoke it on close.

import { useEffect, useMemo, useState } from 'react';
import { Modal } from './Modal';
import { Icon } from './Icon';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  blob: Blob | null;
  filename: string;
  /** Optional public URL to share with the customer (e.g. status page URL). */
  shareUrl?: string | null;
  /** Phone in any format; digits-only is used for wa.me. Skips WhatsApp btn when empty. */
  shareToPhone?: string | null;
  /** Default WhatsApp message — link is appended automatically if not present. */
  shareMessage?: string;
}

function digitsOnly(mobile: string | null | undefined): string {
  if (!mobile) return '';
  return mobile.replace(/\D+/g, '');
}

export function PdfViewerModal({
  open,
  onClose,
  title,
  blob,
  filename,
  shareUrl,
  shareToPhone,
  shareMessage,
}: Props) {
  // Mint object URL once per blob. Revoked on unmount / blob change.
  const objectUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);
  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const [copied, setCopied] = useState(false);

  async function copyShare() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  }

  function openWhatsApp() {
    if (!shareUrl) return;
    const baseMsg = shareMessage ?? 'Here is your invoice:';
    const msg = baseMsg.includes(shareUrl) ? baseMsg : `${baseMsg} ${shareUrl}`;
    const encoded = encodeURIComponent(msg);
    const phone = digitsOnly(shareToPhone);
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="pdf-viewer">
        {!blob && <p className="muted">Preparing PDF…</p>}

        {blob && objectUrl && (
          <iframe
            title={title}
            src={objectUrl}
            className="pdf-viewer__frame"
          />
        )}

        <div className="pdf-viewer__actions">
          {blob && objectUrl && (
            <>
              <a
                className="primary"
                href={objectUrl}
                download={filename}
                style={{ textDecoration: 'none' }}
              >
                <Icon name="upload" size={16} style={{ transform: 'rotate(180deg)' }} />
                <span>Download</span>
              </a>
              <a
                className="ghost"
                href={objectUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ textDecoration: 'none' }}
              >
                <Icon name="external-link" size={16} />
                <span>Open in new tab</span>
              </a>
            </>
          )}

          {shareUrl && (
            <>
              <button type="button" className="ghost" onClick={copyShare}>
                <Icon name={copied ? 'check' : 'copy'} size={16} />
                <span>{copied ? 'Copied' : 'Copy share link'}</span>
              </button>
              <button type="button" className="ghost" onClick={openWhatsApp}>
                <Icon name="message-circle" size={16} />
                <span>WhatsApp</span>
              </button>
            </>
          )}

          <button type="button" className="ghost" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
