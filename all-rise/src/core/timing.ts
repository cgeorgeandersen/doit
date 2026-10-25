/*
 * How long each beat of a case takes, in milliseconds. The UI plays at these
 * speeds and tests/cases.test.ts uses them to check that every case fits in
 * 45 seconds, ruling included.
 */
export const TYPE_MS_PER_CHAR = 22;
export const INTRO_MS = 2800;
/** Time to answer an objection before the bailiff answers for you. */
export const OBJECTION_MS = 6000;
/** A typical ruling: pick a sentence, slide it, strike the gavel. */
export const RULING_MS = 9000;

/** Typing the line plus enough time to finish reading it. */
export function lineMs(text: string): number {
  return text.length * TYPE_MS_PER_CHAR + holdMs(text);
}

export function holdMs(text: string): number {
  return 900 + text.length * 16;
}
