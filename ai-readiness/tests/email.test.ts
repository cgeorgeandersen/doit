import { describe, expect, it, vi } from 'vitest';
import { looksLikeEmail, postJsonAdapter, stubAdapter, type EmailRequest } from '../src/email/adapter.ts';

const request: EmailRequest = {
  email: 'reader@example.com',
  wantsNotes: false,
  resultUrl: 'https://example.com/results#v=1&m=d&a=012301230123012301',
  summary: { mode: 'department', stage: 'Alchemy', points: 27, max: 54, gaps: ['Trust & verification'], date: '2026-10-05' },
};

describe('stub adapter', () => {
  it('stays hidden unless told it is ready, and never sends anything', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    expect(stubAdapter(false).ready).toBe(false);
    expect(await stubAdapter(true).send(request)).toEqual({ ok: true });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});

describe('postJsonAdapter', () => {
  it('posts the request as JSON', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 204 }));
    const adapter = postJsonAdapter('/api/email-result', fetcher);
    expect(adapter.ready).toBe(true);
    expect(await adapter.send(request)).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledWith('/api/email-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });
  });

  it('reports a failed answer or a network error instead of throwing', async () => {
    expect(await postJsonAdapter('/x', async () => new Response(null, { status: 500 })).send(request)).toEqual({
      ok: false,
      error: 'The email service answered 500',
    });
    const offline = postJsonAdapter('/x', async () => {
      throw new TypeError('Failed to fetch');
    });
    expect(await offline.send(request)).toEqual({ ok: false, error: 'Failed to fetch' });
  });
});

describe('looksLikeEmail', () => {
  it('accepts ordinary addresses and rejects obvious typos', () => {
    for (const ok of ['a@b.co', ' first.last+tag@example.co.uk ']) expect(looksLikeEmail(ok), ok).toBe(true);
    for (const bad of ['', 'name', 'name@', 'name@example', '@example.com', 'two words@example.com']) expect(looksLikeEmail(bad), bad).toBe(false);
  });
});
