import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PollView } from '../src/core/model';
import { handle } from '../src/server/handler';
import { redisStore, storeFromEnv } from '../src/server/redis';
import { memoryStore, type Store } from '../src/server/store';
import { fakeUpstash } from './fake-upstash';

let store: Store;

async function call(body: Record<string, unknown>): Promise<{ status: number; data: any }> {
  const response = await handle(
    new Request('http://localhost/api/poll', { method: 'POST', body: JSON.stringify(body) }),
    store,
  );
  return { status: response.status, data: await response.json() };
}

async function view(id: string): Promise<{ status: number; data: PollView; text: string }> {
  const response = await handle(new Request(`http://localhost/api/poll?id=${id}`), store);
  const text = await response.text();
  return { status: response.status, data: JSON.parse(text), text };
}

const moviePoll = {
  title: 'Movie night',
  method: 'rate',
  scale: 10,
  show: 'scores',
  choices: [{ label: 'Arrival' }, { label: 'Heat' }, { label: 'Up' }],
  voters: ['George', 'Sam', 'Alex'],
};

/** Creates the poll and signs each person in on their own "device". */
async function setUp(poll: Record<string, unknown> = moviePoll) {
  const created = await call({ action: 'create', poll });
  expect(created.status).toBe(201);
  const { id, adminKey } = created.data as { id: string; adminKey: string };
  const people: Record<string, { voterId: string; token: string }> = {};
  for (const voter of (await view(id)).data.voters) {
    const claimed = await call({ action: 'claim', id, voterId: voter.id });
    people[voter.name] = { voterId: voter.id, token: claimed.data.token };
  }
  return { id, adminKey, people };
}

const rate = (c1: number, c2: number, c3: number) => ({ method: 'rate', ratings: { c1, c2, c3 } });

