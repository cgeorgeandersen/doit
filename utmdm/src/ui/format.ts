const integer = new Intl.NumberFormat('en-US');
const relative = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' });

export const fmtInt = (n: number) => integer.format(Math.round(n));

export function share(part: number, whole: number): number {
  return whole ? part / whole : 0;
}

export function fmtPct(part: number, whole: number): string {
  if (!whole) return '–';
  const value = (100 * part) / whole;
  return value > 0 && value < 1 ? '<1%' : value > 99 && value < 100 ? '>99%' : `${Math.round(value)}%`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${fmtInt(n)} ${n === 1 ? one : many}`;

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  if (!Number.isFinite(seconds)) return '';
  const steps: [Intl.RelativeTimeFormatUnit, number][] = [['year', 31536000], ['month', 2592000], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [unit, size] of steps) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}
