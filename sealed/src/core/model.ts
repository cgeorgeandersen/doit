/**
 * The shapes a poll is made of, and the checks every poll and ballot must pass.
 * Shared by the browser (to explain a problem before sending) and the server
 * (which never trusts the browser and checks again).
 */

/** How each person votes. */
export type Method = 'rate' | 'pick' | 'rank';

/** What everyone sees once the votes are opened. */
export type Show = 'scores' | 'order' | 'winner';

export interface Choice {
  id: string;
  label: string;
  /** Optional link: a trailer, a menu, a listing. Always http(s). */
  link?: string;
}

export interface Poll {
  id: string;
  title: string;
  method: Method;
  /** The top of the rating scale (1 to `scale`); only used when method is 'rate'. */
  scale: number;
  show: Show;
  choices: Choice[];
  createdAt: number;
}

/** A voter as anyone can see them: a name, and whether they've voted. Never what. */
export interface VoterStatus {
  id: string;
  name: string;
  /** Someone has picked this name on a device. */
  taken: boolean;
  voted: boolean;
}

/**
 * One person's vote.
 * - rate: a rating from 1 to `scale` for every choice
 * - pick: one choice
 * - rank: every choice, best first
 */
export type Ballot =
  | { method: 'rate'; ratings: Record<string, number> }
  | { method: 'pick'; choice: string }
  | { method: 'rank'; order: string[] };

export interface Standing {
  choiceId: string;
  label: string;
  link?: string;
  /** 1 is the winner. Tied choices share a place. */
  place: number;
  /** Omitted unless the poll shows scores. */
  score?: number;
  /** Ratings only: the average rating. Omitted unless the poll shows scores. */
  average?: number;
}

export interface Results {
  ballots: number;
  /** Everything in first place: one winner, or a tie. */
  winners: string[];
  /** Every choice in order, or only the winners when the poll shows just the winner. */
  standings: Standing[];
  /** Ratings: the most points possible; picks: the ballots; ranking: points for first on every ballot. */
  maxScore?: number;
}

/** What GET /api/poll returns. Holds no one's ballot, ever. */
export interface PollView {
  poll: Poll;
  voters: VoterStatus[];
  closed: boolean;
  closedAt?: number;
  /** Only once closed. */
  results?: Results;
}

export interface NewPoll {
  title: string;
  method: Method;
  scale?: number;
  show: Show;
  choices: Array<{ label: string; link?: string }>;
  voters: string[];
}

export const LIMITS = {
  title: 120,
  label: 120,
  link: 500,
  name: 40,
  minChoices: 2,
  maxChoices: 30,
  minVoters: 2,
  maxVoters: 40,
  scales: [5, 10] as readonly number[],
};

export const METHODS: readonly Method[] = ['rate', 'pick', 'rank'];
export const SHOWS: readonly Show[] = ['scores', 'order', 'winner'];

