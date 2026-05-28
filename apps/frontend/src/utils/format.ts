// Small money + date helpers. Keep currency in cents in the API; render in ₹.

export function rupees(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return n.toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
}

export function rupeesPlain(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  return `₹ ${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

/** Render a signed amount, e.g. "+₹500" / "−₹200". Useful for payment ledgers. */
export function signedRupees(cents: number | null | undefined): string {
  const n = (cents ?? 0);
  if (n === 0) return rupees(0);
  const sign = n > 0 ? '+' : '−';
  return `${sign}${rupees(Math.abs(n))}`;
}

/** Compact INR for chart axes / tooltips, e.g. "₹12.4K", "₹1.2L". */
export function compactRupees(cents: number | null | undefined): string {
  const n = (cents ?? 0) / 100;
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (abs >= 100000)   return `₹${(n / 100000).toFixed(1)}L`;
  if (abs >= 1000)     return `₹${(n / 1000).toFixed(1)}K`;
  return `₹${Math.round(n)}`;
}

export function rupeesToCents(input: string | number | null | undefined): number {
  if (input === null || input === undefined || input === '') return 0;
  const n = typeof input === 'number' ? input : parseFloat(String(input).replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function shortDate(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' });
}

export function shortDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function dateInputValue(d: string | Date | null | undefined): string {
  if (!d) return '';
  const date = typeof d === 'string' ? new Date(d) : d;
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function daysUntil(d: string | Date | null | undefined): number | null {
  if (!d) return null;
  const date = typeof d === 'string' ? new Date(d) : d;
  const today = new Date();
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}
