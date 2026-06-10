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

  // PDF viewer URL fragment hides Chrome / Edge / Firefox built-in toolbar &
  // side panel so the dialog shows just the document — our own buttons below
  // handle download / open / share. (See Adobe's "PDF Open Parameters".)
  const frameUrl = objectUrl ? `${objectUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH` : null;

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

  function download() {
    if (!objectUrl) return;
    // Programmatic <a download> click so the button styling stays consistent.
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function openInNewTab() {
    if (!objectUrl) return;
    // Open WITHOUT the toolbar=0 hash so the user gets the full browser viewer.
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="lg">
      <div className="pdf-viewer">
        {!blob && <p className="muted">Preparing PDF…</p>}

        {blob && frameUrl && (
          <iframe
            title={title}
            src={frameUrl}
            className="pdf-viewer__frame"
          />
        )}

        <div className="pdf-viewer__actions">
          <div className="pdf-viewer__actions-group">
            <button
              type="button"
              className="primary"
              onClick={download}
              disabled={!objectUrl}
            >
              <Icon name="upload" size={16} style={{ transform: 'rotate(180deg)' }} />
              <span>Download</span>
            </button>
            <button
              type="button"
              className="ghost"
              onClick={openInNewTab}
              disabled={!objectUrl}
            >
              <Icon name="external-link" size={16} />
              <span>Open in new tab</span>
            </button>
          </div>

          {shareUrl && (
            <div className="pdf-viewer__actions-group">
              <button type="button" className="ghost" onClick={copyShare}>
                <Icon name={copied ? 'check' : 'copy'} size={16} />
                <span>{copied ? 'Copied' : 'Copy link'}</span>
              </button>
              <button type="button" className="ghost" onClick={openWhatsApp}>
                <Icon name="message-circle" size={16} />
                <span>WhatsApp</span>
              </button>
            </div>
          )}

          <button
            type="button"
            className="ghost pdf-viewer__close"
            onClick={onClose}
          >
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}
