import type { Change, Column, Op, Rule, Table, Utm, UtmParts } from './model';
import { UTM_PARTS } from './model';
import { displayUtm, normalizeParts, normalizeText, tidy, utmKey } from './normalize';
import { matcher } from './rules';

/*
 * The table is never edited in place. Each change is an operation applied to
 * the previous version, which gives back a new version: the way a bank balance
 * is the sum of its transactions. That's what makes every version restorable.
 */

export function emptyTable(): Table {
  return { utms: [], columns: [], rules: [], typed: {} };
}

/** Applies one operation. `past` returns an earlier version, for restores. */
export function apply(table: Table, op: Op, past: (version: number) => Table | undefined): Table {
  switch (op.type) {
    case 'addUtms': {
      const utms = [...table.utms];
      const at = new Map(utms.map((u, i) => [u.key, i]));
      for (const row of op.rows) {
        const parts = normalizeParts(row);
        if (UTM_PARTS.every((p) => !parts[p])) continue;
        const key = utmKey(parts);
        const raw = Object.fromEntries(UTM_PARTS.map((p) => [p, String(row[p] ?? '').trim()])) as UtmParts;
        const spelling = displayUtm(raw);
        const i = at.get(key);
        if (i === undefined) {
          at.set(key, utms.length);
          utms.push({ key, parts, raw, spellings: [spelling] });
        } else if (!utms[i]!.spellings.includes(spelling)) {
          utms[i] = { ...utms[i]!, spellings: [...utms[i]!.spellings, spelling] };
        }
      }
      return { ...table, utms };
    }
    case 'addColumn':
      if (table.columns.some((c) => c.id === op.column.id)) return table;
      return { ...table, columns: [...table.columns, { id: op.column.id, name: tidy(op.column.name) }] };
    case 'renameColumn':
      return { ...table, columns: table.columns.map((c) => (c.id === op.id ? { ...c, name: tidy(op.name) } : c)) };
    case 'deleteColumn': {
      const { [op.id]: _gone, ...typed } = table.typed;
      return {
        ...table,
        columns: table.columns.filter((c) => c.id !== op.id),
        rules: table.rules.filter((r) => r.column !== op.id),
        typed,
      };
    }
    case 'setCell': {
      if (!table.columns.some((c) => c.id === op.column) || !table.utms.some((u) => u.key === op.utm)) return table;
      const { [op.utm]: _old, ...rest } = table.typed[op.column] ?? {};
      const value = tidy(op.value);
      return { ...table, typed: { ...table.typed, [op.column]: value ? { ...rest, [op.utm]: value } : rest } };
    }
    case 'addRule':
      if (!table.columns.some((c) => c.id === op.rule.column)) return table;
      return { ...table, rules: [...table.rules, cleanRule(op.rule)] };
    case 'updateRule': {
      const old = table.rules.find((r) => r.id === op.rule.id);
      if (!old) return table;
      const rule = cleanRule(op.rule);
      // A rule moved to another column goes to the bottom of that column's list.
      const rules = old.column === rule.column
        ? table.rules.map((r) => (r.id === rule.id ? rule : r))
        : [...table.rules.filter((r) => r.id !== rule.id), rule];
      return { ...table, rules };
    }
    case 'deleteRule':
      return { ...table, rules: table.rules.filter((r) => r.id !== op.id) };
    case 'moveRule': {
      const rule = table.rules.find((r) => r.id === op.id);
      if (!rule) return table;
      const own = table.rules.filter((r) => r.column === rule.column && r.id !== rule.id);
      own.splice(Math.max(0, Math.min(op.to, own.length)), 0, rule);
      return { ...table, rules: [...table.rules.filter((r) => r.column !== rule.column), ...own] };
    }
    case 'restore':
      return past(op.version) ?? table;
    case 'batch':
      return op.ops.reduce((t, o) => apply(t, o, past), table);
  }
}

function cleanRule(rule: Rule): Rule {
  return { ...rule, value: tidy(rule.value), when: rule.when.map((c) => ({ ...c, text: tidy(c.text) })) };
}

/** Every version of the table, from 0 (empty) to the latest. */
export function replay(changes: Change[]): Table[] {
  const tables = [emptyTable()];
  for (const change of changes) tables.push(apply(tables.at(-1)!, change.op, (v) => tables[v]));
  return tables;
}

export function sameTable(a: Table, b: Table): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b);
}

/* ── reading the table ─────────────────────────────────────────────────── */

export type CellFrom = 'typed' | 'rule' | 'empty';

export interface Cell {
  value: string;
  from: CellFrom;
  /** The rule that fills it, or for a typed cell, the rule that would. */
  rule?: Rule;
}

/** Every cell's value, by UTM key, then column id. */
export type Grid = Map<string, Record<string, Cell>>;

export const EMPTY: Cell = { value: '', from: 'empty' };

export function rulesFor(table: Table, column: string): Rule[] {
  return table.rules.filter((r) => r.column === column);
}

