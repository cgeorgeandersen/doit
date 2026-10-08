import { UTM_PARTS, type Table } from './model';
import { normalizeText } from './normalize';

/*
 * The shape TagFluent will write to a warehouse (Snowflake, Databricks, BigQuery
 * and the rest) once destinations are connected: one row per UTM, one column
 * per classification, stamped with the version it came from. Plain SQL types,
 * so each destination only has to map varchar, integer and timestamp.
 */

export const WAREHOUSE_TABLE = 'tagfluent.utm_classifications';

const FIXED = ['utm_key', ...UTM_PARTS.map((p) => `utm_${p}`), 'rules_version', 'exported_at'];

/** A column name a warehouse accepts: lower case, letters, digits and underscores, unique. */
export function sqlName(name: string, taken: Set<string>): string {
  let base = normalizeText(name).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'column';
  if (/^[0-9]/.test(base)) base = `c_${base}`;
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}_${n}`;
  taken.add(candidate);
  return candidate;
}

/** Each classification column's name in the warehouse, in table order. */
export function warehouseColumns(table: Table): { name: string; sql: string }[] {
  const taken = new Set(FIXED);
  return table.columns.map((c) => ({ name: c.name, sql: sqlName(c.name, taken) }));
}

/** The CREATE TABLE statement for the current columns. */
export function warehouseDdl(table: Table): string {
  const rows: [string, string, string][] = [
    ['utm_key', 'varchar not null', 'source|medium|campaign|content|term, normalized'],
    ...UTM_PARTS.map((p): [string, string, string] => [`utm_${p}`, 'varchar', p === 'source' ? 'the five UTM parts, as first seen' : '']),
    ...warehouseColumns(table).map((c): [string, string, string] => [c.sql, 'varchar', c.sql === normalizeText(c.name) ? '' : c.name]),
    ['rules_version', 'integer not null', 'the TagFluent version these values come from'],
    ['exported_at', 'timestamp not null', ''],
  ];
  const width = Math.max(...rows.map(([n]) => n.length));
  const typeWidth = Math.max(...rows.map(([, t]) => t.length + 1));
  const lines = rows.map(([n, t, note]) => {
    const line = `  ${n.padEnd(width)}  ${`${t},`.padEnd(typeWidth)}`;
    return (note ? `${line}  -- ${note}` : line).trimEnd();
  });
  lines.push('  primary key (utm_key)');
  return `create table ${WAREHOUSE_TABLE} (\n${lines.join('\n')}\n);`;
}
