import { describe, expect, it, vi } from 'vitest';
import { formatEmail, formatPhone, handleEstimate, parseEstimate } from '../src/server/estimate';

const good = {
  name: '  Dana   Reyes ',
  phone: '770.555.0199',
  email: '',
  address: '12 Oak St',
  town: 'Canton',
  services: ['minor-plumbing', 'drywall-repair'],
  details: 'Patch a hole\r\nFix the toilet',
  contact: 'call',
  company: '',
};

const env = { RESEND_API_KEY: 're_test', ESTIMATE_TO: 'owner@example.com' };

function post(body: unknown, headers: Record<string, string> = { 'Content-Type': 'application/json' }) {
  return new Request('https://example.com/api/estimate', { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });
}

describe('formatPhone', () => {
  it('accepts ten digits with any punctuation, and a leading 1', () => {
    expect(formatPhone('770-555-0199')).toBe('(770) 555-0199');
    expect(formatPhone('+1 (770) 555 0199')).toBe('(770) 555-0199');
  });
  it('rejects short numbers and ones starting with 0 or 1', () => {
    expect(formatPhone('555-0199')).toBeNull();
    expect(formatPhone('170-555-0199')).toBeNull();
  });
});

describe('parseEstimate', () => {
  it('cleans up a good ticket and orders services as the site lists them', () => {
    const r = parseEstimate(good);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.spam).toBe(false);
    expect(r.estimate).toEqual({
      name: 'Dana Reyes',
      phone: '(770) 555-0199',
      email: '',
      address: '12 Oak St',
      town: 'Canton',
      services: ['drywall-repair', 'minor-plumbing'],
      details: 'Patch a hole\nFix the toilet',
      contact: 'call',
    });
  });

  it.each([
    ['name', { ...good, name: ' ' }],
    ['phone', { ...good, phone: '12345' }],
    ['town', { ...good, town: '' }],
    ['email', { ...good, email: 'not-an-email' }],
    ['email', { ...good, contact: 'email', email: '' }],
    ['contact', { ...good, contact: 'pigeon' }],
    ['services', { ...good, services: ['roofing'] }],
    ['services', { ...good, services: 'drywall-repair' }],
    ['details', { ...good, services: [], details: '' }],
    ['details', { ...good, details: 'x'.repeat(4001) }],
  ])('rejects a bad %s', (field, body) => {
    const r = parseEstimate(body);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.field).toBe(field);
      expect(r.message.length).toBeGreaterThan(0);
    }
  });

  it('accepts a description with no boxes ticked', () => {
    expect(parseEstimate({ ...good, services: [] }).ok).toBe(true);
  });

  it('flags the hidden company field as spam', () => {
    const r = parseEstimate({ ...good, company: 'Acme SEO' });
    expect(r.ok && r.spam).toBe(true);
  });
});

describe('formatEmail', () => {
  it('names the services and keeps newlines out of the subject', () => {
    const r = parseEstimate({ ...good, name: 'Dana\nBcc: x@y.z' });
    if (!r.ok) throw new Error('expected a good ticket');
    const { subject, text } = formatEmail(r.estimate);
    expect(subject).not.toMatch(/[\r\n]/);
    expect(text).toContain('Type of work: Drywall Repair, Minor Plumbing');
    expect(text).toContain('Best way to reach: Call');
  });
});

describe('handleEstimate', () => {
  it('only takes POST', async () => {
    const res = await handleEstimate(new Request('https://example.com/api/estimate'), env);
    expect(res.status).toBe(405);
  });

  it('only takes JSON', async () => {
    expect((await handleEstimate(post('name=x', { 'Content-Type': 'application/x-www-form-urlencoded' }), env)).status).toBe(415);
    expect((await handleEstimate(post('{oops'), env)).status).toBe(400);
  });

  it('returns the reason for a bad ticket', async () => {
    const res = await handleEstimate(post({ ...good, phone: '' }), env);
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: 'phone' });
  });

  it('says so when email sending is not set up', async () => {
    const send = vi.fn();
    const res = await handleEstimate(post(good), {}, send);
    expect(res.status).toBe(503);
    expect(send).not.toHaveBeenCalled();
  });

  it('pretends to accept spam without sending it', async () => {
    const send = vi.fn();
    const res = await handleEstimate(post({ ...good, company: 'bot' }), env, send);
    expect(res.status).toBe(200);
    expect(send).not.toHaveBeenCalled();
  });

  it('emails the ticket through Resend', async () => {
    const send = vi.fn(async () => new Response('{"id":"1"}', { status: 200 }));
    const res = await handleEstimate(post({ ...good, email: 'dana@example.com' }), { ...env, ESTIMATE_TO: 'a@example.com, b@example.com' }, send);
    expect(res.status).toBe(200);
    expect(send).toHaveBeenCalledTimes(1);
    const [url, init] = send.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer re_test');
    const payload = JSON.parse(String(init.body));
    expect(payload.to).toEqual(['a@example.com', 'b@example.com']);
    expect(payload.reply_to).toBe('dana@example.com');
    expect(payload.from).toContain('onboarding@resend.dev');
    expect(payload.subject).toBe('Job ticket: Dana Reyes, Canton');
  });

  it('reports a failed send', async () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const send = vi.fn(async () => new Response('nope', { status: 422 }));
    expect((await handleEstimate(post(good), env, send)).status).toBe(502);
    const offline = vi.fn(async () => { throw new Error('offline'); });
    expect((await handleEstimate(post(good), env, offline)).status).toBe(502);
    quiet.mockRestore();
  });
});