// Every test runs twice: on the in-memory store `npm run dev` uses, and on the
// Upstash REST client production uses (talking to a fake Upstash).
describe.each([
  ['memory', () => memoryStore()],
  [
    'Upstash REST',
    () => {
      vi.stubGlobal('fetch', fakeUpstash('https://fake.upstash.io', 'secret'));
      return redisStore('https://fake.upstash.io/', 'secret');
    },
  ],
] as const)('on the %s store', (_name, makeStore) => {
  beforeEach(() => {
    store = makeStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('a poll from start to finish', () => {
    it('keeps every vote secret until the last one is in, then shows only the totals', async () => {
      const { id, people } = await setUp();

      await call({ action: 'vote', id, ...people.George, ballot: rate(9, 4, 7) });
      await call({ action: 'vote', id, ...people.Sam, ballot: rate(6, 8, 7) });

      const midway = await view(id);
      expect(midway.data.closed).toBe(false);
      expect(midway.data.results).toBeUndefined();
      expect(midway.data.voters.map((v) => [v.name, v.voted])).toEqual([
        ['George', true],
        ['Sam', true],
        ['Alex', false],
      ]);
      // No rating appears anywhere in what anyone can fetch.
      expect(midway.text).not.toMatch(/ratings|"9"|:9\b/);

      const last = await call({ action: 'vote', id, ...people.Alex, ballot: rate(5, 5, 10) });
      expect(last.data.closed).toBe(true);
      expect(last.data.results.winners).toEqual(['c3']);
      expect(last.data.results.standings.map((s: any) => [s.label, s.score])).toEqual([
        ['Up', 24],
        ['Arrival', 20],
        ['Heat', 17],
      ]);
      expect(JSON.stringify(last.data)).not.toMatch(/ratings/);
    });

    it('lets you change your vote until the end, and read back only your own', async () => {
      const { id, people } = await setUp();
      await call({ action: 'vote', id, ...people.George, ballot: rate(1, 1, 1) });
      await call({ action: 'vote', id, ...people.George, ballot: rate(2, 3, 4) });
      const mine = await call({ action: 'myBallot', id, ...people.George });
      expect(mine.data.ballot).toEqual(rate(2, 3, 4));

      const sams = await call({ action: 'myBallot', id, voterId: people.George!.voterId, token: people.Sam!.token });
      expect(sams.status).toBe(401);
    });

    it('closes the poll for good once the votes are open', async () => {
      const { id, people } = await setUp();
      for (const name of ['George', 'Sam', 'Alex']) await call({ action: 'vote', id, ...people[name], ballot: rate(5, 5, 5) });
      const again = await call({ action: 'vote', id, ...people.George, ballot: rate(1, 1, 10) });
      expect(again.status).toBe(409);
      const joined = await call({ action: 'join', id, name: 'Latecomer' });
      expect(joined.status).toBe(409);
    });
  });

  describe('who can vote as whom', () => {
    it('gives a name to the first device that picks it', async () => {
      const { id, people } = await setUp();
      const second = await call({ action: 'claim', id, voterId: people.Sam!.voterId });
      expect(second.status).toBe(409);
      const forged = await call({ action: 'vote', id, voterId: people.Sam!.voterId, token: 'guess', ballot: rate(1, 1, 1) });
      expect(forged.status).toBe(401);
    });

    it('lets someone add themselves, and then waits for them too', async () => {
      const { id, people } = await setUp();
      const joined = await call({ action: 'join', id, name: 'Robin' });
      expect(joined.status).toBe(200);
      for (const name of ['George', 'Sam', 'Alex']) await call({ action: 'vote', id, ...people[name], ballot: rate(5, 5, 5) });
      expect((await view(id)).data.closed).toBe(false);
      const robin = await call({ action: 'vote', id, ...joined.data, ballot: rate(5, 5, 5) });
      expect(robin.data.closed).toBe(true);

      expect((await call({ action: 'join', id: (await setUp()).id, name: 'sam' })).data.error).toBe('sam is already on the list.');
    });
  });

  describe('the host', () => {
    it('can open the votes early, but only with the host key', async () => {
      const { id, adminKey, people } = await setUp();
      expect((await call({ action: 'reveal', id, adminKey })).status).toBe(400); // no votes yet
      await call({ action: 'vote', id, ...people.George, ballot: rate(9, 4, 7) });
      expect((await call({ action: 'reveal', id, adminKey: 'nope' })).status).toBe(403);
      const opened = await call({ action: 'reveal', id, adminKey });
      expect(opened.data.closed).toBe(true);
      expect(opened.data.results.ballots).toBe(1);
    });

    it('can take someone off the list, which can close the poll', async () => {
      const { id, adminKey, people } = await setUp();
      await call({ action: 'vote', id, ...people.George, ballot: rate(9, 4, 7) });
      await call({ action: 'vote', id, ...people.Sam, ballot: rate(6, 8, 7) });
      const removed = await call({ action: 'remove', id, adminKey, voterId: people.Alex!.voterId });
      expect(removed.data.voters).toHaveLength(2);
      expect(removed.data.closed).toBe(true);
    });

    it('can free a name, which also clears that vote so no one can read it', async () => {
      const { id, adminKey, people } = await setUp();
      await call({ action: 'vote', id, ...people.Sam, ballot: rate(6, 8, 7) });
      await call({ action: 'release', id, adminKey, voterId: people.Sam!.voterId });
      const sam = (await view(id)).data.voters.find((v) => v.name === 'Sam')!;
      expect(sam).toMatchObject({ taken: false, voted: false });

      const newDevice = await call({ action: 'claim', id, voterId: sam.id });
      const peek = await call({ action: 'myBallot', id, voterId: sam.id, token: newDevice.data.token });
      expect(peek.data.ballot).toBeNull();
      // The old device is signed out.
      expect((await call({ action: 'myBallot', id, ...people.Sam })).status).toBe(401);
    });
  });

});

describe('requests that go wrong', () => {
  beforeEach(() => {
    store = memoryStore();
  });

  it('explains each problem', async () => {
    expect((await view('nothere1')).status).toBe(404);
    expect((await call({ action: 'create', poll: { ...moviePoll, voters: ['Solo'] } })).data.error).toMatch(/at least 2 people/);
    expect((await call({ action: 'dance' })).status).toBe(400);
    const notJson = await handle(new Request('http://localhost/api/poll', { method: 'POST', body: '{' }), store);
    expect(notJson.status).toBe(400);
  });

  it('says so when no database is connected', async () => {
    const response = await handle(new Request('http://localhost/api/poll?id=x'), null);
    expect(response.status).toBe(503);
  });
});

describe('storeFromEnv', () => {
  it('reads the Vercel names first, then the Upstash ones', () => {
    expect(storeFromEnv({})).toBeNull();
    expect(storeFromEnv({ KV_REST_API_URL: 'https://a', KV_REST_API_TOKEN: 't' })).not.toBeNull();
    expect(storeFromEnv({ UPSTASH_REDIS_REST_URL: 'https://a', UPSTASH_REDIS_REST_TOKEN: 't' })).not.toBeNull();
  });
});
