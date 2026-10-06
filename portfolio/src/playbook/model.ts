/**
 * The shape of the playbook. The words live in content.ts; this file only says
 * what each piece is, so a typo there shows up as a type error instead of a
 * broken page.
 *
 * The playbook and the assessment describe the same six things: each play
 * answers one of the assessment's dimensions (by its id), takes its framework
 * from that dimension, and lists the top answer to each of its three
 * questions as "you'll know it's working when". tests/playbook-content.test.mjs
 * checks they stay in step.
 */

/** Where the playbook lives (src/pages/playbook.astro). Each play is at /playbook#<its dimension's id>. */
export const PLAYBOOK_PATH = '/playbook';

/** A small diagram inside a play: an ordered list of steps, or a grid. */
export type Figure =
  | {
      kind: 'steps';
      /** The figure's caption, like "The four questions, in order". */
      label: string;
      /** In order. `then` is what follows from the step, after an arrow. */
      steps: readonly { term: string; then?: string }[];
    }
  | {
      kind: 'grid';
      label: string;
      /** What the row names describe, read aloud before them (the empty top-left cell). */
      corner: string;
      columns: readonly string[];
      /** Each row: its name, then one cell per column. */
      rows: readonly { name: string; cells: readonly string[] }[];
    };

/** One sign of the ideal: the top answer to one of the assessment's questions, said as something you'd see. */
export interface Sign {
  /** The assessment question it answers, by id (src/assessment/content.ts). */
  question: string;
  text: string;
}

export interface Play {
  /** The assessment dimension it answers, by id. Its framework and its anchor (/playbook#id) come from there. */
  dimension: string;
  /** What to do, in a few words: "Sequence by risk". */
  title: string;
  /** The line to remember at work on an ordinary Tuesday. */
  model: string;
  /** Why the play works, in a sentence, when the line to remember doesn't say it already. */
  why?: string;
  /** The ideal: one sign for each of the dimension's three questions, in the assessment's order. */
  working: readonly Sign[];
  /** What it looks like before you get there. */
  notYet: readonly string[];
  /** The first moves that close the gap. */
  bridge: readonly string[];
  figure: Figure;
}

/** A rule that holds at every risk tier, with the framework it comes from (a file name in src/content/frameworks/). */
export interface Guardrail {
  framework: string;
  text: string;
}
