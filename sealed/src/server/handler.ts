import { claim, createPoll, join, myBallot, PollError, release, removeVoter, reveal, viewPoll, vote } from './polls.js';
import type { Store } from './store.js';

/**
 * The one endpoint, /api/poll.
 *
 * GET  /api/poll?id=…   the poll, who's voted, and the results once it's closed
 * POST /api/poll        { action, id, … } for everything else (see the switch below)
 *
 * The same function runs on Vercel (api/poll.ts) and in `npm run dev` (vite.config.ts).
 */
export async function handle(request: Request, store: Store | null): Promise<Response> {
  if (!store) {
    return json(503, {
      error: 'Voting isn’t set up on this site yet: it needs a Redis database. See the README.',
    });
  }
  try {
    if (request.method === 'GET') {
      const id = new URL(request.url).searchParams.get('id') ?? '';
      return json(200, await viewPoll(store, id));
    }
    if (request.method !== 'POST') return json(405, { error: 'Use GET or POST.' });

    const text = await request.text();
    if (text.length > 20_000) return json(413, { error: 'That’s too much to send at once.' });
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text) as Record<string, unknown>;
    } catch {
      return json(400, { error: 'The request wasn’t valid JSON.' });
    }
    const id = String(body.id ?? '');

    switch (body.action) {
      case 'create':
        return json(201, await createPoll(store, body.poll));
      case 'join':
        return json(200, await join(store, id, body.name));
      case 'claim':
        return json(200, await claim(store, id, body.voterId));
      case 'vote':
        return json(200, await vote(store, id, body.voterId, body.token, body.ballot));
      case 'myBallot':
        return json(200, { ballot: await myBallot(store, id, body.voterId, body.token) });
      case 'reveal':
        return json(200, await reveal(store, id, body.adminKey));
      case 'remove':
        return json(200, await removeVoter(store, id, body.adminKey, body.voterId));
      case 'release':
        return json(200, await release(store, id, body.adminKey, body.voterId));
      default:
        return json(400, { error: 'Unknown action.' });
    }
  } catch (error) {
    if (error instanceof PollError) return json(error.status, { error: error.message });
    console.error(error);
    return json(500, { error: 'Something went wrong on our side. Try again in a moment.' });
  }
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    // Votes change from second to second, and a poll is nobody else's business.
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
