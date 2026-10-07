import { compilePattern, type Predicate } from './match';
import type { Coverage, Field, Rule, Utm, Workspace } from './model';
import { partText } from './normalize';

/**
 * Classification, for each UTM and each field:
 *
 * 1. Every active rule for the field tests the UTM part it reads.
 * 2. The lowest priority number among the matches wins.
 * 3. If the winners disagree on the value, it's a conflict: no value, both
 *    sides shown. A tie is never broken silently.
 * 4. If nothing matches, the field is outstanding. There is no default value.
 */

export type Status = 'classified' | 'conflict' | 'outstanding';

export interface Outcome {
  status: Status;
  value: string | null;
  rules: Rule[]; // the rules that decided it, or the tied sides of a conflict
}

export type Classification = Record<string, Outcome>;
export type Results = Map<string, Classification>;

interface Compiled {
  rule: Rule;
  test: Predicate;
}

export class Classifier {
  readonly fields: Field[];
  private readonly byField = new Map<string, Compiled[]>();

  constructor(fields: Field[], rules: Rule[]) {
    this.fields = fields;
    for (const field of fields) this.byField.set(field.id, []);
    for (const rule of rules) {
      if (!rule.active) continue;
      let test: Predicate;
      try {
        test = compilePattern(rule.match, rule.pattern);
      } catch {
        continue; // rules are checked when saved; one that no longer compiles decides nothing
      }
      this.byField.get(rule.field)?.push({ rule, test });
    }
  }

  outcome(utm: Utm, fieldId: string): Outcome {
    const matched = (this.byField.get(fieldId) ?? [])
      .filter(({ rule, test }) => test(partText(utm.parts, rule.target)))
      .map(({ rule }) => rule);
    if (!matched.length) return { status: 'outstanding', value: null, rules: [] };
    const best = Math.min(...matched.map((rule) => rule.priority));
    const tier = matched.filter((rule) => rule.priority === best);
    const values = new Set(tier.map((rule) => rule.value));
    if (values.size > 1) return { status: 'conflict', value: null, rules: tier };
    return { status: 'classified', value: tier[0]!.value, rules: tier };
  }

  classify(utm: Utm): Classification {
    return Object.fromEntries(this.fields.map((field) => [field.id, this.outcome(utm, field.id)]));
  }

  classifyAll(utms: Utm[]): Results {
    return new Map(utms.map((utm) => [utm.key, this.classify(utm)]));
  }
}

export function classifyWorkspace(ws: Workspace, rules: Rule[] = ws.rules): Results {
  return new Classifier(ws.fields, rules).classifyAll(ws.utms);
}

/** A UTM's overall state: classified only when every field is. */
export function utmStatus(classification: Classification | undefined): Status {
  const outcomes = Object.values(classification ?? {});
  if (outcomes.some((o) => o.status === 'conflict')) return 'conflict';
  if (outcomes.length && outcomes.every((o) => o.status === 'classified')) return 'classified';
  return 'outstanding';
}

export function coverage(utms: Utm[], results: Results): Coverage {
  let classified = 0;
  let conflicts = 0;
  let sessions = 0;
  let classifiedSessions = 0;
  for (const utm of utms) {
    const status = utmStatus(results.get(utm.key));
    sessions += utm.sessions;
    if (status === 'classified') {
      classified += 1;
      classifiedSessions += utm.sessions;
    } else if (status === 'conflict') {
      conflicts += 1;
    }
  }
  return { utms: utms.length, classified, conflicts, sessions, classifiedSessions };
}

export interface FieldCoverage {
  field: Field;
  classified: number;
  conflicts: number;
  outstanding: number;
  sessions: number;
  classifiedSessions: number;
}

export function fieldCoverage(fields: Field[], utms: Utm[], results: Results): FieldCoverage[] {
  return fields.map((field) => {
    const tally: FieldCoverage = { field, classified: 0, conflicts: 0, outstanding: 0, sessions: 0, classifiedSessions: 0 };
    for (const utm of utms) {
      const status = results.get(utm.key)?.[field.id]?.status ?? 'outstanding';
      tally.sessions += utm.sessions;
      if (status === 'classified') {
        tally.classified += 1;
        tally.classifiedSessions += utm.sessions;
      } else if (status === 'conflict') {
        tally.conflicts += 1;
      } else {
        tally.outstanding += 1;
      }
    }
    return tally;
  });
}

/** UTMs that still need a decision, most traffic first. */
export function outstanding(utms: Utm[], results: Results): Utm[] {
  return utms
    .filter((utm) => utmStatus(results.get(utm.key)) !== 'classified')
    .sort((a, b) => b.sessions - a.sessions || a.key.localeCompare(b.key));
}
