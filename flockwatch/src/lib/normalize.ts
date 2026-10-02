/**
 * Cleans up camera tags typed by volunteers. Shared by the data build script
 * (scripts/build-data.ts, run directly by Node) and the app, so it has no
 * imports and uses only syntax Node can strip.
 */

/** Spellings found in the data, mapped to one display name each. Order matters: first match wins. */
const BRANDS: Array<[RegExp, string]> = [
  [/flock/i, 'Flock Safety'],
  [/motorola|vigilant/i, 'Motorola Solutions'],
  [/^axis\b|axis comm/i, 'Axis Communications'],
  [/genetec/i, 'Genetec'],
  [/axon/i, 'Axon'],
  [/leonardo|elsag/i, 'Leonardo'],
  [/rekor/i, 'Rekor'],
  [/platesmart|cyclops/i, 'PlateSmart'],
  [/neology/i, 'Neology'],
  [/ubicquia/i, 'Ubicquia'],
  [/ekin/i, 'Ekin'],
  [/hikvision/i, 'Hikvision'],
  [/verkada/i, 'Verkada'],
  [/avigilon/i, 'Avigilon'],
  [/dahua/i, 'Dahua'],
  [/tattile/i, 'Tattile'],
  [/insight lpr/i, 'Insight LPR'],
  [/liveview/i, 'LiveView Technologies'],
  [/redspeed/i, 'RedSpeed'],
  [/^rtx\b|raytheon/i, 'RTX'],
];

export const FLOCK = 'Flock Safety';

/** One display name per manufacturer; '' when the tag is missing. */
export function normalizeBrand(raw: string | undefined | null): string {
  const value = (raw ?? '').trim();
  if (!value) return '';
  for (const [pattern, name] of BRANDS) if (pattern.test(value)) return name;
  return value;
}

/**
 * The organization that runs the camera; '' when unknown. Volunteers sometimes
 * enter the vendor ("Flock Safety") as the operator when they don't know who
 * runs it. Flock sells the cameras; a police department, sheriff, business or
 * homeowners' association runs them. So the vendor is treated as unknown.
 */
export function normalizeOperator(raw: string | undefined | null): string {
  const value = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!value || /^flock\b/i.test(value)) return '';
  return value;
}

/**
 * Parses RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF) into rows of
 * objects keyed by the header row.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows.filter((r) => r.length > 1 || r[0] !== '');
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((key, i) => [key, r[i] ?? ''])));
}

/** 1° tile key for a point: "33_-85" holds latitudes 33–34 and longitudes -85 to -84. */
export function tileKey(lon: number, lat: number): string {
  return `${Math.floor(lat)}_${Math.floor(lon)}`;
}
