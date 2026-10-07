import type { Change, Condition, Op, Rule, Table, Utm, UtmParts, Workspace } from './model';
import { displayUtm, normalizeParts, normalizeText, tidy, utmKey } from './normalize';
import { describeRule, ruleProblem } from './rules';
import { apply, canonicalValue, coverage, replay, resolve, rulesFor, sameTable } from './table';

/*
 * A workspace and every version of its table. Each function below turns
 * something a person did into a Draft: the operation plus a sentence for
 * History. `record` saves it as the next version, unless nothing changed.
 */

export interface Book {
  ws: Workspace;
  /** tables[n] is version n; tables[0] is the empty table. */
  tables: Table[];
}

export interface Draft {
  op: Op;
  summary: string;
}

export function openBook(ws: Workspace): Book {
  return { ws, tables: replay(ws.changes) };
}

export function emptyWorkspace(name: string, user: string): Workspace {
  return { schema: 2, name, user, changes: [] };
}

export const latest = (book: Book): Table => book.tables.at(-1)!;
export const versionOf = (book: Book): number => book.ws.changes.length;

/** Saves a draft as the next version. Returns null when it would change nothing. */
export function record(book: Book, draft: Draft, at: string, author = book.ws.user): Book | null {
  const before = latest(book);
  const after = apply(before, draft.op, (v) => book.tables[v]);
  if (sameTable(before, after)) return null;
  const change: Change = { version: versionOf(book) + 1, at, author, summary: draft.summary, op: draft.op };
  return { ws: { ...book.ws, changes: [...book.ws.changes, change] }, tables: [...book.tables, after] };
}

/** An id that is never reused: the version that creates the thing, plus a counter within it. */
export function newId(book: Book, prefix: string, index = 0): string {
  return `${prefix}${versionOf(book) + 1}${index ? `-${index}` : ''}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/* ── UTMs ──────────────────────────────────────────────────────────────── */

export interface AddUtms extends Draft {
  added: Utm[];
  /** Rows that are already in the table (or repeat another pasted row). */
  known: number;
}

export function addUtms(table: Table, rows: UtmParts[], from = 'a paste'): AddUtms {
  const seen = new Set(table.utms.map((u) => u.key));
  const added: Utm[] = [];
  let known = 0;
  for (const row of rows) {
    const parts = normalizeParts(row);
    if (Object.values(parts).every((p) => !p)) continue;
    const key = utmKey(parts);
    if (seen.has(key)) {
      known++;
      continue;
    }
    seen.add(key);
    added.push({ key, parts, raw: row, spellings: [displayUtm(row)] });
  }
  const summary = `Added ${plural(added.length, 'UTM')} from ${from}${known ? ` (${plural(known, 'row')} already in the table)` : ''}`;
  return { op: { type: 'addUtms', rows }, summary, added, known };
}

/* ── columns ───────────────────────────────────────────────────────────── */

export function columnNameProblem(table: Table, name: string, except?: string): string | null {
  const clean = tidy(name);
  if (!clean) return 'Give the column a name.';
  if (clean.length > 40) return 'Keep the name under 40 characters.';
  if (table.columns.some((c) => c.id !== except && normalizeText(c.name) === normalizeText(clean))) {
    return `There's already a column called ${clean}.`;
  }
  return null;
}

export function addColumn(book: Book, name: string): Draft & { id: string } {
  const id = newId(book, 'c');
  return { id, op: { type: 'addColumn', column: { id, name: tidy(name) } }, summary: `Added column ${tidy(name)}` };
}

export function renameColumn(table: Table, id: string, name: string): Draft {
  const old = table.columns.find((c) => c.id === id)?.name ?? '';
  return { op: { type: 'renameColumn', id, name: tidy(name) }, summary: `Renamed column ${old} to ${tidy(name)}` };
}

export function deleteColumn(table: Table, id: string): Draft {
  const name = table.columns.find((c) => c.id === id)?.name ?? '';
  const rules = rulesFor(table, id).length;
  const typed = Object.keys(table.typed[id] ?? {}).length;
  const lost = [rules ? plural(rules, 'rule') : '', typed ? plural(typed, 'typed value') : ''].filter(Boolean).join(' and ');
  return { op: { type: 'deleteColumn', id }, summary: `Deleted column ${name}${lost ? `, with its ${lost}` : ''}` };
}

/* ── cells ─────────────────────────────────────────────────────────────── */

/** Typing in a cell. An empty value clears what was typed, so the rules fill the cell again. */
export function setCell(table: Table, utm: Utm, column: string, text: string): Draft {
  const name = table.columns.find((c) => c.id === column)?.name ?? '';
  const value = text.trim() ? canonicalValue(table, column, text) : null;
  const where = displayUtm(utm.raw);
  return {
    op: { type: 'setCell', column, utm: utm.key, value },
    summary: value ? `Typed ${value} in ${name} for ${where}` : `Cleared the typed ${name} for ${where}`,
  };
}

/* ── rules ─────────────────────────────────────────────────────────────── */

export interface RuleInput {
  column: string;
  when: Condition[];
  value: string;
}

export function draftRule(table: Table, input: RuleInput, id: string): Rule {
  return {
    id,
    column: input.column,
    when: input.when.map((c) => ({ ...c, text: tidy(c.text) })),
    value: canonicalValue(table, input.column, input.value),
  };
}

export function addRule(book: Book, input: RuleInput): Draft & { rule: Rule; problem: string | null } {
  const table = latest(book);
  const rule = draftRule(table, input, newId(book, 'r'));
  return { rule, problem: ruleProblem(rule, table), op: { type: 'addRule', rule }, summary: `Added rule: ${describeRule(rule, table)}` };
}

export function updateRule(table: Table, id: string, input: RuleInput): Draft & { rule: Rule; problem: string | null } {
  const old = table.rules.find((r) => r.id === id);
  const rule = draftRule(table, input, id);
  const was = old ? ` (was: ${describeRule(old, table)})` : '';
  return { rule, problem: ruleProblem(rule, table), op: { type: 'updateRule', rule }, summary: `Changed rule: ${describeRule(rule, table)}${was}` };
}

export function deleteRule(table: Table, id: string): Draft {
  const rule = table.rules.find((r) => r.id === id);
  return { op: { type: 'deleteRule', id }, summary: `Deleted rule: ${rule ? describeRule(rule, table) : id}` };
}

export function moveRule(table: Table, id: string, by: -1 | 1): Draft {
  const rule = table.rules.find((r) => r.id === id)!;
  const index = rulesFor(table, rule.column).findIndex((r) => r.id === id);
  return {
    op: { type: 'moveRule', id, to: index + by },
    summary: `Moved a rule ${by < 0 ? 'up' : 'down'}: ${describeRule(rule, table)}`,
  };
}

/* ── history ───────────────────────────────────────────────────────────── */

export function restore(version: number): Draft {
  return { op: { type: 'restore', version }, summary: `Restored version ${version}` };
}

export function undo(book: Book, version: number): Draft {
  const change = book.ws.changes[version - 1];
  return { op: { type: 'restore', version: version - 1 }, summary: `Undid version ${version}${change ? `: ${change.summary}` : ''}` };
}

export interface HistoryEntry {
  change: Change;
  /** UTMs with a value in every column after this change, the total, and how many columns there were. */
  complete: number;
  utms: number;
  columns: number;
}

export function historyEntries(book: Book): HistoryEntry[] {
  return book.ws.changes.map((change) => {
    const table = book.tables[change.version]!;
    const cov = coverage(table, resolve(table));
    return { change, complete: cov.complete, utms: cov.utms, columns: table.columns.length };
  });
}
