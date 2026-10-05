/**
 * The shape of the assessment. The words themselves live in src/content.ts;
 * this file only says what each piece is, so a typo there shows up as a type
 * error instead of a broken page.
 */

/** Who the answers describe: chosen on the first screen. */
export type Mode = 'department' | 'company';

export const MODES: readonly Mode[] = ['department', 'company'];

/**
 * A piece of text that reads the same for both modes, or a version for each:
 * { department: '…', company: '…' }.
 */
export type Text = string | Readonly<Record<Mode, string>>;

/** A framework on georgeandersen.net, drawn as its element chip (Ct, Ff, …). */
export interface Framework {
  title: string;
  /** The element symbol, as on the portfolio. */
  symbol: string;
  /** The color slot the portfolio gives it: 0 for the philosophy, then 1–4 for the methods. */
  color: 0 | 1 | 2 | 3 | 4;
  /** Its page, relative to the portfolio's address, e.g. "/frameworks/calibrated-trust". */
  path: string;
}

export interface Question {
  /** Stable name for the question; never shown. */
  id: string;
  prompt: Text;
  /** Exactly four situations, least ready first. They score 0, 1, 2 and 3 in this order. */
  options: readonly Text[];
  /** One concrete thing to do when this question is someone's weakest in a gap. */
  nextStep: Text;
}

export interface Dimension {
  id: string;
  name: string;
  /** The question the dimension asks, shown with it, like a framework's question. */
  asks: string;
  /** Key into `frameworks`: the framework the next steps point to. */
  framework: string;
  questions: readonly Question[];
}

export interface Stage {
  id: string;
  name: string;
  /** The lowest average answer (0–3) that reaches this stage. The first stage starts at 0. */
  minAverage: number;
  /** One sentence. */
  definition: string;
  /** One sentence on what gets you to the next stage (or keeps you at the last one). */
  next: string;
}

/** How a result is worked out. Words about these rules live in the results copy. */
export interface Rules {
  /**
   * How many stages the overall result may sit above the weakest dimension.
   * 1 means one weak link holds the whole result to one step above it.
   * null turns the rule off.
   */
  weakestLinkCap: number | null;
  /** How many gaps to show. */
  gapCount: number;
}

/** Everything the scoring needs, and nothing it doesn't. */
export interface ScoringModel {
  dimensions: readonly Dimension[];
  stages: readonly Stage[];
  rules: Rules;
}

/** Picks the text for the reader's mode. */
export function say(text: Text, mode: Mode): string {
  return typeof text === 'string' ? text : text[mode];
}

/** Every question in order, with the dimension it belongs to. */
export function allQuestions(dimensions: readonly Dimension[]): { dimension: Dimension; question: Question; dimensionIndex: number }[] {
  return dimensions.flatMap((dimension, dimensionIndex) => dimension.questions.map((question) => ({ dimension, question, dimensionIndex })));
}
