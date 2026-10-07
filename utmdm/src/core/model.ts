/**
 * The data UTMDM keeps. Everything here is plain JSON, so a workspace can be
 * saved in the browser today and in a database tomorrow without changing shape.
 */

export const UTM_PARTS = ['source', 'medium', 'campaign', 'content', 'term'] as const;
export type UtmPart = (typeof UTM_PARTS)[number];
export type UtmParts = Record<UtmPart, string>;

/** What a rule reads: one UTM part, or all five together ("any"). */
export type RuleTarget = UtmPart | 'any';

export const MATCH_TYPES = ['contains', 'exact', 'starts_with', 'regex'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

/**
 * One UTM in the permanent table. Spellings that differ only in case, spacing
 * or URL encoding ("FB / Paid_Social" and "fb / paid_social") are the same UTM:
 * they merge into one record, and every spelling is kept.
 */
export interface Utm {
  key: string;            // the normalized parts, joined: the record's identity
  parts: UtmParts;        // normalized
  raw: UtmParts;          // as first seen
  spellings: string[];    // every distinct raw spelling seen, as "source / medium / …"
  firstSeen: string;      // the first period it appeared in, e.g. "2026-03"
  lastSeen: string;
  sessions: number;
  keyEvents: number;
}

/** A classification: a controlled list of values, so "Paid Social" can't drift into "paid-social". */
export interface Field {
  id: string;
  name: string;
  target: UtmPart;        // the UTM part its rules usually read
  description: string;
  values: string[];
}

/** Rules are data, not code: when this part matches this pattern, this field gets this value. */
export interface Rule {
  id: string;             // R1, R2, … never reused
  field: string;
  target: RuleTarget;
  match: MatchType;
  pattern: string;
  value: string;
  priority: number;       // lower wins; a tie that disagrees is a conflict
  active: boolean;
  author: string;
  createdAt: string;
  note: string;
}

export interface Coverage {
  utms: number;
  classified: number;     // every field has a value
  conflicts: number;      // at least one field where rules tie and disagree
  sessions: number;
  classifiedSessions: number;
}

/** Every change to the rules is a new version: a full copy of the rules, plus how far they got. */
export interface Version {
  number: number;
  at: string;
  author: string;
  message: string;
  rules: Rule[];
  coverage: Coverage;
}

/** One pull of UTMs from a source (GA4, or the demo's sample). */
export interface Refresh {
  at: string;
  source: string;
  period: string;
  rows: number;
  newUtms: number;
  updatedUtms: number;
  newKeys: string[];      // the UTMs this refresh added to the table
  coverage: Coverage;
}

export interface Workspace {
  schema: 1;
  user: string;
  fields: Field[];
  utms: Utm[];
  rules: Rule[];          // the current version's rules
  versions: Version[];
  refreshes: Refresh[];
  sampleCursor: number;   // the next month the demo's sample source will return
}

/** One row as a source reports it: a UTM, a period, and its traffic. */
export interface SourceRow extends UtmParts {
  period: string;
  sessions: number;
  keyEvents: number;
}
