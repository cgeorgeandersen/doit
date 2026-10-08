import { REMOVE, TEXTLESS_OPS, type Condition, type MatchOp, type Rule, type Table, type UtmParts } from './model';
import { normalizeText } from './normalize';

/*
 * A rule is a sentence: "If campaign contains cup, then Type is Marketing."
 * Matching ignores case, spaces and URL encoding, the same way UTMs are merged.
 */

export const OP_LABEL: Record<MatchOp, string> = {
  contains: 'contains',
  is: 'is',
  starts: 'starts with',
  ends: 'ends with',
  blank: 'is blank',
  notBlank: 'is not blank',
};

export const needsText = (op: MatchOp): boolean => !TEXTLESS_OPS.includes(op);
export const removes = (rule: Pick<Rule, 'column'>): boolean => rule.column === REMOVE;

function holds(op: MatchOp, value: string, text: string): boolean {
  switch (op) {
    case 'contains': return value.includes(text);
    case 'is': return value === text;
    case 'starts': return value.startsWith(text);
    case 'ends': return value.endsWith(text);
    case 'blank': return value === '';
    case 'notBlank': return value !== '';
  }
}

/** A rule's conditions as one test, normalized once: all of them must hold, or with 'any', at least one. */
export function matcher(when: Condition[], match: Rule['match'] = 'all'): (parts: UtmParts) => boolean {
  const tests = when.map((c) => ({ part: c.part, op: c.op, text: normalizeText(c.text) }));
  const one = (t: (typeof tests)[number], parts: UtmParts) => (!needsText(t.op) || t.text !== '') && holds(t.op, parts[t.part], t.text);
  if (!tests.length) return () => false;
  return match === 'any' ? (parts) => tests.some((t) => one(t, parts)) : (parts) => tests.every((t) => one(t, parts));
}

/** Why a rule can't be saved, or null when it can. */
export function ruleProblem(rule: Pick<Rule, 'column' | 'when' | 'value'>, table: Table): string | null {
  if (!removes(rule) && !table.columns.some((c) => c.id === rule.column)) return 'Pick a column for the rule to fill.';
  if (!rule.when.length) return 'Add a condition.';
  if (rule.when.some((c) => needsText(c.op) && !normalizeText(c.text))) return 'Type what the UTM should contain, be or start or end with.';
  if (!removes(rule) && !rule.value.trim()) return 'Type the value the rule should fill in.';
  return null;
}

export function describeCondition(c: Condition): string {
  return needsText(c.op) ? `${c.part} ${OP_LABEL[c.op]} "${c.text.trim()}"` : `${c.part} ${OP_LABEL[c.op]}`;
}

export function describeWhen(when: Condition[], match: Rule['match'] = 'all'): string {
  return when.map(describeCondition).join(match === 'any' ? ' or ' : ' and ');
}

/** "If campaign contains "cup", then Type is Marketing", or "If campaign is blank and content is blank, then remove the row" */
export function describeRule(rule: Pick<Rule, 'column' | 'when' | 'value' | 'match'>, table: Pick<Table, 'columns'>): string {
  if (removes(rule)) return `If ${describeWhen(rule.when, rule.match)}, then remove the row`;
  const column = table.columns.find((c) => c.id === rule.column)?.name ?? 'a deleted column';
  return `If ${describeWhen(rule.when, rule.match)}, then ${column} is ${rule.value}`;
}
