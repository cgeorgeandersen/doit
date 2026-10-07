import { classifyWorkspace, coverage, type Results } from './classify';
import { InvalidRule, compilePattern } from './match';
import {
  MATCH_TYPES,
  UTM_PARTS,
  type Field,
  type MatchType,
  type Rule,
  type RuleTarget,
  type SourceRow,
  type Utm,
  type Workspace,
} from './model';
import { SEPARATOR, displayUtm, normalizeParts, partText, utmKey } from './normalize';

/*
 * Every change goes through these functions, and each returns a new workspace,
 * so the UI can't half-apply anything. Two promises hold throughout:
 *   - the UTM table only grows: a refresh adds UTMs and traffic, never removes;
 *   - every change to the rules is a new version, with a full copy of the rules.
 */

export const DEFAULT_PRIORITY = 100;
export const OVERRIDE_PRIORITY = 10; // a decision about specific UTMs beats a broad pattern

export function emptyWorkspace(fields: Field[], user = 'You'): Workspace {
  return { schema: 1, user, fields, utms: [], rules: [], versions: [], refreshes: [], sampleCursor: 0 };
}

// ── the permanent table ─────────────────────────────────────────────────────

export interface IngestOptions {
  source: string;
  period: string;
  at: string;
}

/** Adds a source's rows to the table: new UTMs are created, known ones gain traffic and spellings. */
export function ingest(ws: Workspace, rows: SourceRow[], { source, period, at }: IngestOptions): Workspace {
  const table = new Map(ws.utms.map((utm) => [utm.key, utm]));
  const created = new Set<string>();
  const updated = new Set<string>();
  for (const row of rows) {
    const parts = normalizeParts(row);
    if (UTM_PARTS.every((part) => !parts[part])) continue;
    const key = utmKey(parts);
    const spelling = displayUtm(row);
    const known = table.get(key);
    if (!known) {
      created.add(key);
      table.set(key, {
        key,
        parts,
        raw: Object.fromEntries(UTM_PARTS.map((part) => [part, row[part] ?? ''])) as Utm['raw'],
        spellings: [spelling],
        firstSeen: row.period,
        lastSeen: row.period,
        sessions: row.sessions,
        keyEvents: row.keyEvents,
      });
      continue;
    }
    if (!created.has(key)) updated.add(key);
    table.set(key, {
      ...known,
      spellings: known.spellings.includes(spelling) ? known.spellings : [...known.spellings, spelling],
      firstSeen: row.period < known.firstSeen ? row.period : known.firstSeen,
      lastSeen: row.period > known.lastSeen ? row.period : known.lastSeen,
      sessions: known.sessions + row.sessions,
      keyEvents: known.keyEvents + row.keyEvents,
    });
  }
  const next = { ...ws, utms: [...table.values()] };
  const refresh = {
    at,
    source,
    period,
    rows: rows.length,
    newUtms: created.size,
    updatedUtms: updated.size,
    newKeys: [...created],
    coverage: coverage(next.utms, classifyWorkspace(next)),
  };
  return { ...next, refreshes: [...ws.refreshes, refresh] };
}

/** UTMs the latest refresh added. Empty until there has been a refresh after the first load. */
export function latestNewKeys(ws: Workspace): Set<string> {
  return new Set(ws.refreshes.length > 1 ? ws.refreshes.at(-1)!.newKeys : []);
}

// ── vocabulary ──────────────────────────────────────────────────────────────

/** Adds a value to a field's list. Values are never renamed or removed: rules and history point at them. */
export function addValue(ws: Workspace, fieldId: string, value: string): Workspace {
  const field = getField(ws, fieldId);
  const name = value.replace(/\s+/g, ' ').trim();
  if (!name) throw new InvalidRule('A value needs a name.');
  if (field.values.some((v) => v.toLowerCase() === name.toLowerCase())) {
    throw new InvalidRule(`${field.name} already has "${name}".`);
  }
  return { ...ws, fields: ws.fields.map((f) => (f.id === fieldId ? { ...f, values: [...f.values, name] } : f)) };
}

export function getField(ws: Workspace, fieldId: string): Field {
  const field = ws.fields.find((f) => f.id === fieldId);
  if (!field) throw new InvalidRule(`There's no "${fieldId}" classification.`);
  return field;
}

// ── rules and versions ──────────────────────────────────────────────────────

export interface RuleDraft {
  field: string;
  target: RuleTarget;
  match: MatchType;
  pattern: string;
  value: string;
  priority?: number;
  note?: string;
}

/** Checks a rule and returns it with the value spelled as the field spells it. */
export function checkRule<T extends RuleDraft>(ws: Workspace, draft: T): T {
  const field = getField(ws, draft.field);
  if (draft.target !== 'any' && !UTM_PARTS.includes(draft.target)) throw new InvalidRule(`Unknown UTM part "${draft.target}".`);
  if (!MATCH_TYPES.includes(draft.match)) throw new InvalidRule(`Unknown match type "${draft.match}".`);
  compilePattern(draft.match, draft.pattern);
  const value = field.values.find((v) => v.toLowerCase() === draft.value.trim().toLowerCase());
  if (!value) throw new InvalidRule(`"${draft.value}" isn't a ${field.name} value yet. Add it first.`);
  const priority = draft.priority ?? DEFAULT_PRIORITY;
  if (!Number.isInteger(priority) || priority < 0) throw new InvalidRule('Priority is a whole number, 0 or more. Lower wins.');
  return { ...draft, value, priority };
}

