/** Who is talking. The prosecutor, the defense and the bailiff are the same people in every case. */
export type Speaker = 'pros' | 'def' | 'defendant' | 'witness' | 'bailiff';

export interface Line {
  who: Speaker;
  text: string;
}

/** How a character is drawn: a little SVG person, or an emoji for the odd raccoon. */
export type Look =
  | {
      skin: string;
      hair: string;
      hairStyle: 'short' | 'long' | 'bald' | 'bun' | 'curly' | 'spiky' | 'gray';
      shirt: string;
      extras?: Array<'glasses' | 'beard' | 'mustache' | 'cap' | 'bow' | 'tie' | 'earrings' | 'headlamp'>;
    }
  | { emoji: string };

export interface Character {
  name: string;
  look: Look;
}

/** A lawyer shouts mid-case and the judge rules on it. Flavor only: it never changes the score. */
export interface Objection {
  /** Index into `lines`: the objection comes right after this line. */
  after: number;
  by: 'pros' | 'def';
  text: string;
  sustained: Line;
  overruled: Line;
}

/**
 * The sentence scale every case is measured on, from 0 (set free) to 10 (death).
 * Fines run 1 to 3, community service 1 to 2.5, probation 2 to 4, prison 5 to 9
 * and life about 9.3. See `severity()` in sentence.ts.
 */
export type Severity = number;

export interface Case {
  id: string;
  title: string;
  charge: string;
  /** Silly cases keep the player laughing; serious ones have no easy answer. */
  tone: 'silly' | 'serious' | 'mixed';
  defendant: Character & { age: number; blurb: string };
  witness?: Character;
  lines: Line[];
  objection?: Objection;
  /** Shouts from the gallery when it erupts. */
  gallery: string[];
  /** The range of sentences legal experts would call proportionate. */
  fair: [Severity, Severity];
  /** Legal experts genuinely disagree, so a ruling in the fair range is called split, never simply right. */
  contested?: boolean;
  /** What the gallery wants. Often not the same as fair, which is the point. */
  crowd: Severity;
  /** A creative sentence only this case offers. */
  special?: { label: string; severity: Severity; headline: string };
  headlines: {
    /** Below the fair range. Needed whenever setting them free would be below it. */
    lenient?: string;
    fair: string;
    harsh: string;
    /** So far above the fair range that the appeals court overturns it. */
    absurd?: string;
    /** Overrides the band's headline when the defendant walks. */
    free?: string;
    /** Overrides the band's headline for the death penalty. */
    death?: string;
  };
}