/** Collapses runs of whitespace and trims, so " Sam  " and "Sam" are the same name. */
export function tidy(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function sameName(a: string, b: string): boolean {
  return tidy(a).toLocaleLowerCase() === tidy(b).toLocaleLowerCase();
}

export function isWebLink(link: string): boolean {
  try {
    const url = new URL(link);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** Accepts "youtube.com/watch?v=…" as well as full links. */
export function normalizeLink(link: string): string {
  const trimmed = link.trim();
  if (!trimmed) return '';
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Checks a name someone types for themselves. Returns a problem, or null. */
export function checkName(name: string, others: string[]): string | null {
  const clean = tidy(name);
  if (!clean) return 'Type a name.';
  if (clean.length > LIMITS.name) return `Names can be up to ${LIMITS.name} characters.`;
  if (others.some((other) => sameName(other, clean))) return `${clean} is already on the list.`;
  return null;
}

/**
 * Checks a poll before it's created and returns it tidied, or the first problem
 * in the order the form asks for things.
 */
export function checkNewPoll(input: unknown): { ok: true; poll: NewPoll } | { ok: false; error: string } {
  const fail = (error: string) => ({ ok: false as const, error });
  if (!input || typeof input !== 'object') return fail('Missing the poll.');
  const raw = input as Record<string, unknown>;

  const title = tidy(String(raw.title ?? ''));
  if (!title) return fail('Say what you’re deciding.');
  if (title.length > LIMITS.title) return fail(`The title can be up to ${LIMITS.title} characters.`);

  const method = raw.method as Method;
  if (!METHODS.includes(method)) return fail('Choose how everyone votes.');
  let scale: number | undefined;
  if (method === 'rate') {
    scale = Number(raw.scale ?? 10);
    if (!LIMITS.scales.includes(scale)) return fail('Ratings go from 1 to 5 or 1 to 10.');
  }

  const show = raw.show as Show;
  if (!SHOWS.includes(show)) return fail('Choose what everyone sees at the end.');

  if (!Array.isArray(raw.choices)) return fail('Add the choices.');
  const choices: NewPoll['choices'] = [];
  for (const item of raw.choices) {
    const entry = (item ?? {}) as Record<string, unknown>;
    const label = tidy(String(entry.label ?? ''));
    const link = normalizeLink(String(entry.link ?? ''));
    if (!label) {
      if (link) return fail('A choice has a link but no name.');
      continue;
    }
    if (label.length > LIMITS.label) return fail(`Choices can be up to ${LIMITS.label} characters.`);
    if (choices.some((c) => sameName(c.label, label))) return fail(`“${label}” is on the list twice.`);
    if (link) {
      if (link.length > LIMITS.link || !isWebLink(link)) return fail(`The link for “${label}” isn’t a web address.`);
      choices.push({ label, link });
    } else {
      choices.push({ label });
    }
  }
  if (choices.length < LIMITS.minChoices) return fail(`Add at least ${LIMITS.minChoices} choices.`);
  if (choices.length > LIMITS.maxChoices) return fail(`A poll can have up to ${LIMITS.maxChoices} choices.`);

  if (!Array.isArray(raw.voters)) return fail('Add who’s voting.');
  const voters: string[] = [];
  for (const item of raw.voters) {
    const name = tidy(String(item ?? ''));
    if (!name) continue;
    const problem = checkName(name, voters);
    if (problem) return fail(problem);
    voters.push(name);
  }
  if (voters.length < LIMITS.minVoters) return fail(`Add at least ${LIMITS.minVoters} people, including you.`);
  if (voters.length > LIMITS.maxVoters) return fail(`A poll can have up to ${LIMITS.maxVoters} people.`);

  return { ok: true, poll: { title, method, ...(scale ? { scale } : {}), show, choices, voters } };
}

/** Checks a ballot against its poll. Returns a problem, or null. */
export function checkBallot(poll: Poll, input: unknown): string | null {
  if (!input || typeof input !== 'object') return 'Missing the vote.';
  const ballot = input as Record<string, unknown>;
  if (ballot.method !== poll.method) return 'This vote is for a different kind of poll.';
  const ids = poll.choices.map((c) => c.id);

  if (poll.method === 'rate') {
    const ratings = ballot.ratings as Record<string, unknown> | undefined;
    if (!ratings || typeof ratings !== 'object') return 'Rate every choice.';
    if (Object.keys(ratings).some((key) => !ids.includes(key))) return 'The vote names a choice that isn’t in this poll.';
    for (const id of ids) {
      const value = ratings[id];
      if (value === undefined) return 'Rate every choice.';
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > poll.scale) {
        return `Ratings go from 1 to ${poll.scale}.`;
      }
    }
    return null;
  }

  if (poll.method === 'pick') {
    if (typeof ballot.choice !== 'string' || !ids.includes(ballot.choice)) return 'Pick one choice.';
    return null;
  }

  const order = ballot.order;
  if (!Array.isArray(order) || order.length !== ids.length || new Set(order).size !== ids.length) {
    return 'Put every choice in order.';
  }
  if (order.some((id) => !ids.includes(id))) return 'The vote names a choice that isn’t in this poll.';
  return null;
}

/** "Rate each choice from 1 to 10", for headings and the home page. */
export function describeMethod(method: Method, scale: number): string {
  if (method === 'rate') return `Rate each choice from 1 to ${scale}`;
  if (method === 'pick') return 'Pick one choice';
  return 'Rank the choices, best first';
}
