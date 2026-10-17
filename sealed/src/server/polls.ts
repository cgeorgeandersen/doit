import {
  checkBallot,
  checkName,
  checkNewPoll,
  LIMITS,
  tidy,
  type Ballot,
  type Poll,
  type PollView,
  type VoterStatus,
} from '../core/model.js';
import { tally } from '../core/tally.js';
import type { Store } from './store.js';

/**
 * Everything a poll can do, on top of a Store. The rule that matters most:
 * nothing here returns a ballot to anyone but the person who cast it, and the
 * results are counted only once the poll is closed.
 */

/** Polls, ballots and all, are deleted this long after their last change. */
export const TTL_SECONDS = 60 * 60 * 24 * 60;

export class PollError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface PollRecord extends Poll {
  /** SHA-256 of the host's key. The key itself is only ever in the host's link. */
  adminHash: string;
}

interface VoterRecord {
  name: string;
  addedAt: number;
}

const keys = {
  poll: (id: string) => `sealed:poll:${id}`,
  voters: (id: string) => `sealed:poll:${id}:voters`,
  tokens: (id: string) => `sealed:poll:${id}:tokens`,
  ballots: (id: string) => `sealed:poll:${id}:ballots`,
  closed: (id: string) => `sealed:poll:${id}:closed`,
};

// No 0/o or 1/l, so an id read aloud or typed from a screen comes out right.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';

