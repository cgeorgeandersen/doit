import type { Condition, MatchOp, Rule, Table, UtmParts } from './model';
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
};

function holds(op: MatchOp, value: string, text: string): boolean {
  switch (op) {
    case 'contains': return value.includes(text);
    case 'is': return value === text;
    case 'starts': return value.startsWith(text);
    case 'ends': return value.endsWith(text);
  }
}

/** A rule's conditions as one test, normalized once. */
export function matcher(when: Condition[]): (parts: UtmParts) => boolean {
  const tests = when.map((c) => ({ part: c.part, op: c.op, text: normalizeText(c.text) }));
  return (parts) => tests.every((t) => t.text !== '' && holds(t.op, parts[t.part], t.text));
}

/** Why a rule can't be saved, or null when it can. */
export function ruleProblem(rule: Pick<Rule, 'column' | 'when' | 'value'>, table: Table): string | null {
  if (!table.columns.some((c) => c.id === rule.column)) return 'Pick a column for the rule to fill.';
  if (!rule.when.length) return 'Add a condition.';
  if (rule.when.some((c) => !normalizeText(c.text))) return 'Type what the UTM should contain, be or start or end with.';
  if (!rule.value.trim()) return 'Type the value the rule should fill in.';
  return null;
}

export function describeCondition(c: Condition): string {
  return `${c.part} ${OP_LABEL[c.op]} "${c.text.trim()}"`;
}

export function describeWhen(when: Condition[]): string {
  return when.map(describeCondition).join(' and ');
}

/** "If campaign contains "cup", then Type is Marketing" */
export function describeRule(rule: Pick<Rule, 'column' | 'when' | 'value'>, table: Pick<Table, 'columns'>): string {
  const column = table.columns.find((c) => c.id === rule.column)?.name ?? 'a deleted column';
  return `If ${describeWhen(rule.when)}, then ${column} is ${rule.value}`;
}
