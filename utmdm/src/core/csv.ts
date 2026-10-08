import { UTM_PARTS, type Table } from './model';
import { cellOf, keptUtms, sortedUtms, type Grid } from './table';

function cell(value: string | number): string {
  const text = String(value);
  // Quote anything with a comma, quote or line break; neutralize spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** The table as a spreadsheet: the UTM parts as first seen, every column's value, and the version. */
export function tableCsv(table: Table, grid: Grid, version: number): string {
  const header = [...UTM_PARTS.map((part) => `utm_${part}`), ...table.columns.map((c) => c.name), 'version'];
  const rows = sortedUtms(keptUtms(table)).map((utm) => [
    ...UTM_PARTS.map((part) => utm.raw[part]),
    ...table.columns.map((c) => cellOf(grid, utm.key, c.id).value),
    version,
  ]);
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\n') + '\n';
}
