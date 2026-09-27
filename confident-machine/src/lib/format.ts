const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/** Parse "2026-09-27" as a calendar date (no timezone drift). */
export function parseDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(Date.UTC(y!, (m ?? 1) - 1, d ?? 1));
}

export function fmtDate(iso: string): string {
  const d = parseDate(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

export function fmtMonthYear(iso: string, long = false): string {
  const d = parseDate(iso);
  return `${(long ? MONTHS_LONG : MONTHS)[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function daysBetween(a: string | Date, b: string | Date): number {
  const da = typeof a === 'string' ? parseDate(a) : a;
  const db = typeof b === 'string' ? parseDate(b) : b;
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

export function yearFraction(iso: string): number {
  const d = parseDate(iso);
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  const end = Date.UTC(d.getUTCFullYear() + 1, 0, 1);
  return d.getUTCFullYear() + (d.getTime() - start) / (end - start);
}

/** 0.2567 → "25.7%" (or "26%" with digits = 0). Tiny values keep one significant digit. */
export function pct(p: number, digits = 1): string {
  if (!Number.isFinite(p)) return '–';
  const v = p * 100;
  if (v > 0 && v < 0.1) return '<0.1%';
  return `${v.toFixed(digits)}%`;
}

export function money(x: number): string {
  return x >= 1 ? `$${x.toFixed(2)}` : `$${x.toFixed(2)}`;
}

/** Minutes → a friendly duration: "3 sec", "4 min", "2 hr", "17 hr". */
export function duration(minutes: number): string {
  if (minutes < 1) return `${Math.round(minutes * 60)} sec`;
  if (minutes < 60) return `${minutes < 10 ? minutes.toFixed(1).replace(/\.0$/, '') : Math.round(minutes)} min`;
  const hours = minutes / 60;
  if (hours < 48) return `${hours < 10 ? hours.toFixed(1).replace(/\.0$/, '') : Math.round(hours)} hr`;
  return `${Math.round(hours / 24)} days`;
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;
}