/** Fills every cell: a typed value first, then the first rule that matches, otherwise empty. */
export function resolve(table: Table): Grid {
  const grid: Grid = new Map(table.utms.map((u) => [u.key, {}]));
  for (const column of table.columns) {
    const rules = rulesFor(table, column.id).map((rule) => ({ rule, test: matcher(rule.when) }));
    const typed = table.typed[column.id] ?? {};
    for (const utm of table.utms) {
      const rule = rules.find((r) => r.test(utm.parts))?.rule;
      const value = typed[utm.key];
      grid.get(utm.key)![column.id] = value
        ? { value, from: 'typed', rule }
        : rule ? { value: rule.value, from: 'rule', rule } : EMPTY;
    }
  }
  return grid;
}

export function cellOf(grid: Grid, utm: string, column: string): Cell {
  return grid.get(utm)?.[column] ?? EMPTY;
}

/** Complete: a value in every column. */
export function isComplete(table: Table, grid: Grid, utm: Utm): boolean {
  return table.columns.length > 0 && table.columns.every((c) => cellOf(grid, utm.key, c.id).from !== 'empty');
}

export interface ColumnCoverage {
  column: Column;
  filled: number;
  byRule: number;
  typed: number;
}

export interface Coverage {
  utms: number;
  complete: number;
  cells: number;
  byRule: number;
  typed: number;
  empty: number;
  columns: ColumnCoverage[];
}

export function coverage(table: Table, grid: Grid): Coverage {
  const columns = table.columns.map((column) => {
    let byRule = 0;
    let typed = 0;
    for (const utm of table.utms) {
      const from = cellOf(grid, utm.key, column.id).from;
      if (from === 'rule') byRule++;
      else if (from === 'typed') typed++;
    }
    return { column, filled: byRule + typed, byRule, typed };
  });
  const cells = table.utms.length * table.columns.length;
  const byRule = columns.reduce((n, c) => n + c.byRule, 0);
  const typed = columns.reduce((n, c) => n + c.typed, 0);
  return {
    utms: table.utms.length,
    complete: table.utms.filter((u) => isComplete(table, grid, u)).length,
    cells,
    byRule,
    typed,
    empty: cells - byRule - typed,
    columns,
  };
}

export interface RuleReach {
  /** UTMs the conditions match. */
  matches: number;
  /** Cells this rule fills: matches not taken by a rule above it or a typed value. */
  fills: number;
}

export function ruleReach(table: Table, grid: Grid): Map<string, RuleReach> {
  const reach = new Map<string, RuleReach>();
  for (const rule of table.rules) {
    const test = matcher(rule.when);
    let matches = 0;
    let fills = 0;
    for (const utm of table.utms) {
      if (!test(utm.parts)) continue;
      matches++;
      const cell = cellOf(grid, utm.key, rule.column);
      if (cell.from === 'rule' && cell.rule?.id === rule.id) fills++;
    }
    reach.set(rule.id, { matches, fills });
  }
  return reach;
}

export interface RulePreview {
  matches: Utm[];
  /** Cells it would fill that are empty now. */
  fillsEmpty: number;
  /** Cells it would fill that have another rule's value now (when editing a rule in place). */
  changes: number;
  /** Matches already decided by a rule above it. */
  takenAbove: number;
  /** Matches that keep a typed value. */
  typed: number;
  /** UTMs that would have a value in every column afterwards, that don't now. */
  completes: number;
}

/** What a new or edited rule would do, before it's saved. */
export function previewRule(table: Table, grid: Grid, draft: Rule): RulePreview {
  const existing = table.rules.some((r) => r.id === draft.id);
  const next: Table = {
    ...table,
    rules: existing ? table.rules.map((r) => (r.id === draft.id ? draft : r)) : [...table.rules, draft],
  };
  const nextGrid = resolve(next);
  const test = matcher(draft.when);
  const preview: RulePreview = { matches: [], fillsEmpty: 0, changes: 0, takenAbove: 0, typed: 0, completes: 0 };
  for (const utm of table.utms) {
    if (!isComplete(table, grid, utm) && isComplete(next, nextGrid, utm)) preview.completes++;
    if (!test(utm.parts)) continue;
    preview.matches.push(utm);
    const before = cellOf(grid, utm.key, draft.column);
    const after = cellOf(nextGrid, utm.key, draft.column);
    if (after.from === 'typed') preview.typed++;
    else if (after.rule?.id !== draft.id) preview.takenAbove++;
    else if (before.from === 'empty') preview.fillsEmpty++;
    else if (before.value !== after.value) preview.changes++;
  }
  return preview;
}

/** The values a column uses, typed or from rules, A to Z. */
export function columnValues(table: Table, column: string): string[] {
  const values = new Set<string>([
    ...rulesFor(table, column).map((r) => r.value),
    ...Object.values(table.typed[column] ?? {}),
  ]);
  return [...values].sort((a, b) => a.localeCompare(b));
}

/** A value as typed, snapped to the column's existing spelling when only capitals or spaces differ. */
export function canonicalValue(table: Table, column: string, text: string): string {
  const value = tidy(text);
  const key = normalizeText(value);
  return columnValues(table, column).find((v) => normalizeText(v) === key) ?? value;
}

/** Rows in reading order: by campaign, then source, medium, content and term. */
export function sortedUtms(utms: Utm[]): Utm[] {
  const order = ['campaign', 'source', 'medium', 'content', 'term'] as const;
  return [...utms].sort((a, b) => {
    for (const part of order) {
      const diff = a.parts[part].localeCompare(b.parts[part]);
      if (diff) return diff;
    }
    return 0;
  });
}
