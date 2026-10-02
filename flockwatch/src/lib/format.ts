const METERS_PER_MILE = 1609.344;

export const fmtInt = (n: number) => Math.round(n).toLocaleString('en-US');

export function fmtMiles(meters: number): string {
  const miles = meters / METERS_PER_MILE;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles < 10 ? miles.toFixed(1) : fmtInt(miles)} mi`;
}

export function fmtDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** "one every 0.8 miles", for the headline; null when there are none. */
export function spacing(meters: number, count: number): string | null {
  if (count === 0) return null;
  const miles = meters / METERS_PER_MILE / count;
  if (miles < 0.1) return `about one every ${Math.max(50, Math.round((miles * 5280) / 50) * 50)} feet`;
  return `about one every ${miles < 10 ? miles.toFixed(1) : fmtInt(miles)} miles`;
}

export function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });
}

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
