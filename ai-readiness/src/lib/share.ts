/**
 * Share links. A result lives entirely in the part of the address after "#",
 * which browsers never send to a server, so nothing is stored anywhere:
 *
 *   /results#v=1&m=d&a=012301230123012301&t=2026-10-05
 *
 *   v  the question set's version (content.ts `shareVersion`)
 *   m  d for a department, c for a company
 *   a  one digit per answer, 0 to 3, in the order asked
 *   t  the day it was taken (optional)
 */
import type { Mode } from './model';

export interface Snapshot {
  mode: Mode;
  answers: number[];
  /** The day it was taken, "2026-10-05", or null when unknown. */
  date: string | null;
}

export type Decoded =
  | { ok: true; snapshot: Snapshot }
  /** empty: no result in the address. old: made with an earlier question set. broken: anything else. */
  | { ok: false; reason: 'empty' | 'old' | 'broken' };

export const RESULTS_PATH = '/results';

const MODE_CODE: Record<Mode, string> = { department: 'd', company: 'c' };

export function encodeSnapshot(snapshot: Snapshot, version: number): string {
  const params = new URLSearchParams();
  params.set('v', String(version));
  params.set('m', MODE_CODE[snapshot.mode]);
  params.set('a', snapshot.answers.join(''));
  if (snapshot.date) params.set('t', snapshot.date);
  return params.toString();
}

/** The full address of a result: origin + /results + #… */
export function resultUrl(origin: string, snapshot: Snapshot, version: number): string {
  return `${origin}${RESULTS_PATH}#${encodeSnapshot(snapshot, version)}`;
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function decodeSnapshot(hash: string, expected: { version: number; questions: number }): Decoded {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const version = params.get('v');
  const answers = params.get('a');
  if (version === null && answers === null) return { ok: false, reason: 'empty' };

  if (version !== String(expected.version)) {
    const n = Number(version);
    const older = Number.isInteger(n) && n >= 1 && n < expected.version;
    return { ok: false, reason: older ? 'old' : 'broken' };
  }

  const code = params.get('m');
  const mode = (Object.keys(MODE_CODE) as Mode[]).find((m) => MODE_CODE[m] === code);
  if (!mode || answers === null || !new RegExp(`^[0-3]{${expected.questions}}$`).test(answers)) {
    return { ok: false, reason: 'broken' };
  }

  // A damaged date shouldn't cost someone their result: drop it and keep the rest.
  const taken = params.get('t');
  return {
    ok: true,
    snapshot: { mode, answers: [...answers].map(Number), date: taken && isCalendarDate(taken) ? taken : null },
  };
}

/** True when two snapshots hold the same answers in the same mode. */
export function sameAnswers(a: Snapshot, b: Snapshot): boolean {
  return a.mode === b.mode && a.answers.length === b.answers.length && a.answers.every((x, i) => x === b.answers[i]);
}
