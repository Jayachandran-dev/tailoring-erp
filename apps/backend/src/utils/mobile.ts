// Normalize mobile numbers to a simple E.164-ish form. For an MVP we accept
// 10-digit Indian mobiles and prefix +91, plus already-prefixed numbers.

export function normalizeMobile(input: string): string {
  const trimmed = input.replace(/[\s\-()]/g, '');
  if (/^\+\d{8,15}$/.test(trimmed)) return trimmed;
  if (/^\d{10}$/.test(trimmed)) return `+91${trimmed}`;
  throw new Error('Invalid mobile number. Use 10-digit Indian or +<country><number>.');
}
