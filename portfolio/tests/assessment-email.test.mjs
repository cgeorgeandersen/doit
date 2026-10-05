/** The email adapters (src/assessment/email.ts). The stub sends nothing and keeps the form off the published site. */
import assert from 'node:assert/strict';
import { describe, it, mock } from 'node:test';
import { emailAdapter, looksLikeEmail, postJsonAdapter, stubAdapter } from '../src/assessment/email.ts';

const request = {
  email: 'reader@example.com',
  wantsNotes: false,
  resultUrl: 'https://www.georgeandersen.net/tools/how-boring-is-your-ai/results#v=1&m=d&a=012301230123012301',
  summary: { mode: 'department', stage: 'Alchemy', points: 27, max: 54, gaps: ['Trust & verification'], date: '2026-10-05' },
};

describe('the stub adapter', () => {
  it('is what the site uses until a real service is plugged in, and is hidden outside development', () => {
    assert.equal(emailAdapter.ready, false);
    assert.equal(stubAdapter(false).ready, false);
  });

  it('never sends anything', async () => {
    const log = mock.method(console, 'info', () => {});
    assert.deepEqual(await stubAdapter(true).send(request), { ok: true });
    assert.equal(log.mock.callCount(), 1);
    log.mock.restore();
  });
});

describe('postJsonAdapter', () => {
  it('posts the request as JSON', async () => {
    const fetcher = mock.fn(async () => new Response(null, { status: 204 }));
    const adapter = postJsonAdapter('/api/email-result', fetcher);
    assert.equal(adapter.ready, true);
    assert.deepEqual(await adapter.send(request), { ok: true });
    assert.deepEqual(fetcher.mock.calls[0].arguments, [
      '/api/email-result',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(request) },
    ]);
  });

  it('reports a failed answer or a network error instead of throwing', async () => {
    assert.deepEqual(await postJsonAdapter('/x', async () => new Response(null, { status: 500 })).send(request), {
      ok: false,
      error: 'The email service answered 500',
    });
    const offline = postJsonAdapter('/x', async () => {
      throw new TypeError('Failed to fetch');
    });
    assert.deepEqual(await offline.send(request), { ok: false, error: 'Failed to fetch' });
  });
});

describe('looksLikeEmail', () => {
  it('accepts ordinary addresses and rejects obvious typos', () => {
    for (const ok of ['a@b.co', ' first.last+tag@example.co.uk ']) assert.equal(looksLikeEmail(ok), true, ok);
    for (const bad of ['', 'name', 'name@', 'name@example', '@example.com', 'two words@example.com']) assert.equal(looksLikeEmail(bad), false, bad);
  });
});
