/*
 * The shapes TagFluent works with. A workspace is a list of changes; the table at
 * any version is what you get by applying the changes up to it, in order.
 */

export const UTM_PARTS = ['source', 'medium', 'campaign', 'content', 'term'] as const;
export type UtmPart = (typeof UTM_PARTS)[number];
export type UtmParts = Record<UtmPart, string>;

/** One row of the table: a UTM, with spellings that differ only in case, spaces or URL encoding merged into it. */
export interface Utm {
  key: string;
  /** Normalized: what rules read. */
  parts: UtmParts;
  /** The first spelling seen: what people read. */
  raw: UtmParts;
  /** Every spelling seen, as "source / medium / campaign / content / term". */
  spellings: string[];
}

/** A column the team classifies UTMs by, such as Channel or Type. */
export interface Column {
  id: string;
  name: string;
}

export const MATCH_OPS = ['contains', 'is', 'starts', 'ends', 'blank', 'notBlank'] as const;
export type MatchOp = (typeof MATCH_OPS)[number];
/** Ops that look at whether a part is empty, so they take no text. */
export const TEXTLESS_OPS: readonly MatchOp[] = ['blank', 'notBlank'];

export interface Condition {
  part: UtmPart;
  op: MatchOp;
  text: string;
}

/** A rule's `column` when the rule removes matching rows instead of filling a column. */
export const REMOVE = '@remove';

/**
 * If the conditions hold (every one, or with `match: 'any'` at least one), the
 * column gets the value. A rule whose column is REMOVE takes matching UTMs out of
 * the table instead: they stay stored, and come back if the rule goes.
 */
export interface Rule {
  id: string;
  column: string;
  when: Condition[];
  value: string;
  /** How the conditions combine. Missing means 'all', as rules saved before this existed. */
  match?: 'all' | 'any';
}

/** The table at one version. */
export interface Table {
  utms: Utm[];
  columns: Column[];
  /** In order: within a column, the first rule that matches fills the cell. */
  rules: Rule[];
  /** Values people typed, by column id, then UTM key. A typed value beats every rule. */
  typed: Record<string, Record<string, string>>;
}

export type Op =
  | { type: 'addUtms'; rows: UtmParts[] }
  | { type: 'addColumn'; column: Column }
  | { type: 'renameColumn'; id: string; name: string }
  | { type: 'deleteColumn'; id: string }
  | { type: 'setCell'; column: string; utm: string; value: string | null }
  | { type: 'addRule'; rule: Rule }
  | { type: 'updateRule'; rule: Rule }
  | { type: 'deleteRule'; id: string }
  | { type: 'moveRule'; id: string; to: number }
  | { type: 'restore'; version: number }
  | { type: 'batch'; ops: Op[] };

/** One saved change. Version n is the table after change n. */
export interface Change {
  version: number;
  at: string;
  author: string;
  summary: string;
  op: Op;
}

export interface Workspace {
  schema: 2;
  name: string;
  user: string;
  changes: Change[];
}