/** Makes `rules` the current rules as a new version. Returns the workspace unchanged if nothing changed. */
export function commitRules(ws: Workspace, rules: Rule[], message: string, at: string): Workspace {
  if (JSON.stringify(rules) === JSON.stringify(ws.rules)) return ws;
  const version = {
    number: (ws.versions.at(-1)?.number ?? 0) + 1,
    at,
    author: ws.user,
    message,
    rules,
    coverage: coverage(ws.utms, classifyWorkspace(ws, rules)),
  };
  return { ...ws, rules, versions: [...ws.versions, version] };
}

export function nextRuleId(ws: Workspace): string {
  const ids = [...ws.rules, ...ws.versions.flatMap((v) => v.rules)].map((rule) => Number(rule.id.slice(1)) || 0);
  return `R${Math.max(0, ...ids) + 1}`;
}

export function addRule(ws: Workspace, draft: RuleDraft, at: string, message?: string): Workspace {
  const checked = checkRule(ws, draft);
  const rule: Rule = {
    id: nextRuleId(ws),
    field: checked.field,
    target: checked.target,
    match: checked.match,
    pattern: checked.pattern,
    value: checked.value,
    priority: checked.priority!,
    active: true,
    author: ws.user,
    createdAt: at,
    note: checked.note ?? '',
  };
  return commitRules(ws, [...ws.rules, rule], message ?? `Add ${rule.id}: ${describeRule(rule, ws.fields)}`, at);
}

export function updateRule(
  ws: Workspace,
  id: string,
  changes: Partial<RuleDraft & { active: boolean }>,
  at: string,
  message?: string,
): Workspace {
  const current = ws.rules.find((rule) => rule.id === id);
  if (!current) throw new InvalidRule(`There's no rule ${id}.`);
  const merged = checkRule(ws, { ...current, ...changes });
  const rule: Rule = { ...current, ...merged, priority: merged.priority!, note: merged.note ?? current.note };
  const verb = changes.active === false ? 'Turn off' : changes.active === true && !current.active ? 'Turn on' : 'Edit';
  return commitRules(ws, ws.rules.map((r) => (r.id === id ? rule : r)), message ?? `${verb} ${id}`, at);
}

export function restoreVersion(ws: Workspace, number: number, at: string): Workspace {
  const version = ws.versions.find((v) => v.number === number);
  if (!version) throw new InvalidRule(`There's no version ${number}.`);
  return commitRules(ws, version.rules, `Restore the rules of version ${number}`, at);
}

// ── reading rules ───────────────────────────────────────────────────────────

const MATCH_WORDS: Record<MatchType, string> = {
  contains: 'contains',
  exact: 'is',
  starts_with: 'starts with',
  regex: 'matches',
};

export function isSingleUtmRule(rule: Pick<Rule, 'target' | 'match'>): boolean {
  return rule.target === 'any' && rule.match === 'exact';
}

/** A rule in plain words: utm_campaign contains "summer cup" → Campaign: Summer Cup 2026. */
export function describeRule(rule: Pick<Rule, 'field' | 'target' | 'match' | 'pattern' | 'value'>, fields: Field[]): string {
  const field = fields.find((f) => f.id === rule.field)?.name ?? rule.field;
  return `${describeCondition(rule)} → ${field}: ${rule.value}`;
}

export function describeCondition(rule: Pick<Rule, 'target' | 'match' | 'pattern'>): string {
  if (isSingleUtmRule(rule)) return `this UTM only (${displayUtm(keyToParts(rule.pattern))})`;
  const subject = rule.target === 'any' ? 'any part' : `utm_${rule.target}`;
  const pattern = rule.match === 'regex' ? `/${rule.pattern}/` : `"${rule.pattern}"`;
  return `${subject} ${MATCH_WORDS[rule.match]} ${pattern}`;
}

export function keyToParts(key: string): Partial<Utm['parts']> {
  const values = key.split(SEPARATOR);
  return Object.fromEntries(UTM_PARTS.map((part, i) => [part, values[i] ?? '']));
}

export interface Reach {
  utms: Utm[];
  sessions: number;
  open: number; // of those, not yet classified on this field
}

/** "Test this rule": what a pattern matches right now, before precedence. */
export function ruleReach(ws: Workspace, results: Results, draft: Pick<RuleDraft, 'field' | 'target' | 'match' | 'pattern'>): Reach {
  const test = compilePattern(draft.match, draft.pattern);
  const utms = ws.utms
    .filter((utm) => test(partText(utm.parts, draft.target)))
    .sort((a, b) => b.sessions - a.sessions);
  return {
    utms,
    sessions: utms.reduce((sum, utm) => sum + utm.sessions, 0),
    open: utms.filter((utm) => results.get(utm.key)?.[draft.field]?.status !== 'classified').length,
  };
}

export interface RuleChange {
  kind: 'added' | 'removed' | 'changed';
  id: string;
  before?: Rule;
  after?: Rule;
  changed: string[];
}

const COMPARED: (keyof Rule)[] = ['field', 'target', 'match', 'pattern', 'value', 'priority', 'active', 'note'];

export function diffRules(before: Rule[], after: Rule[]): RuleChange[] {
  const old = new Map(before.map((rule) => [rule.id, rule]));
  const now = new Map(after.map((rule) => [rule.id, rule]));
  const ids = [...new Set([...old.keys(), ...now.keys()])].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  const changes: RuleChange[] = [];
  for (const id of ids) {
    const a = old.get(id);
    const b = now.get(id);
    if (!a && b) changes.push({ kind: 'added', id, after: b, changed: [] });
    else if (a && !b) changes.push({ kind: 'removed', id, before: a, changed: [] });
    else if (a && b) {
      const changed = COMPARED.filter((key) => a[key] !== b[key]);
      if (changed.length) changes.push({ kind: 'changed', id, before: a, after: b, changed });
    }
  }
  return changes;
}
