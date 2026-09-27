/**
 * The reader's case file: every answer and choice made along the way.
 * It feeds the "My Rules for AI" card at the end. Saved in this browser only
 * (localStorage, wrapped so a blocked or private-mode store never breaks the page).
 */
import type { CalibrationSummary } from '../engine/calibration';

export type TrustChoice = 'machine' | 'human';
export type SortChoice = 'great' | 'struggles';
export type DilemmaId = 'privacy' | 'oversight' | 'accountability';

export interface CaseFile {
  opening?: { trusted: TrustChoice; correct: boolean };
  prediction?: { guess: string; correct: boolean };
  sentence?: string;
  calibration?: {
    answers: Record<string, { choice: number; confidence: number; correct: boolean }>;
    summary?: CalibrationSummary;
  };
  frontier?: { sorts: Record<string, SortChoice>; revealed?: boolean; score?: number };
  trustmap?: { placements: Record<string, { x: number; y: number }>; compared?: boolean };
  bias?: { prediction: 'equal' | 'unequal' | 'unsure' };
  dilemmas?: Partial<Record<DilemmaId, string>>;
  moving?: { horizonGuess?: number; stillTrue?: Record<string, boolean> };
  keep?: string[];
  rules?: string[];
}

const KEY = 'confident-machine/case-file/v1';
type Listener = (state: CaseFile) => void;

function load(): CaseFile {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CaseFile) : {};
  } catch {
    return {};
  }
}

function save(state: CaseFile): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage unavailable: the page still works for this visit */
  }
}

let state: CaseFile = load();
const listeners = new Set<Listener>();

export const caseFile = {
  get(): CaseFile {
    return state;
  },
  update(mutate: (draft: CaseFile) => void): void {
    const draft: CaseFile = structuredClone(state);
    mutate(draft);
    state = draft;
    save(state);
    listeners.forEach((fn) => fn(state));
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  reset(): void {
    state = {};
    try {
      window.localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
    listeners.forEach((fn) => fn(state));
  },
};

/** How many of the case file's sections the reader has filled in. */
export function filledCount(file: CaseFile): number {
  let n = 0;
  if (file.opening) n += 1;
  if (file.prediction) n += 1;
  if (file.calibration?.summary) n += 1;
  if (file.frontier?.revealed) n += 1;
  if (file.trustmap && Object.keys(file.trustmap.placements).length) n += 1;
  if (file.bias) n += 1;
  if (file.dilemmas && Object.keys(file.dilemmas).length) n += 1;
  if (file.moving?.stillTrue && Object.keys(file.moving.stillTrue).length) n += 1;
  if (file.keep?.length) n += 1;
  return n;
}
