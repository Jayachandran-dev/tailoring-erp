// UPI QR code preview.
//
// Renders a "upi://pay?..." deep-link QR using the `qrcode` lib (SVG string).
// Used both in the Payment Settings card and in the order PaymentForm so the
// customer can scan with any UPI app (GPay, PhonePe, Paytm, BHIM, etc.).

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export interface UpiQrProps {
  upiId: string;
  payeeName?: string | null;
  /** Amount in INR (rupees, not cents). When provided, the customer's app prefills it. */
  amount?: number;
  /** Transaction note that will appear in the customer's app. */
  note?: string;
  /** SVG pixel size (rendered square). */
  size?: number;
}

/**
 * Build the standard UPI intent URL.
 * Spec: https://developers.google.com/pay/india/api/web/create-payment-method
 *   upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>
 */
export function buildUpiLink({ upiId, payeeName, amount, note }: UpiQrProps): string {
  const params = new URLSearchParams();
  params.set('pa', upiId);
  if (payeeName) params.set('pn', payeeName);
  if (amount && amount > 0) params.set('am', amount.toFixed(2));
  params.set('cu', 'INR');
  if (note) params.set('tn', note.slice(0, 80));
  return `upi://pay?${params.toString()}`;
}

export function UpiQrPreview(props: UpiQrProps) {
  const { size = 160 } = props;
  const [svg, setSvg] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const link = buildUpiLink(props);

  useEffect(() => {
    let cancelled = false;
    QRCode.toString(link, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      width: size,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((s) => { if (!cancelled) { setSvg(s); setErr(null); } })
      .catch((e: unknown) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : 'QR error');
      });
    return () => { cancelled = true; };
  }, [link, size]);

  if (err) return <div className="qr-error">QR: {err}</div>;
  return (
    <div
      className="upi-qr"
      style={{ width: size, height: size }}
      // QRCode.toString returns a sanitized self-contained SVG.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