export function randomId(length: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function createPoll(
  store: Store,
  input: unknown,
  now = Date.now(),
): Promise<{ id: string; adminKey: string }> {
  const checked = checkNewPoll(input);
  if (!checked.ok) throw new PollError(400, checked.error);
  const { title, method, scale, show, choices, voters } = checked.poll;

  const id = randomId(10);
  const adminKey = randomId(32);
  const record: PollRecord = {
    id,
    title,
    method,
    scale: scale ?? 10,
    show,
    choices: choices.map((choice, i) => ({ id: `c${i + 1}`, ...choice })),
    createdAt: now,
    adminHash: await sha256(adminKey),
  };
  if (!(await store.set(keys.poll(id), JSON.stringify(record), TTL_SECONDS, true))) {
    throw new PollError(500, 'Couldn’t save the poll. Try again.');
  }
  // addedAt keeps the names in the order they were typed.
  for (const [i, name] of voters.entries()) {
    const voter: VoterRecord = { name, addedAt: now + i };
    await store.hset(keys.voters(id), randomId(8), JSON.stringify(voter), TTL_SECONDS);
  }
  return { id, adminKey };
}

async function loadRecord(store: Store, id: string): Promise<PollRecord> {
  const raw = typeof id === 'string' && /^[a-z0-9]{4,20}$/.test(id) ? await store.get(keys.poll(id)) : null;
  if (!raw) throw new PollError(404, 'This poll doesn’t exist, or it’s more than 60 days old.');
  return JSON.parse(raw) as PollRecord;
}

function publicPoll(record: PollRecord): Poll {
  const { adminHash: _adminHash, ...poll } = record;
  return poll;
}

async function loadVoters(store: Store, id: string): Promise<Array<{ id: string } & VoterRecord>> {
  const voters = await store.hgetall(keys.voters(id));
  return Object.entries(voters)
    .map(([voterId, raw]) => ({ id: voterId, ...(JSON.parse(raw) as VoterRecord) }))
    .sort((a, b) => a.addedAt - b.addedAt);
}

/**
 * The poll as anyone with the link sees it: who's voting and who's done, and
 * the results once everyone has voted (or the host opened them early).
 */
export async function viewPoll(store: Store, id: string, now = Date.now()): Promise<PollView> {
  const record = await loadRecord(store, id);
  const [voters, tokens, ballots, closedRaw] = await Promise.all([
    loadVoters(store, id),
    store.hgetall(keys.tokens(id)),
    store.hgetall(keys.ballots(id)),
    store.get(keys.closed(id)),
  ]);

  let closedAt = closedRaw ? Number(closedRaw) : undefined;
  const everyoneVoted = voters.length > 0 && voters.every((v) => v.id in ballots);
  if (closedAt === undefined && everyoneVoted) {
    // The last ballot closes the poll. NX means the first close sticks if two land at once.
    await store.set(keys.closed(id), String(now), TTL_SECONDS, true);
    closedAt = Number((await store.get(keys.closed(id))) ?? now);
  }

  const statuses: VoterStatus[] = voters.map((v) => ({
    id: v.id,
    name: v.name,
    taken: v.id in tokens,
    voted: v.id in ballots,
  }));
  const poll = publicPoll(record);
  if (closedAt === undefined) return { poll, voters: statuses, closed: false };

  // Only ballots from people still on the list count; removing someone removes their vote.
  const counted = voters.flatMap((v) => (ballots[v.id] ? [JSON.parse(ballots[v.id]!) as Ballot] : []));
  return { poll, voters: statuses, closed: true, closedAt, results: tally(poll, counted) };
}

async function ensureOpen(store: Store, id: string): Promise<void> {
  if (await store.get(keys.closed(id))) throw new PollError(409, 'The votes are already open, so this poll is finished.');
}

/** Adds someone who wasn't on the list, and signs them in on this device. */
export async function join(
  store: Store,
  id: string,
  name: unknown,
  now = Date.now(),
): Promise<{ voterId: string; token: string }> {
  await loadRecord(store, id);
  await ensureOpen(store, id);
  const voters = await loadVoters(store, id);
  const problem = checkName(String(name ?? ''), voters.map((v) => v.name));
  if (problem) throw new PollError(400, problem);
  if (voters.length >= LIMITS.maxVoters) throw new PollError(400, 'This poll is full.');

  const voterId = randomId(8);
  const voter: VoterRecord = { name: tidy(String(name)), addedAt: now };
  await store.hset(keys.voters(id), voterId, JSON.stringify(voter), TTL_SECONDS);
  const token = randomId(32);
  await store.hset(keys.tokens(id), voterId, await sha256(token), TTL_SECONDS);
  return { voterId, token };
}

/**
 * "I'm Sam": picks a name on the list for this device. The first device to
 * pick a name keeps it, so no one else can vote as Sam. The host can free it.
 */
export async function claim(store: Store, id: string, voterId: unknown): Promise<{ token: string }> {
  await loadRecord(store, id);
  await ensureOpen(store, id);
  const voters = await loadVoters(store, id);
  if (typeof voterId !== 'string' || !voters.some((v) => v.id === voterId)) {
    throw new PollError(404, 'That name isn’t on the list any more.');
  }
  const token = randomId(32);
  if (!(await store.hset(keys.tokens(id), voterId, await sha256(token), TTL_SECONDS, true))) {
    throw new PollError(
      409,
      'Someone already picked this name on another device. If that was you, ask the host to free it up.',
    );
  }
  return { token };
}

async function checkVoter(store: Store, id: string, voterId: unknown, token: unknown): Promise<string> {
  if (typeof voterId !== 'string' || typeof token !== 'string') throw new PollError(401, 'Pick your name first.');
  const tokens = await store.hgetall(keys.tokens(id));
  if (!tokens[voterId] || tokens[voterId] !== (await sha256(token))) {
    throw new PollError(401, 'This device isn’t signed in as that person any more. Pick your name again.');
  }
  return voterId;
}

/** Seals (or replaces) this person's ballot. Returns the poll, which this ballot may have closed. */
export async function vote(
  store: Store,
  id: string,
  voterId: unknown,
  token: unknown,
  ballot: unknown,
  now = Date.now(),
): Promise<PollView> {
  const record = await loadRecord(store, id);
  await ensureOpen(store, id);
  const voter = await checkVoter(store, id, voterId, token);
  const problem = checkBallot(record, ballot);
  if (problem) throw new PollError(400, problem);
  await store.hset(keys.ballots(id), voter, JSON.stringify(cleanBallot(ballot as Ballot)), TTL_SECONDS);
  return viewPoll(store, id, now);
}

/** Keeps only the fields a ballot has, so nothing extra a browser sent is stored. */
function cleanBallot(ballot: Ballot): Ballot {
  if (ballot.method === 'rate') return { method: 'rate', ratings: { ...ballot.ratings } };
  if (ballot.method === 'pick') return { method: 'pick', choice: ballot.choice };
  return { method: 'rank', order: [...ballot.order] };
}

/** Your own ballot, so you can change it. Nobody else's, ever. */
export async function myBallot(store: Store, id: string, voterId: unknown, token: unknown): Promise<Ballot | null> {
  await loadRecord(store, id);
  const voter = await checkVoter(store, id, voterId, token);
  const raw = (await store.hgetall(keys.ballots(id)))[voter];
  return raw ? (JSON.parse(raw) as Ballot) : null;
}

async function checkHost(store: Store, id: string, adminKey: unknown): Promise<PollRecord> {
  const record = await loadRecord(store, id);
  if (typeof adminKey !== 'string' || (await sha256(adminKey)) !== record.adminHash) {
    throw new PollError(403, 'Only the host can do that, from the host link.');
  }
  return record;
}

/** The host opens the votes before everyone's in: someone couldn't make it. */
export async function reveal(store: Store, id: string, adminKey: unknown, now = Date.now()): Promise<PollView> {
  await checkHost(store, id, adminKey);
  const ballots = await store.hgetall(keys.ballots(id));
  if (Object.keys(ballots).length === 0) throw new PollError(400, 'No one has voted yet.');
  await store.set(keys.closed(id), String(now), TTL_SECONDS, true);
  return viewPoll(store, id, now);
}

/** Takes someone off the list, with their vote. If everyone left has voted, that closes the poll. */
export async function removeVoter(
  store: Store,
  id: string,
  adminKey: unknown,
  voterId: unknown,
  now = Date.now(),
): Promise<PollView> {
  await checkHost(store, id, adminKey);
  await ensureOpen(store, id);
  const voters = await loadVoters(store, id);
  if (typeof voterId !== 'string' || !voters.some((v) => v.id === voterId)) {
    throw new PollError(404, 'That name isn’t on the list any more.');
  }
  if (voters.length <= 2) throw new PollError(400, 'A poll needs at least 2 people.');
  await store.hdel(keys.voters(id), voterId);
  await store.hdel(keys.tokens(id), voterId);
  await store.hdel(keys.ballots(id), voterId);
  return viewPoll(store, id, now);
}

/**
 * Frees a name that was picked on a lost or wrong device. Their vote goes too,
 * and they vote again: otherwise whoever picked the name next could read it.
 */
export async function release(
  store: Store,
  id: string,
  adminKey: unknown,
  voterId: unknown,
  now = Date.now(),
): Promise<PollView> {
  await checkHost(store, id, adminKey);
  if (typeof voterId !== 'string') throw new PollError(400, 'Missing the person.');
  await ensureOpen(store, id);
  await store.hdel(keys.tokens(id), voterId);
  await store.hdel(keys.ballots(id), voterId);
  return viewPoll(store, id, now);
}
